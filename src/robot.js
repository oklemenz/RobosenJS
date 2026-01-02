"use strict";

const noble = require("@abandonware/noble");
const path = require("path");
const fs = require("fs");
const repl = require("repl");
const hid = require("node-hid");
const OpenAI = require("openai");
const { Readable } = require("stream");
const readline = require("readline");
const recorder = require("node-record-lpcm16");

process.loadEnvFile(".env");

const STATE = {
  INITIAL: 0,
  READY: 1,
  BUSY: 2,
};

const BODY = {
  NONE: "none",
  HEAD: "head",
  LEFT_ARM: "leftArm",
  RIGHT_ARM: "rightArm",
  TORSO: "torso",
};

module.exports = class Robot {
  constructor(name, options = {}) {
    this.name = name;
    this.folder = path.join(__dirname, "robot");
    this.config = {
      ...require(path.join(this.folder, name)),
      ...options,
    };
    this.state = STATE.INITIAL;
    this.selection = BODY.NONE;
    this.#setup();
  }

  #setup() {
    for (const type in this.config.commands) {
      if (type.startsWith("_")) {
        continue;
      }
      for (const name in this.config.commands[type]) {
        if (name.startsWith("_")) {
          continue;
        }
        const command = this.config.commands[type][name];
        command.kind = "data";
        command.typeName = type;
        command.name = name;
        command.data = `${type}/${name}`;
      }
    }
  }

  async on() {
    this.log("Waiting for Bluetooth powered on ...");
    await new Promise((resolve) => {
      noble.on("stateChange", (state) => {
        if (state === "poweredOn") {
          this.log("Bluetooth powered on");
          resolve(state);
        } else {
          this.log("Waiting for Bluetooth powered on from", state);
        }
      });
    });
    this.log("Scanning for", this.config.code, "...");
    await noble.startScanningAsync([this.config.serviceUuid], false);
    this.peripheral = await new Promise((resolve) => {
      noble.on("discover", async (peripheral) => {
        if (
          peripheral.advertisement.localName === this.config.name ||
          peripheral.advertisement.localName?.includes(this.config.code)
        ) {
          resolve(peripheral);
        }
      });
    });
    this.name = this.peripheral.advertisement.localName;
    await noble.stopScanningAsync();
    this.characteristic = await this.#connect();
    await this.wait(this.config.duration.announcement);
    this.log("Connected to", this.name);
    this.state = STATE.READY;
  }

  async off(end = false) {
    if (this.characteristic) {
      await this.characteristic.unsubscribeAsync();
      this.characteristic = null;
    }
    if (this.peripheral) {
      await this.peripheral.disconnectAsync();
      this.peripheral = null;
    }
    await noble.stopScanningAsync();
    noble.removeAllListeners();
    this.log("Disconnected from", this.name);
    this.state = STATE.INITIAL;
    if (end) {
      // eslint-disable-next-line
      process.exit(0);
    }
  }

  async end() {
    return this.off(true);
  }

  async #connect() {
    await this.peripheral.connectAsync();
    const {
      characteristics: [characteristic],
    } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [this.config.serviceUuid],
      [this.config.characteristicsUuid],
    );
    await characteristic.subscribeAsync();
    characteristic.on("data", (data) => {
      const packet = this.parsePacket(data);
      this.log(this.config.log.indent + "Response", packet.toString());
    });
    return characteristic;
  }

  ready() {
    return this.state === STATE.READY;
  }

  busy() {
    return this.state === STATE.BUSY;
  }

  commands(type, name) {
    const commands = Object.fromEntries(
      Object.entries(this.config.commands[type] ?? {}).filter(
        ([key]) => !key.startsWith("_"),
      ),
    );
    if (name) {
      return commands[name];
    }
    return commands;
  }

  actions(name) {
    const actions = ["Action", "ProAction"].reduce((result, type) => {
      return {
        ...result,
        ...this.commands(type),
      };
    }, {});
    if (name) {
      return actions[name];
    }
    return actions;
  }

  async action(name) {
    const command = this.actions(name);
    if (!command) {
      this.log("Unknown command", name);
      return;
    }
    this.log(`Performing ${command.data}`);
    const timeout =
      (command?.duration > 0
        ? command.duration + (this.config.duration.buffer ?? 0)
        : undefined) ??
      command?.timeout ??
      this.config.commands[command.typeName]._timeout ??
      this.config.duration.timeout;
    await this.perform(async () => {
      return await this.send(command);
    }, timeout);
    this.log(`Finished ${command.data}`);
  }

  async stop() {
    this.log("Stopping ...");
    await this.send(this.config.commands.Stop);
    this.state = STATE.READY;
  }

  async state() {
    this.log("Fetching state ...");
    await this.send(this.config.commands.State);
    this.state = STATE.READY;
  }

  async perform(callback, timeout) {
    if (this.busy()) {
      this.log("Busy ...");
      return;
    }
    if (!this.ready()) {
      this.log("Not ready!");
      return;
    }
    this.state = STATE.BUSY;
    await this.wait(this.config.duration.warmup);
    const done = new Promise((resolve) => {
      const handle = setTimeout(() => {
        this.characteristic.off("data", fnData);
        this.log("Timeout");
        resolve();
      }, timeout);
      const fnData = (data) => {
        const packet = this.parsePacket(data);
        if (packet.kind === "completed") {
          clearTimeout(handle);
          this.characteristic.off("data", fnData);
          resolve();
        }
      };
      this.characteristic.on("data", fnData);
    });
    const start = performance.now();
    await callback();
    await done;
    const elapsedMs = performance.now() - start;
    this.log(this.config.log.indent + "Elapsed", `${elapsedMs.toFixed(0)} ms`);
    await this.wait(this.config.duration.cooldown);
    this.state = STATE.READY;
  }

  async send(command) {
    return await this.characteristic.writeAsync(
      this.packetCommand(command),
      false,
    );
  }

  packetCommand(command) {
    const type =
      command.type ?? command._id ?? this.config.commands[command.typeName]._id;
    return this.packet(type, command.data ?? "");
  }

  packetCommandString(command) {
    return this.packetCommand(command).toString("hex");
  }

  packet(type, data) {
    // | header | numBytes | command | data | checksum |
    const headerBuffer = Buffer.from(this.config.header, "hex");
    const typeBuffer = Buffer.from(type, "hex");
    const dataBuffer = Buffer.from(this.encode(data), "utf8");
    const numBytesBuffer = Buffer.from([1 + dataBuffer.length + 1]); // command + data + checksum
    const bodyBuffer = Buffer.concat([numBytesBuffer, typeBuffer, dataBuffer]);
    const checksumBuffer = Buffer.from([this.checksum(bodyBuffer)]);
    return Buffer.concat([headerBuffer, bodyBuffer, checksumBuffer]);
  }

  encode(data) {
    if (data === true) {
      return [1];
    } else if (data === false) {
      return [0];
    }
    if (typeof data === "number") {
      return [data];
    }
    return data;
  }

  packetString(type, data) {
    return this.packet(type, data).toString("hex");
  }

  parsePacket(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      return { kind: "invalid", raw: buffer };
    }
    const hex = buffer.toString("hex");
    if (!hex.startsWith("ffff") || hex.length < 10) {
      return { kind: "invalid", raw: buffer };
    }
    const numBytes = parseInt(hex.slice(4, 6), 16);
    const body = hex.slice(4, 4 + numBytes * 2);
    const type = body.slice(2, 4);
    const data = body.slice(4);
    const checksum = hex.slice(-2);
    let kind = "data";
    const bytes = Buffer.from(data, "hex");
    let value = bytes.toString();
    if (bytes.length === 1) {
      value = parseInt(data, 16);
      kind = value === 100 ? "completed" : "progress";
    } else if (bytes.length === 0) {
      kind = "stop";
    }
    const command = {
      kind,
      type,
      data: value,
      bytes,
      checksum,
      valid: parseInt(checksum, 16) === this.checksum(Buffer.from(body, "hex")),
      raw: buffer,
      toString: () => {
        return `<packet kind=${kind} data=${value}>`;
      },
    };
    return command;
  }

  parsePacketString(text) {
    return this.parsePacket(Buffer.from(text, "hex"));
  }

  checksum(buffer) {
    return buffer.reduce((sum, b) => sum + b, 0) % 256;
  }

  async wait(milliseconds) {
    if (milliseconds > 0) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
  }

  selection(part) {
    this.selection = Object.values(BODY).includes(part) ? part : BODY.NONE;
  }

  repl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      completer: (line, callback) => {
        const keys = Object.keys(this.actions());
        const hits = keys.filter((k) => k.startsWith(line));
        callback(null, [hits.length ? hits : keys, line]);
      },
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          if (this.busy()) {
            return await this.stop();
          }
          const input = cmd.trim();
          if (input) {
            await this.action(input);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
  }

  promptRepl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          const input = cmd.trim();
          if (input) {
            await this.prompt(input);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
  }

  async voiceRepl() {
    while (true) {
      await this.voice();
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      await new Promise((resolve) => {
        rl.question(`${this.name}> Press Enter to talk ...`, () => {
          rl.close();
          resolve();
        });
      });
    }
  }

  async prompt(prompt) {
    const actions = Object.keys(this.actions());
    const userPrompt = this.llm.userPrompt
      .replace("{{prompt}}", prompt)
      .replace(
        "{{actions}}",
        actions.map((action) => `- ${action}`).join("\n"),
      );
    const response = await this.llm.openai.chat.completions.create({
      model: this.config.llm.default,
      temperature: 0,
      messages: [
        { role: "system", content: this.llm.systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = response.choices[0].message.content;
    const parsed = JSON.parse(raw);
    const validatedActions = parsed.actions.filter((a) =>
      actions.includes(a.name),
    );
    this.log(
      "Performing:",
      validatedActions.map((action) => action.name).join(", "),
    );
    for (const action of validatedActions) {
      await this.action(action.name);
    }
  }

  async voice() {
    const chunks = [];
    const recording = recorder.record();

    function calculateRMS(buffer) {
      let sum = 0;
      const samples = buffer.length / 2;
      for (let i = 0; i < buffer.length; i += 2) {
        const sample = buffer.readInt16LE(i);
        sum += sample * sample;
      }
      return Math.sqrt(sum / samples);
    }

    await new Promise((resolve) => {
      let started = false;
      let stopped = false;
      let silenceMs = 0;
      let startTime = Date.now();
      let lastChunkTime = Date.now();

      recording.stream().on("data", (chunk) => {
        if (stopped) {
          return;
        }

        chunks.push(chunk);
        const now = Date.now();
        const chunkMs = now - lastChunkTime;
        lastChunkTime = now;

        if (!started) {
          if (now - startTime < this.config.recording.warmup) {
            return;
          }
          started = true;
          startTime = Date.now();
          this.log("Listening ...");
        }

        if (now - startTime >= this.config.recording.maxDuration) {
          this.log("Processing ...");
          stopped = true;
          recording.stop();
          resolve();
        }
        if (
          this.config.recording.stopOnSilence &&
          now - startTime >= this.config.recording.minDuration
        ) {
          if (calculateRMS(chunk) < this.config.recording.silenceThreshold) {
            silenceMs += chunkMs;
            if (silenceMs >= this.config.recording.silenceDuration) {
              this.log("Silence detected. Processing ...");
              stopped = true;
              recording.stop();
              resolve();
            }
          } else {
            silenceMs = 0;
          }
        }
      });
    });

    await new Promise((resolve) => {
      recording.stream().once("close", resolve);
    });

    const buffer = Buffer.concat(chunks);
    if (calculateRMS(buffer) < this.config.recording.silenceThreshold) {
      this.log("No voice detected");
      return;
    }

    const stream = Readable.from(buffer);
    stream.path = "prompt.wav";
    this.log("Transcribing ...");
    const transcription = await this.llm.openai.audio.transcriptions.create({
      file: stream,
      model: this.config.llm.voice,
    });
    this.log("Recognized:", transcription.text);
    return await this.prompt(transcription.text);
  }

  control() {
    const devices = hid.devices();
    let device;
    const configName = Object.keys(this.config.controller).find((name) => {
      const config = this.config.controller[name];
      device = devices.find(
        (device) =>
          !!device.product &&
          device.usagePage === config.usagePage &&
          device.usage === config.usage,
      );
      return device;
    });
    if (device) {
      this.log("Device found", configName);
      const controller = new hid.HID(device.vendorId, device.productId);
      if (controller) {
        this.log("Controller connected:", controller.getDeviceInfo().product);
        const config = this.config.controller[configName];
        this.controller = {
          buttons: {},
          axes: {
            values: {},
            states: {},
          },
        };
        controller.on("data", async (data) => {
          for (const name in config.buttons) {
            const button = config.buttons[name];
            const offset = parseInt(button.index);
            const value = (data[offset] & button.value) !== 0 ? 1 : 0;
            const previous = this.controller.buttons[name];
            this.controller.buttons[name] = value;
            if (!previous && value) {
              if (button.action) {
                await this.action(button.action);
              } else if (button.selection) {
                this.selection(button.selection);
              }
            }
          }
          for (const name in config.axes) {
            const axis = config.axes[name];
            const offset = parseInt(axis.index);
            let value = data[offset];
            if (axis.extend === 4) {
              value = value | ((data[offset + 1] & 0x0f) << 8);
            } else if (axis.extend === -4) {
              value = (data[offset - 1] >> 4) | (value << 4);
            }
            if (Math.abs(axis.extend) === 4) {
              value = (value - 2048) / 2048;
            } else {
              value = (value - 128) / 128;
            }
            value = Math.max(-1, Math.min(1, value));
            if (Math.abs(value) < config.deadZone) {
              value = 0;
            }
            this.controller.axes.values[name] = value;
            this.controller.axes.states[name] =
              value === 0 ? 0 : value > 0 ? 1 : -1;
          }
        });
        controller.on("error", (err) => {
          this.log("Controller error", err);
        });
        return;
      }
    }
    this.log("No controller found");
  }

  get llm() {
    return (this._llm ??= {
      openai: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      }),
      systemPrompt: fs.readFileSync(
        path.join(this.folder, this.config.llm.systemPrompt),
        "utf-8",
      ),
      userPrompt: fs.readFileSync(
        path.join(this.folder, this.config.llm.userPrompt),
        "utf-8",
      ),
    });
  }

  log(...args) {
    if (this.config.log.verbose) {
      console.log(`< [${new Date().toISOString()}]`, ...args);
    }
  }
};
