"use strict";

const noble = require("@abandonware/noble");
const path = require("path");
const repl = require("repl");
const hid = require("node-hid");

const STATE = {
  INITIAL: 0,
  READY: 1,
  BUSY: 2,
};

module.exports = class Robot {
  constructor(name, options = {}) {
    this.name = name;
    this.config = require(path.join(__dirname, "robot", name));
    this.options = options;
    this.#setup();
    this.state = STATE.INITIAL;
  }

  #setup() {
    this.options.verbose = this.config.verbose ?? false;
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
        command.type = type;
        command.name = name;
        command.data = `${type}/${name}`;
      }
    }
    this.controller = {
      buttons: {},
      axes: {
        values: {},
        states: {},
      },
    };
  }

  async start() {
    this.log("Waiting for Bluetooth powered on...");
    await new Promise((resolve) => {
      noble.on("stateChange", (state) => {
        if (state === "poweredOn") {
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
    if (this.config.announcementDelay > 0) {
      await this.wait(this.config.announcementDelay);
    }
    this.log("Connected to", this.name);
    this.state = STATE.READY;
  }

  async stop() {
    if (this.characteristic) {
      await this.characteristic.unsubscribeAsync().catch(() => {});
      this.characteristic = null;
    }
    if (this.peripheral) {
      await this.peripheral.disconnectAsync().catch(() => {});
      this.peripheral = null;
    }
    await noble.stopScanningAsync().catch(() => {});
    this.log("Disconnected from", this.name);
    this.state = STATE.INITIAL;
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
      this.log("Response", packet);
    });
    return characteristic;
  }

  commands(type, name) {
    const allCommands = this.config.commands[type] ?? {};
    const commands = Object.fromEntries(
      Object.entries(allCommands).filter(([key]) => !key.startsWith("_")),
    );
    if (name) {
      return commands[name];
    }
    return commands;
  }

  actions(name) {
    return this.commands(this.config.action, name);
  }

  repl() {
    const r = repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      completer: (line, callback) => {
        const keys = Object.keys(this.actions());
        const hits = keys.filter((k) => k.startsWith(line));
        callback(null, [hits.length ? hits : keys, line]);
      },
      eval: async (cmd, context, filename, callback) => {
        const input = cmd.trim();
        if (input) {
          await this.action(input);
        }
        callback(null);
      },
    });
  }

  async action(name) {
    const command = this.actions(name);
    if (!command) {
      this.log("Unknown command", name);
      return;
    }
    this.log(`Performing ${command.data}`);
    const timeout =
      command?.timeout ??
      this.config.commands._timeout ??
      this.config.commands[command.type]._timeout ??
      this.config.timeout;
    await this.perform(async () => {
      await this.send(command);
    }, timeout);
    this.log(`Finished ${command.data}`);
  }

  async perform(callback, timeout) {
    if (this.state !== STATE.READY) {
      this.log("Not ready");
      return;
    }
    this.state = STATE.BUSY;
    const done = new Promise((resolve) => {
      const handle = setTimeout(() => {
        this.characteristic.off("data", fnData);
        this.log("Timeout");
        resolve();
      }, timeout);
      const fnData = (data) => {
        const packet = this.parsePacket(data);
        if (packet.kind === "start") {
          this.log("Start");
        } else if (packet.kind === "end") {
          this.log("End");
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
    this.log("Elapsed", `${elapsedMs.toFixed(0)} ms`);
    this.state = STATE.READY;
  }

  async send(command) {
    await this.characteristic.writeAsync(this.packetCommand(command), false);
  }

  packetCommand(command) {
    const type = command.type ?? this.config.commands[command.type]._type;
    return this.packet(type, command.data);
  }

  packetCommandString(command) {
    return this.packetCommand(command).toString("hex");
  }

  packet(type, data) {
    // | header | numBytes | command | data | checksum |
    const headerBuffer = Buffer.from(this.config.header, "hex");
    const typeBuffer = Buffer.from(type, "hex");
    const dataBuffer = Buffer.from(data, "utf8");
    const numBytesBuffer = Buffer.from([1 + dataBuffer.length + 1]); // command + data + checksum
    const bodyBuffer = Buffer.concat([numBytesBuffer, typeBuffer, dataBuffer]);
    const checksumBuffer = Buffer.from([this.checksum(bodyBuffer)]);
    return Buffer.concat([headerBuffer, bodyBuffer, checksumBuffer]);
  }

  packetString(type, data) {
    return this.packet(type, data).toString("hex");
  }

  parsePacket(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      return { kind: "invalid", raw: buffer };
    }
    let kind = "data";
    const hex = buffer.toString("hex");
    if (!hex.startsWith("ffff") || hex.length < 10) {
      return { kind: "invalid", raw: buffer };
    }
    const numBytes = parseInt(hex.slice(4, 6), 16);
    const body = hex.slice(4, 4 + numBytes * 2);
    const type = body.slice(2, 4);
    const data = body.slice(4);
    const checksum = hex.slice(-2);
    if (data === this.config.commands._start) {
      kind = "start";
    } else if (data === this.config.commands._end) {
      kind = "end";
    }
    const command = {
      kind,
      type,
      data: Buffer.from(data, "hex").toString(),
      checksum,
      valid: parseInt(checksum, 16) === this.checksum(Buffer.from(body, "hex")),
      raw: buffer,
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
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
        controller.on("data", (data) => {
          for (const location in config.buttons) {
            for (const button in config.buttons[location]) {
              const bit = config.buttons[location][button];
              const offset = parseInt(location);
              this.controller.buttons[button] =
                (data[offset] & bit) !== 0 ? 1 : 0;
            }
          }
          for (const location in config.axes) {
            for (const axis in config.axes[location]) {
              const bit = config.axes[location][axis];
              const offset = parseInt(location);
              let value = data[offset];
              if (bit === 1) {
                value = value | ((data[offset + 1] & 0x0f) << 8);
              } else if (bit === -1) {
                value = (data[offset - 1] >> 4) | (value << 4);
              }
              if (bit === 0) {
                value = (value - 128) / 128;
              } else {
                value = (value - 2048) / 2048;
              }
              value = Math.max(-1, Math.min(1, value));
              if (Math.abs(value) < config.deadzone) {
                value = 0;
              }
              this.controller.axes.values[axis] = value;
              this.controller.axes.states[axis] =
                value === 0 ? 0 : value > 0 ? 1 : -1;
            }
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

  log(...args) {
    if (this.options.verbose) {
      console.log(`< [${new Date().toISOString()}]`, ...args);
    }
  }
};
