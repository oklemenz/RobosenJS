"use strict";

const noble = require("@abandonware/noble");
const path = require("path");
const repl = require("repl");

const STATE = {
  INITIAL: 0,
  READY: 1,
  BUSY: 2,
};

module.exports = class Robot {
  constructor(name, options = {}) {
    this.config = require(path.join(process.cwd(), "robot", name));
    this.options = options;
    this.options.verbose = this.options.verbose ?? true;
    this.state = STATE.INITIAL;
  }

  async start() {
    await new Promise((resolve, reject) => {
      noble.on("stateChange", (state) => {
        if (state === "poweredOn") {
          resolve(state);
        } else {
          reject(new Error(`Bluetooth not powered on - state: ${state}`));
        }
      });
    });
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
    await noble.stopScanningAsync();
    this.characteristic = await this.connect();
    await this.wait(2000); // Wait for announcement
    this.log("Connected to", this.peripheral.advertisement.localName);
    this.state = STATE.READY;
  }

  async stop() {
    const name = this.peripheral.advertisement.localName;
    if (this.characteristic) {
      await this.characteristic.unsubscribeAsync().catch(() => {});
      this.characteristic = null;
    }
    if (this.peripheral) {
      await this.peripheral.disconnectAsync().catch(() => {});
      this.peripheral = null;
    }
    await noble.stopScanningAsync().catch(() => {});
    this.log("Disconnected from", name);
    this.state = STATE.INITIAL;
  }

  async connect() {
    await this.peripheral.connectAsync();
    const {
      characteristics: [characteristic],
    } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [this.config.serviceUuid],
      [this.config.characteristicsUuid],
    );
    await characteristic.subscribeAsync();
    return characteristic;
  }

  commands(name) {
    const allCommands = this.config.commands.ProAction;
    const commands = Object.fromEntries(
      Object.entries(allCommands).filter(([key]) => !key.startsWith("_")),
    );
    if (name) {
      return commands[name];
    }
    return commands;
  }

  repl() {
    const r = repl.start({
      prompt: `${this.config.name}> `,
      useColors: true,
      ignoreUndefined: true,
      completer: (line, callback) => {
        const keys = Object.keys(this.commands());
        const hits = keys.filter((k) => k.startsWith(line));
        callback(null, [hits.length ? hits : keys, line]);
      },
      eval: async (cmd, context, filename, callback) => {
        const input = cmd.trim();
        if (input) {
          await this.perform(input);
        }
        callback(null);
      },
    });
  }

  async perform(action) {
    const command = this.commands(action);
    if (!command) {
      this.log("Unknown command");
      return;
    }
    if (this.state !== STATE.READY) {
      this.log("Not ready");
      return;
    }
    this.log(`Performing action: ProAction/${action}`);
    const type = this.config.commands.ProAction._type;
    const data = this.createPacket(type, `ProAction/${action}`);
    await this.performAwaited(async () => {
      await this.characteristic.writeAsync(data, false);
    });
    this.log(`Action finished: ProAction/${action}`);
  }

  async performAwaited(callback) {
    const startPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.characteristic.off("data", fnData);
        reject(new Error("Action timeout (start)"));
      }, this.config.timeout);
      const fnData = (data) => {
        if (data.toString("hex", 0, 5) === this.config.commands._start) {
          clearTimeout(timeout);
          this.characteristic.off("data", fnData);
          resolve();
        }
      };
      this.characteristic.on("data", fnData);
    });
    const endPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.characteristic.off("data", fnData);
        reject(new Error("Action timeout (end)"));
      }, this.config.timeout);
      const fnData = (data) => {
        if (data.toString("hex", 0, 5) === this.config.commands._end) {
          clearTimeout(timeout);
          this.characteristic.off("data", fnData);
          resolve();
        }
      };
      this.characteristic.on("data", fnData);
    });

    await callback();
    await startPromise;
    await endPromise;
  }

  createPacket(command, data) {
    // | header | numBytes | command| data | checksum |
    const headerBuffer = Buffer.from(this.config.header, "hex");
    const commandBuffer = Buffer.from(command, "hex");
    const dataBuffer = Buffer.from(data, "utf8");
    const numBytesBuffer = Buffer.from([1 + dataBuffer.length + 1]); // command + data + checksum
    const packetWithoutHeader = Buffer.concat([
      numBytesBuffer,
      commandBuffer,
      dataBuffer,
    ]);
    const checksum = packetWithoutHeader.reduce((sum, b) => sum + b, 0) % 256;
    const checksumBuffer = Buffer.from([checksum]);
    return Buffer.concat([headerBuffer, packetWithoutHeader, checksumBuffer]);
  }

  async wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  log(...args) {
    if (this.options.verbose) {
      console.log(`< [${new Date().toISOString()}]`, ...args);
    }
  }
};
