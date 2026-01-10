"use strict";

const fs = require("fs");
const path = require("path");
const repl = require("repl");
const { Readable } = require("stream");
const readline = require("readline");
const readlinePromise = require("readline/promises");

const noble = require("@abandonware/noble");
const hid = require("node-hid");
const OpenAI = require("openai");
const recorder = require("node-record-lpcm16");

process.loadEnvFile(".env");

const STATUS = {
  INITIAL: 0,
  READY: 1,
  BUSY: 2,
  STOP: 3,
};

const PACKET = {
  NONE: "none",
  DATA: "data",
  PROGRESS: "progress",
  COMPLETED: "completed",
  STOP: "stop",
  INVALID: "invalid",
};

const BODY = {
  NONE: "None",
  HEAD: "Head",
  LEFT_ARM: "Left Arm",
  RIGHT_ARM: "Right Arm",
  TORSO: "Torso",
};

const JOINT = {
  NONE: "None",
  HEAD: "Head",
  LEFT_SHOULDER: "Left Shoulder",
  RIGHT_SHOULDER: "Right Shoulder",
  LEFT_ARM: "Left Arm",
  RIGHT_ARM: "Right Arm",
  LEFT_HAND: "Left Hand",
  RIGHT_HAND: "Right Hand",
  LEFT_HIP: "Left Hip",
  RIGHT_HIP: "Right Hip",
  LEFT_THIGH: "Left Thigh",
  RIGHT_THIGH: "Right Thigh",
  LEFT_CALF: "Left Calf",
  RIGHT_CALF: "Right Calf",
  LEFT_ANKLE: "Left Ankle",
  RIGHT_ANKLE: "Right Ankle",
  LEFT_FOOT: "Left Foot",
  RIGHT_FOOT: "Right Foot",
};

const PROPERTIES = ["type", "timeout"];

/** @type {import('./robot')} */
module.exports = class Robot {
  constructor(code, options = {}) {
    this.code = code;
    this.name = code;
    this.folder = path.join(__dirname, code);
    this.config = {
      ...require(path.join(this.folder, options?.file ?? "robot")),
      ...options,
    };
    this.status = STATUS.INITIAL;
    this.body = BODY.NONE;
    this.joint = JOINT.NONE;
    this.#setup();
  }

  #setup() {
    for (const group in this.config.commands) {
      if (PROPERTIES.includes(group)) {
        continue;
      }
      for (const name in this.config.commands[group]) {
        if (PROPERTIES.includes(name)) {
          continue;
        }
        const command = this.config.commands[group][name];
        command.kind ??= PACKET.DATA;
        command.type ??= this.config.commands[group].type;
        command.name ??= name;
        command.group ??= group;
        command.data ??= `${group}/${name}`;
      }
    }
    for (const action of Object.values(this.actions())) {
      const functionName = this.#toCamelCase(action.name);
      this[functionName] ??= async (...args) => {
        return await this.action(action.name, ...args);
      };
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
    await noble.startScanningAsync([this.config.spec.serviceUuid], false);
    this.peripheral = await new Promise((resolve) => {
      noble.on("discover", async (peripheral) => {
        if (peripheral.advertisement.localName === this.config.name || peripheral.advertisement.localName?.includes(this.config.code)) {
          resolve(peripheral);
        }
      });
    });
    this.name = this.peripheral.advertisement.localName;
    await noble.stopScanningAsync();
    this.characteristic = await this.#connect();
    await this.wait(this.config.durations.announcement);
    this.log("Connected to", this.name);
    this.status = STATUS.READY;
  }

  async #connect() {
    await this.peripheral.connectAsync();
    const {
      characteristics: [characteristic],
    } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync([this.config.spec.serviceUuid], [this.config.spec.characteristicsUuid]);
    await characteristic.subscribeAsync();
    characteristic.on("data", (data) => {
      const packet = this.parsePacket(data);
      this.log(this.config.log.indent + "Response", packet.toLogString());
    });
    return characteristic;
  }

  async off(end = false) {
    if (this.status !== STATUS.INITIAL) {
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
      this.status = STATUS.INITIAL;
    }
    if (end) {
      // eslint-disable-next-line
      process.exit(0);
    }
  }

  async end() {
    await this.stop();
    return await this.off(true);
  }

  ready() {
    return this.status === STATUS.READY;
  }

  busy() {
    return this.status === STATUS.BUSY;
  }

  stopping() {
    return this.status === STATUS.STOP;
  }

  connected() {
    return this.status !== STATUS.INITIAL;
  }

  #checkConnected() {
    if (!this.connected()) {
      this.log("Not connected!");
      return false;
    }
    return true;
  }

  #check() {
    if (!this.#checkConnected()) {
      return false;
    }
    if (this.busy()) {
      this.log("Busy ...");
      return false;
    }
    if (!this.ready()) {
      this.log("Not ready!");
      return false;
    }
    return true;
  }

  async handshake() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.log("Handshake ...");
    return await this.call(this.config.commands.Handshake);
  }

  async version() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.log("Fetching version ...");
    return await this.call(this.config.commands.Version);
  }

  async date() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.log("Fetching date ...");
    return await this.call(this.config.commands.Date);
  }

  async state() {
    if (!this.#checkConnected()) {
      return;
    }
    this.log("Fetching state ...");
    const statePacket = await this.call(this.config.commands.State);
    const state = this.parseState(statePacket.bytes);
    this.log("State:", state);
    return state;
  }

  parseState(state) {
    const buffer = Buffer.from(state, "hex");
    const result = {};
    for (const [key, index] of Object.entries(this.config.states)) {
      result[key] = buffer[index];
    }
    return result;
  }

  async move(direction, time) {
    if (!this.#check()) {
      return false;
    }
    const moveCommand = this.config.commands.Move[direction];
    if (!moveCommand) {
      this.log("Unknown direction", direction);
      return;
    }
    if (time !== 0) {
      time ??= time ?? moveCommand.time;
      time = Math.min(Math.max(time, moveCommand.min), moveCommand.max);
    }
    this.log(`${direction} ...`);
    const move = this.perform({
      command: this.config.commands.Move[direction],
      receive: { kind: moveCommand.receive ?? PACKET.NONE },
      timeout: 0,
    });
    if (time > 0) {
      await Promise.race([move, this.wait(time)]);
      return await this.stop();
    }
    return move;
  }

  async moveForward(time) {
    return await this.move(this.config.directions.moveForward, time);
  }

  async moveBackward(time) {
    return await this.move(this.config.directions.moveBackward, time);
  }

  async turnLeft(time) {
    return await this.move(this.config.directions.turnLeft, time);
  }

  async turnRight(time) {
    return await this.move(this.config.directions.turnRight, time);
  }

  async moveLeft(time) {
    return await this.move(this.config.directions.moveLeft, time);
  }

  async moveRight(time) {
    return await this.move(this.config.directions.moveRight, time);
  }

  async moveBody(direction, time) {}

  async moveJoint(direction, time) {}

  async stop() {
    if (!this.#checkConnected()) {
      return;
    }
    if (this.stopping()) {
      return;
    }
    this.status = STATUS.STOP;
    this.log("Stopping ...");
    await this.call(this.config.commands.Stop, {
      type: this.config.types.handshake,
    });
    this.status = STATUS.READY;
    this.log("Stopped");
  }

  commands(group, name) {
    const commands = Object.fromEntries(Object.entries(this.config.commands[group] ?? {}).filter(([key]) => !["type"].includes(key)));
    if (name) {
      return commands[name];
    }
    return commands;
  }

  actions(name) {
    const actions = ["Action", "ProAction", "Move"].reduce((result, group) => {
      return {
        ...result,
        ...this.commands(group),
      };
    }, {});
    if (name) {
      return actions[name];
    }
    return actions;
  }

  async action(name, limited = false) {
    const action = this.actions(name);
    if (!action) {
      this.log("Unknown action", name);
      return;
    }
    if (action.check !== false && !this.#check()) {
      return;
    }
    if (action.stop) {
      return await this.stop();
    }
    if (action.call) {
      return await this[action.call]();
    }
    this.log(`Performing ${action.data} ...`);
    const timeout =
      (action?.duration > 0 ? action.duration + (this.config.durations.buffer ?? 0) : undefined) ?? action?.timeout ?? this.config.durations.timeout;
    const packet = await this.perform({
      command: action,
      receive: { kind: action.receive ?? PACKET.COMPLETED },
      limited,
      timeout,
    });
    if (action.receive !== PACKET.NONE) {
      this.log(`Finished ${action.data}`);
    }
    return packet;
  }

  async perform({ command, receive = {}, limited = false, check = true, block = true, wait = true, measure = true, timeout }) {
    if (check && !this.#check()) {
      return;
    }
    if (block) {
      this.status = STATUS.BUSY;
    }
    if (wait) {
      await this.wait(this.config.durations.warmup);
    }
    let received;
    if (receive && receive.kind !== PACKET.NONE) {
      receive.type ??= command.type;
      receive.kind ??= command.receive ?? PACKET.DATA;
      timeout ??= command.timeout ?? this.config.durations.timeout;
      received = new Promise((resolve) => {
        const handle =
          timeout > 0 &&
          setTimeout(() => {
            this.characteristic.off("data", fnData);
            this.log("Timeout");
            resolve();
          }, timeout);
        const fnData = (data) => {
          const packet = this.parsePacket(data);
          if (packet.kind === receive.kind && packet.type === receive.type) {
            if (handle) {
              clearTimeout(handle);
            }
            this.characteristic.off("data", fnData);
            resolve(packet);
          }
        };
        this.characteristic.on("data", fnData);
      });
    }
    let timedLimited;
    if (!received && limited) {
      if (command.time > 0) {
        timedLimited = new Promise((resolve) => {
          setTimeout(async () => {
            this.log("Time limit reached");
            await this.stop();
            resolve();
          }, command.time);
        });
      }
    }
    const start = measure && performance.now();
    await this.send(command);
    await timedLimited;
    const packet = await received;
    if (measure) {
      const elapsedMs = performance.now() - start;
      this.log(this.config.log.indent + "Elapsed", `${elapsedMs.toFixed(0)} ms`);
    }
    if (wait) {
      await this.wait(this.config.durations.cooldown);
    }
    if (block && (timedLimited || received)) {
      this.status = STATUS.READY;
    }
    return packet;
  }

  async call(command, receive, timeout, measure) {
    if (!this.#checkConnected()) {
      return;
    }
    return await this.perform({
      command,
      receive,
      check: false,
      block: false,
      wait: false,
      measure,
      timeout,
    });
  }

  async send(command) {
    return await this.characteristic.writeAsync(this.packetCommand(command), false);
  }

  packet(type, data) {
    // | header | numBytes | command | data | checksum |
    const headerBuffer = Buffer.from(this.config.spec.header, "hex");
    const typeBuffer = Buffer.from(type, "hex");
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(this.#encode(data), "utf8");
    const numBytesBuffer = Buffer.from([1 + dataBuffer.length + 1]); // command + data + checksum
    const bodyBuffer = Buffer.concat([numBytesBuffer, typeBuffer, dataBuffer]);
    const checksumBuffer = Buffer.from([this.checksum(bodyBuffer)]);
    return Buffer.concat([headerBuffer, bodyBuffer, checksumBuffer]);
  }

  packetString(type, data) {
    return this.packet(type, data).toString("hex");
  }

  packetCommand(command) {
    if (Buffer.isBuffer(command)) {
      return command;
    } else if (typeof command === "string") {
      return Buffer.from(command, "hex");
    }
    return this.packet(command.type, command.data ?? "");
  }

  packetCommandString(command) {
    return this.packetCommand(command).toString("hex");
  }

  parsePacket(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      return { kind: PACKET.INVALID, raw: buffer };
    }
    const hex = buffer.toString("hex");
    if (!hex.startsWith(this.config.spec.header) || hex.length < 10) {
      return { kind: PACKET.INVALID, raw: buffer };
    }
    const numBytes = parseInt(hex.slice(4, 6), 16);
    const body = hex.slice(4, 4 + numBytes * 2);
    const type = body.slice(2, 4);
    const data = body.slice(4);
    const checksum = hex.slice(-2);
    let kind = PACKET.DATA;
    const bytes = Buffer.from(data, "hex");
    let value = "";
    if (bytes.length === 1) {
      value = parseInt(data, 16);
    }
    if ([this.config.types.action, this.config.types.version, this.config.types.date].includes(type)) {
      if (bytes.length === 1) {
        kind = value === 100 ? PACKET.COMPLETED : PACKET.PROGRESS;
      } else if (bytes.length === 0) {
        kind = PACKET.STOP;
      } else {
        value = bytes.toString();
      }
    }
    const code = Object.keys(this.config.types).find((t) => this.config.types[t] === type) || "";
    return {
      kind,
      type,
      code,
      data: value,
      bytes,
      checksum,
      valid: parseInt(checksum, 16) === this.checksum(Buffer.from(body, "hex")),
      raw: buffer,
      toString: () => {
        return hex;
      },
      toLogString: () => {
        return `<packet kind=${kind} type=${type} (${code}) data=${value || bytes.toString("hex")}>`;
      },
    };
  }

  parsePacketString(text) {
    return this.parsePacket(Buffer.from(text, "hex"));
  }

  checksum(buffer) {
    return buffer.reduce((sum, b) => sum + b, 0) % 256;
  }

  #encode(data) {
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

  body(body) {
    this.body = Object.values(BODY).includes(body) ? body : BODY.NONE;
  }

  joint(joint) {
    this.joint = Object.values(JOINT).includes(joint) ? joint : JOINT.NONE;
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
            await this.stop();
          }
          const input = cmd.trim();
          if (input && input !== this.config.commands.Move.Stop.name) {
            await this.action(input);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
  }

  async voiceRepl() {
    const keyPressed = () =>
      new Promise((resolve) => {
        const onData = (data) => {
          cleanup();
          resolve(data.toString());
        };

        const cleanup = () => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once("data", onData);
      });

    while (true) {
      const controller = new AbortController();

      try {
        await Promise.race([
          keyPressed().then(async () => {
            controller.abort();
            await this.stop();
            await this.wait(this.config.durations.stop);
          }),
          this.voice({ signal: controller.signal }),
        ]);
      } finally {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }

      const rl = readlinePromise.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        await rl.question(`${this.name}> Press Enter to talk ...`);
      } catch {
        // Ctrl+C
        return;
      } finally {
        rl.close();
      }
    }
  }

  async voice({ signal } = {}) {
    const chunks = [];
    const recording = recorder.record();

    const calculateRMS = (buffer) => {
      let sum = 0;
      const samples = buffer.length / 2;
      for (let i = 0; i < buffer.length; i += 2) {
        const sample = buffer.readInt16LE(i);
        sum += sample * sample;
      }
      return Math.sqrt(sum / samples);
    };

    const hasVoice = (buffer) => {
      const options = this.config.recording.voice;
      const frameSizeBytes = Math.floor((options.sampleRate * options.frameMs) / 1000) * 2;
      let voicedMs = 0;
      for (let i = 0; i + frameSizeBytes <= buffer.length; i += frameSizeBytes) {
        const frame = buffer.subarray(i, i + frameSizeBytes);
        const rms = calculateRMS(frame);
        if (rms > options.rmsThreshold) {
          voicedMs += options.frameMs;
          if (voicedMs >= options.minVoicedMs) {
            return true;
          }
        }
      }
      return false;
    };

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
        if (signal?.aborted) {
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
        if (this.config.recording.stopOnSilence && now - startTime >= this.config.recording.minDuration) {
          if (calculateRMS(chunk) < this.config.recording.silenceThreshold) {
            silenceMs += chunkMs;
            if (silenceMs >= this.config.recording.silenceDuration) {
              this.log("Silence detected");
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

    if (signal?.aborted) {
      return;
    }

    const buffer = Buffer.concat(chunks);
    if (!hasVoice(buffer)) {
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

    if (signal?.aborted) {
      return;
    }

    return await this.prompt(transcription.text);
  }

  promptRepl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          if (this.busy()) {
            await this.stop();
          }
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

  async prompt(prompt) {
    const actions = Object.values(this.actions());
    const userPrompt = this.llm.userPrompt
      .replace("{{prompt}}", prompt)
      .replace(
        "{{actions}}",
        actions.map((action) => `- ${action.name} (description: ${action.description ?? ""}, duration: ${action.duration ?? "?"} ms)`).join("\n"),
      );
    const response = await this.llm.openai.chat.completions.create({
      model: this.config.llm.default,
      temperature: 0,
      messages: [
        { role: "system", content: this.llm.systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const responseMessage = response.choices[0].message.content;
    const responseObject = JSON.parse(responseMessage);
    const selectedActions = responseObject.actions.filter((responseAction) => actions.find((action) => action.name === responseAction.name));
    if (selectedActions.length > 0) {
      this.log("Matching actions:", selectedActions.map((action) => action.name).join(", "), "...");
      for (const action of selectedActions) {
        await this.action(action.name, true);
      }
    } else {
      this.log("No matching actions!");
    }
  }

  get llm() {
    return (this._llm ??= {
      openai: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      }),
      systemPrompt: fs.readFileSync(path.join(this.folder, this.config.llm.systemPrompt), "utf-8"),
      userPrompt: fs.readFileSync(path.join(this.folder, this.config.llm.userPrompt), "utf-8"),
    });
  }

  async control({ signal } = {}) {
    const trigger = async (event) => {
      try {
        if (this.busy()) {
          if (event.stop) {
            await this.stop();
          }
        } else {
          if (event.action) {
            await this.action(event.action);
          } else if (event.move) {
            await this.move(event.move, 0);
          } else if (event.moveBody) {
            await this.moveBody(event.moveBody, 0);
          } else if (event.body) {
            await this.body(event.body);
          } else if (event.joint) {
            await this.joint(event.joint);
          }
        }
      } catch (err) {
        this.log(err);
      }
    };

    const devices = hid.devices();
    let device;
    let controller;
    let controllerConfig = {};
    const configName = Object.keys(this.config.controller).find((name) => {
      controllerConfig = this.config.controller[name];
      device =
        devices.find((device) => device.product === controllerConfig.product || device.product === name) ||
        devices.find((device) => !!device.product && device.usagePage === controllerConfig.usagePage && device.usage === controllerConfig.usage);
      return device;
    });

    if (device) {
      this.log("Device found", configName);
      controller = new hid.HID(device.vendorId, device.productId);
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
        controller.on("data", (data) => {
          for (const name in config.buttons) {
            const button = config.buttons[name];
            const offset = parseInt(button.index);
            const value = (data[offset] & button.value) !== 0 ? 1 : 0;
            const previous = this.controller.buttons[name];
            this.controller.buttons[name] = value;
            if (!previous && value) {
              trigger(button);
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
            value = value === 0 ? 0 : value > 0 ? 1 : -1;
            const previous = this.controller.axes.states[name];
            this.controller.axes.states[name] = value;
            if (!previous && value) {
              trigger(axis);
            }
          }
        });
        controller.on("error", (err) => {
          this.log("Controller error", err);
        });
      }
    }
    if (!controller) {
      this.log("No controller found");
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const initial = Object.keys(this.config.keyboard.keys).reduce((result, key) => {
      result[key] = 0;
      return result;
    }, {});
    let releaseTimer = null;
    this.config.keyboard.states = { ...initial };
    process.stdin.on("keypress", async (str, key) => {
      if (key.ctrl && key.name === "c") {
        await this.end();
        return;
      }
      if (!(key.name in this.config.keyboard.keys)) {
        return;
      }

      this.config.keyboard.states = {
        ...initial,
        [key.name]: 1,
      };
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        this.config.keyboard.states = { ...initial };
      }, this.config.keyboard.release);
    });

    this.log("Keyboard control active");

    let controllerStates = {
      current: {},
      previous: {},
    };
    let keyboardStates = this.config.keyboard.states;

    while (true) {
      if (signal?.aborted) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        return;
      }

      if (this.controller) {
        for (const stickName in controllerConfig.sticks) {
          controllerStates.current[stickName] = { x: 0, y: 0, _: "" };
        }

        for (const axisName in controllerConfig.axes) {
          const axis = controllerConfig.axes[axisName];
          controllerStates.current[axis.stick][axis.direction] = this.controller.axes.states[axisName] || 0;
          controllerStates.current[axis.stick]._ +=
            `${controllerStates.current[axis.stick]._ ? "," : ""}${axis.direction}=${controllerStates.current[axis.stick][axis.direction]}`;
        }

        for (const stickName in controllerConfig.sticks) {
          const stick = controllerConfig.sticks[stickName];
          const currentControllerState = controllerStates.current[stickName];
          const previousControllerState = controllerStates.previous[stickName];
          if (stick[currentControllerState._] !== stick[previousControllerState?._]) {
            trigger(stick[currentControllerState._]);
            break;
          }
        }
        controllerStates.previous = { ...controllerStates.current };
      }

      let stop = false;
      if (this.busy()) {
        for (const name in this.config.keyboard.states) {
          if (keyboardStates[name] === 1 && this.config.keyboard.states[name] === 0) {
            await this.stop();
            stop = true;
            break;
          }
        }
      }

      if (!stop) {
        for (const name in this.config.keyboard.states) {
          if (keyboardStates[name] === 0 && this.config.keyboard.states[name] === 1) {
            trigger(this.config.keyboard.keys[name]);
            break;
          }
        }
      }

      keyboardStates = this.config.keyboard.states;

      await this.wait(this.config.durations.input);
    }
  }

  #toCamelCase(name) {
    return name
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join("");
  }

  async wait(milliseconds) {
    if (milliseconds > 0) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
  }

  log(...args) {
    if (this.config.log.verbose) {
      console.log(`< [${new Date().toISOString()}]`, ...args);
    }
  }
};
