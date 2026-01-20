"use strict";

const fs = require("fs");
const path = require("path");
const repl = require("repl");
const { Readable } = require("stream");
const readline = require("readline");
const readlinePromise = require("readline/promises");

const hid = require("node-hid");
const noble = require("@abandonware/noble");
const recorder = require("node-record-lpcm16");
const OpenAI = require("openai");

process.loadEnvFile(".env");

const CONFIG_FILE = "robot";

const BLE = {
  STATE_CHANGE: "stateChange",
  POWERED_ON: "poweredOn",
  DISCOVER: "discover",
  DATA: "data",
};

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

const LOG_LEVEL = {
  error: 0,
  warning: 1,
  info: 2,
  verbose: 3,
};

/** @type {import('./robot')} */
module.exports = class Robot {
  constructor(code = "", options = {}) {
    this.folder = path.join(__dirname, code);
    this.config = {
      spec: {},
      log: {
        active: true,
        level: LOG_LEVEL.verbose,
      },
      duration: {},
      state: {},
      type: {},
      body: {},
      joint: {},
      direction: {},
      command: {},
      llm: {},
      recording: {},
      controller: {},
      keyboard: {},
    };
    this.config = { ...this.config, ...this.#loadConfig(options), ...options };
    this.code = this.config.code ?? code;
    this.name = this.config.name ?? this.code;
    this.status = STATUS.INITIAL;
    this.selectedBody = undefined;
    this.selectedJoint = undefined;
    this.#link();
  }

  #loadConfig(options) {
    let fileName = options?.file ?? CONFIG_FILE;
    fileName += !fileName.endsWith(".json") ? ".json" : "";
    const filePath = path.join(this.folder, fileName);
    try {
      const config = fs.readFileSync(filePath, "utf8");
      return JSON.parse(config);
    } catch (error) {
      this.logError("Cannot load configuration at", filePath, error.message ?? error);
    }
  }

  #link() {
    this.#propagate();
    for (const group in this.config.command) {
      const groupConfig = this.config.command[group];
      if (!groupConfig.group) {
        continue;
      }
      for (const name in groupConfig) {
        const command = groupConfig[name];
        if (!this.#isObject(command)) {
          continue;
        }
        command.kind ??= PACKET.DATA;
        command.name ??= name;
        command.group ??= group;
        if (groupConfig.derive) {
          command.data ??= `${group}/${name}`;
        }
        for (const key in groupConfig) {
          if (["group", "derive"].includes(key)) {
            continue;
          }
          const value = groupConfig[key];
          if (!this.#isObject(value)) {
            command[key] ??= value;
          }
        }
      }
    }
    for (const command of Object.values(this.commands())) {
      const functionName = this.#toCamelCase(command.name);
      this[functionName] ??= async (...args) => {
        return await this.command(command.name, args);
      };
    }
    this.jointsInitial = Object.values(this.config.joint).reduce((result, joint) => {
      result[joint.name] = joint.value;
      return result;
    }, {});
    this.jointsCurrent = { ...this.jointsInitial };
  }

  #propagate() {
    for (const section in this.config) {
      const sectionConfig = this.config[section];
      if (this.#isObject(sectionConfig)) {
        for (const name in sectionConfig) {
          const entry = sectionConfig[name];
          if (this.#isObject(entry)) {
            entry.name ??= name;
          }
        }
      }
    }
  }

  async on() {
    this.logInfo("Waiting for Bluetooth powered on ...");
    const discoverPromise = new Promise((resolve) => {
      noble.on(BLE.DISCOVER, async (peripheral) => {
        if (peripheral.advertisement.localName === this.name || peripheral.advertisement.localName?.includes(this.code)) {
          resolve(peripheral);
        }
      });
    });
    await new Promise((resolve) => {
      noble.on(BLE.STATE_CHANGE, (state) => {
        if (state === BLE.POWERED_ON) {
          this.logInfo("Bluetooth powered on");
          resolve(state);
        } else {
          this.logInfo("Waiting for Bluetooth powered on from", state);
        }
      });
    });
    this.logInfo("Scanning for", this.config.code, "...");
    await noble.startScanningAsync([this.config.spec.serviceUuid], false);
    this.peripheral = await discoverPromise;
    this.name = this.peripheral.advertisement.localName;
    await noble.stopScanningAsync();
    this.characteristic = await this.#connect();
    await this.wait(this.config.duration?.announcement);
    this.logInfo("Connected to", this.name);
    this.status = STATUS.READY;
  }

  async #connect() {
    await this.peripheral.connectAsync();
    const {
      characteristics: [characteristic],
    } = await this.peripheral.discoverSomeServicesAndCharacteristicsAsync(
      [this.config.spec.serviceUuid],
      [this.config.spec.characteristicsUuid],
    );
    await characteristic.subscribeAsync();
    characteristic.on(BLE.DATA, (data) => {
      const packet = this.parsePacket(data);
      if (this.config.log?.traffic) {
        this.log(`${this.config.log.mark ?? ""}Received`, this.config.log.traffic === "hex" ? packet.raw.toString("hex") : packet.raw);
      }
      this.logVerbose(`${this.config.log?.indent ?? ""}Response`, packet.toLogString());
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
      this.logInfo("Disconnected from", this.name);
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

  connected() {
    return this.status !== STATUS.INITIAL;
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

  #checkConnected() {
    if (!this.connected()) {
      this.logWarning("Not connected!");
      return false;
    }
    return true;
  }

  #check() {
    if (!this.#checkConnected()) {
      return false;
    }
    if (this.busy()) {
      this.logInfo("Busy ...");
      return false;
    }
    if (!this.ready()) {
      this.logWarning("Not ready!");
      return false;
    }
    return true;
  }

  async handshake() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Handshake ...");
    await this.call(this.config.command.System.Handshake);
  }

  async stop() {
    if (!this.connected() || !this.busy() || this.stopping()) {
      return;
    }
    this.status = STATUS.STOP;
    this.logVerbose("Stopping ...");
    await this.call(this.config.command.System.Stop, {
      type: this.config.type.handshake.code,
    });
    this.status = STATUS.READY;
    this.logVerbose("Stopped");
  }

  async shutdown() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logInfo("Shutdown!");
    await this.call(this.config.command.System.Shutdown);
  }

  async initialPosition(norm = false) {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Initial position ...");
    return await this.moveJoints(this.jointsInitial, this.config.command["Initial Position"]?.speed ?? 40, norm);
  }

  async moveJoints(joints, speed, norm = false) {
    joints = { ...this.jointsCurrent, ...joints };
    joints.speed = speed ?? 30;
    Object.keys(joints).forEach((name) => {
      if (isNaN(joints[name])) {
        joints[name] = this.jointsCurrent[name] ?? this.config.joint[name].value;
      }
      joints[name] = Math.min(Math.max(joints[name], this.config.joint[name].min), this.config.joint[name].max);
    }, {});
    await this.call({
      type: this.config.type.jointMove,
      data: joints,
    });
    this.jointsCurrent = { ...joints };
    if (norm) {
      Object.keys(this.config.joint).forEach((name) => {
        const jointConfig = this.config.joint[name];
        if (jointConfig.norm !== false) {
          joints[name] -= jointConfig.value;
        }
      });
    }
    return joints;
  }

  async moveJointsDelta(deltas, speed, norm = false) {
    const joints = { ...this.jointsCurrent };
    Object.keys(deltas).forEach((name) => {
      joints[name] += deltas?.[name] ?? 0;
    }, {});
    return await this.moveJoints(joints, speed, norm);
  }

  async moveJointsNorm(joints, speed) {
    joints = { ...joints };
    Object.keys(this.config.joint).forEach((name) => {
      const jointConfig = this.config.joint[name];
      if (jointConfig.norm !== false) {
        joints[name] += jointConfig.value;
      }
    });
    return await this.moveJoints(joints, speed, true);
  }

  async moveJoint(name, value, speed) {
    const joint = this.config.joint[name];
    if (!joint) {
      return;
    }
    let move = false;
    const joints = {};
    if (this.#isSetString(value)) {
      if (value.endsWith("%")) {
        value = value.trim().slice(0, -1);
        if (value.startsWith("+") || value.startsWith("-")) {
          const percent = Math.min(Math.max(parseInt(value), -100), 100);
          joints[joint.name] = (this.jointsCurrent[joint.name] ?? joint.value) + (percent / 100) * (joint.max - joint.min);
        } else {
          const percent = Math.min(Math.max(parseInt(value), 0), 100);
          joints[joint.name] = joint.min + (percent / 100) * (joint.max - joint.min);
        }
        move = true;
      } else {
        joints[joint.name] = (this.jointsCurrent[joint.name] ?? joint.value) + parseInt(value);
        move = true;
      }
    } else {
      if (value < 0) {
        joints[joint.name] = (this.jointsCurrent[joint.name] ?? joint.value) + value;
        move = true;
      } else {
        joints[joint.name] = value ?? joint.value;
        move = true;
      }
    }
    if (move) {
      return await this.moveJoints(joints, speed);
    }
  }

  async headCenter(speed, norm = false) {
    const command = this.config.command.Joint["Head Center"];
    const joints = { ...this.jointsCurrent };
    joints[this.config.joint.head.name] = this.config.joint.head.value;
    return await this.moveJoints(joints, speed ?? command?.speed, norm);
  }

  async headLeft(speed, norm = false) {
    const command = this.config.command.Joint["Head Left"];
    const joints = { ...this.jointsCurrent };
    joints[this.config.joint.head.name] = this.config.joint.head.min;
    return await this.moveJoints(joints, speed ?? command?.speed, norm);
  }

  async headRight(speed, norm = false) {
    const command = this.config.command.Joint["Head Right"];
    const joints = { ...this.jointsCurrent };
    joints[this.config.joint.head.name] = this.config.joint.head.max;
    return await this.moveJoints(joints, speed ?? command?.speed, norm);
  }

  async lockJoint(joint) {
    // TODO: Implement
  }

  async unlockJoint(joint) {
    // TODO: Implement
  }

  async lockAllJoints() {
    // TODO: Implement
  }

  async unlockAllJoints() {
    // TODO: Implement
  }

  async program() {
    // TODO: Implement
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Programming mode activated ...");
    const packet = await this.call(
      {
        type: this.config.type.program.code,
      },
      {
        kind: PACKET.DATA,
      },
    );
    if (packet?.joint) {
      this.jointsCurrent = { ...packet.joint };
    }
    return this.jointsCurrent;
  }

  async jointSync() {
    // TODO: Implement
    // Record into a buffer ?
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Fetching joint positions ...");
    const packet = await this.call(
      {
        type: this.config.type.jointFetch.code,
      },
      {
        kind: PACKET.DATA,
      },
    );
    return packet?.data;
  }

  async kind() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Fetching kind ...");
    const packet = await this.call(this.config.command.Info.Kind);
    return packet?.data;
  }

  async version() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Fetching version ...");
    const packet = await this.call(this.config.command.Info.Version);
    return packet?.data;
  }

  async date() {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logVerbose("Fetching date ...");
    const packet = await this.call(this.config.command.Info.Date);
    return packet?.data;
  }

  async state() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Fetching state ...");
    const packet = await this.call(this.config.command.Info.State);
    return packet?.state;
  }

  async toggle(type, value) {
    if (!this.#checkConnected()) {
      return;
    }
    type = type?.code ?? type;
    const typeConfig = this.#typeConfig(type);
    if (!typeConfig) {
      this.logWarning("Unknown type", type);
    }
    if (!typeConfig.toggle) {
      this.logWaning("Not a toggle type", type);
    }
    value = !!value;
    this.logInfo("Setting", typeConfig.name, "to", value);
    await this.call(
      { type, data: value },
      {
        kind: PACKET.NONE,
      },
    );
  }

  async autoStand(value) {
    return await this.toggle(this.config.type.autoStand, value);
  }

  async autoOff(value) {
    return await this.toggle(this.config.type.autoOff, value);
  }

  async autoTurn(value) {
    return await this.toggle(this.config.type.autoTurn, value);
  }

  async autoPose(value) {
    return await this.toggle(this.config.type.autoPose, value);
  }

  async list(type) {
    if (!this.#checkConnected()) {
      return;
    }
    type = type?.code ?? type;
    const typeConfig = this.#typeConfig(type);
    if (!typeConfig) {
      this.logWarning("Unknown type", type);
    }
    if (!typeConfig.list) {
      this.logWarning("Not a list type", type);
    }
    this.logInfo("Listing", typeConfig.name, "...");
    const receive = {
      type: this.config.type.done.code,
      collect: type,
      result: [],
    };
    await this.call({ type }, receive);
    return receive.result.map((packet) => {
      return packet?.data;
    });
  }

  async actionNames() {
    return await this.list(this.config.type.actionNames);
  }

  async userNames() {
    return await this.list(this.config.type.userNames);
  }

  async folderNames() {
    return await this.list(this.config.type.folderNames);
  }

  async audioNames() {
    return await this.list(this.config.type.audioNames);
  }

  async volume(level) {
    if (!this.#checkConnected()) {
      return false;
    }
    const volumeType = this.config.type.volume;
    const min = volumeType.min ?? 0;
    const max = volumeType.max ?? 140;
    level = Math.min(Math.max(level, min), max);
    this.logInfo("Setting volume to", level);
    await this.call({
      ...this.config.command.Sound.Volume,
      data: level,
    });
    return level;
  }

  async increaseVolume(step) {
    const command = this.config.command["Increase Volume"];
    const state = await this.state();
    const level = (state.volume ?? this.config.type.volume.data) + (step ?? command?.data ?? 20);
    return await this.volume(level);
  }

  async decreaseVolume(step) {
    const command = this.config.command["Decrease Volume"];
    const state = await this.state();
    const level = (state.volume ?? this.config.type.volume.data) - (step ?? command?.data ?? 20);
    return await this.volume(level);
  }

  async audio(name) {
    if (!this.#checkConnected()) {
      return false;
    }
    this.logInfo("Playing audio ...");
    await this.call({
      ...this.config.command.Sound.Audio,
      data: name,
    });
  }

  async move(direction, time) {
    if (!this.#check()) {
      return false;
    }
    direction = direction?.type ?? direction;
    const moveCommand = this.config.command.Move[direction];
    if (!moveCommand) {
      this.logWarning("Unknown direction", direction);
      return;
    }
    if (time !== 0) {
      time ??= time ?? moveCommand.time;
      time = Math.min(Math.max(time, moveCommand.min), moveCommand.max);
    }
    this.logInfo(direction, "...");
    const move = this.perform({
      command: this.config.command.Move[direction],
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
    return await this.move(this.config.direction.moveForward, time);
  }

  async moveBackward(time) {
    return await this.move(this.config.direction.moveBackward, time);
  }

  async turnLeft(time) {
    return await this.move(this.config.direction.turnLeft, time);
  }

  async turnRight(time) {
    return await this.move(this.config.direction.turnRight, time);
  }

  async moveLeft(time) {
    return await this.move(this.config.direction.moveLeft, time);
  }

  async moveRight(time) {
    return await this.move(this.config.direction.moveRight, time);
  }

  #lookupCommand(name, types = undefined) {
    let parameter;
    let command = this.commands(name, types);
    if (!command) {
      const parts = name.split(" ");
      if (parts.length > 1) {
        const value = parts.pop();
        name = parts.join(" ");
        command = this.commands(name);
        if (command?.parameter) {
          parameter = this.#parse(value);
        }
      }
    }
    return {
      command,
      parameter,
    };
  }

  commands(name, types = undefined) {
    types = types ? types.map((type) => type?.code ?? type) : undefined;
    const commands = Object.keys(this.config.command).reduce((result, group) => {
      const command = this.config.command[group];
      if (this.#isObject(command)) {
        if (command.group) {
          const groupCommands = Object.fromEntries(
            Object.entries(this.config.command[group] ?? {}).filter(([name]) => {
              const command = this.config.command[group][name];
              return this.#isObject(command) && (!types?.length || types.includes(command.type));
            }),
          );
          result = {
            ...result,
            ...groupCommands,
          };
        } else if (!command.group) {
          if (!types?.length || types.includes(command.type)) {
            result[group] = command;
          }
        }
      }
      return result;
    }, {});
    if (name) {
      return commands[name] ?? Object.values(commands).find((command) => command.name.toLowerCase() === name.toLowerCase());
    }
    return commands;
  }

  actions(name) {
    return this.commands(name, [this.config.type.action]);
  }

  async command(name, args = undefined, types = undefined, limited = false) {
    name = name?.name ?? name;
    const { command, parameter } = this.#lookupCommand(name, types);
    if (!command) {
      this.logWarning("Unknown command", name);
      return;
    }
    if (command.check !== false && !this.#check()) {
      return;
    }
    if (command.stop) {
      return await this.stop();
    }
    const data = this.#isSet(parameter) ? parameter : args?.length ? args[0] : command.data;
    if (command.func) {
      args ??= [data];
      this.logInfo("Calling", command.func, command.id, ...args, command.receive !== PACKET.NONE || limited ? "..." : "");
      if (command.id) {
        return await this[command.func](command.id, ...args);
      } else {
        return await this[command.func](...args);
      }
    }
    const label = this.#isSetString(data) ? data : `${command.name}${this.#isSet(data) ? ` ${data}` : ""}`;
    this.logInfo("Performing", label, command.receive !== PACKET.NONE || limited ? "..." : "");
    const timeout =
      (command?.duration > 0 ? command.duration + (this.config.duration?.buffer ?? 0) : undefined) ??
      command?.timeout ??
      this.config.duration?.timeout;
    const packet = await this.perform({
      command: {
        ...command,
        data,
      },
      receive: { kind: command.receive ?? PACKET.COMPLETED },
      limited,
      timeout,
    });
    if (command.receive !== PACKET.NONE) {
      this.logInfo("Finished", label);
    }
    if (command.end) {
      await this.end();
    }
    return packet;
  }

  async action(name, args = undefined, limited = false) {
    return this.command(name, args, [this.config.type.action], limited);
  }

  async perform({ command, receive = {}, limited = false, check = true, block = true, wait = true, measure = true, timeout }) {
    if (check && !this.#check()) {
      return;
    }
    block = block && command.block !== false;
    if (block) {
      this.status = STATUS.BUSY;
      if (wait) {
        await this.wait(this.config.duration?.warmup);
      }
    }
    receive.kind ??= command.receive ?? PACKET.DATA;
    receive.type ??= command.type;
    let received;
    if (receive && receive.kind !== PACKET.NONE) {
      timeout ??= command.timeout ?? this.config.duration?.timeout;
      received = new Promise((resolve) => {
        const handle =
          timeout > 0 &&
          setTimeout(() => {
            this.characteristic.off(BLE.DATA, fnData);
            this.logWarning("Timeout");
            resolve();
          }, timeout).unref();
        const fnData = (data) => {
          const packet = this.parsePacket(data);
          if (packet.type === (receive.collect?.code ?? receive.collect)) {
            receive.result.push(packet);
          }
          if (packet.kind === receive.kind && packet.type === (receive.type?.code ?? receive.type)) {
            if (handle) {
              clearTimeout(handle);
            }
            this.characteristic.off(BLE.DATA, fnData);
            resolve(packet);
          }
        };
        this.characteristic.on(BLE.DATA, fnData);
      });
    }
    let timedLimited;
    if (!received && limited) {
      if (command.time > 0) {
        timedLimited = new Promise((resolve) => {
          setTimeout(async () => {
            this.logInfo("Time limit reached");
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
      this.logVerbose(this.config.log?.indent + "Elapsed", `${elapsedMs.toFixed(0)} ms`);
    }
    if (wait) {
      await this.wait(this.config.duration?.cooldown);
      if (block && command.block !== false && (timedLimited || received)) {
        this.status = STATUS.READY;
      }
    }
    if (this.#isSet(command.status)) {
      this.status = command.status;
    }
    return packet;
  }

  async call(command, receive, measure, timeout) {
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
    const buffer = this.packetCommand(command);
    if (this.config.log?.traffic) {
      this.log(`${this.config.log.mark ?? ""}Sent`, this.config.log.traffic === "hex" ? buffer.toString("hex") : buffer);
    }
    return await this.characteristic.writeAsync(buffer, false);
  }

  packet(type, data) {
    // | header | numBytes | command | data | checksum |
    type = type.code ?? type;
    data = this.#encode(this.#typeConfig(type), data);
    const headerBuffer = Buffer.from(this.config.spec.header, "hex");
    const typeBuffer = Buffer.from(type, "hex");
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
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
    return this.packet(command.type, this.#isSet(command.data) ? command.data : (this.#typeConfig(command.type)?.data ?? ""));
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
    const typeConfig = this.#typeConfig(type);
    if (bytes.length === 1) {
      value = parseInt(data, 16);
    } else if (typeConfig?.value === "string") {
      value = bytes.toString();
    }
    if (typeConfig?.progress && bytes.length === 1) {
      kind = value === 100 ? PACKET.COMPLETED : PACKET.PROGRESS;
    } else if (typeConfig?.code === this.config.type.stop.code && bytes.length === 0) {
      kind = PACKET.STOP;
    }
    let struct;
    if (bytes.length > 1 && typeConfig.struct && typeConfig.value && this.config[typeConfig.value]) {
      struct = this.#decodeStruct(this.config[typeConfig.value], bytes);
    }
    const name = typeConfig?.name ?? "";
    return {
      kind,
      type,
      name,
      data: value,
      ...(struct ? { [typeConfig.value]: struct } : {}),
      bytes,
      checksum,
      valid: parseInt(checksum, 16) === this.checksum(Buffer.from(body, "hex")),
      raw: buffer,
      toString: () => {
        return hex;
      },
      toLogString: () => {
        return `<packet kind=${kind} type=${type} (${name}) data=${JSON.stringify(struct) ?? value ?? bytes.toString("hex")}>`;
      },
    };
  }

  #encodeStruct(type, struct) {
    const buffer = Buffer.alloc(
      Math.max(
        ...Object.values(type)
          .filter((entry) => entry.index >= 0)
          .map((entry) => entry.index),
      ) + 1,
    );
    for (const entry of Object.values(type)) {
      if (entry.index >= 0) {
        buffer[entry.index] = struct[entry.name] ?? 0;
      }
    }
    return buffer;
  }

  #decodeStruct(type, buffer) {
    const struct = {};
    for (const entry of Object.values(type)) {
      if (entry.index >= 0) {
        struct[entry.name] = buffer[entry.index] ?? 0;
      }
    }
    return struct;
  }

  parsePacketString(string) {
    return this.parsePacket(Buffer.from(string, "hex"));
  }

  checksum(buffer) {
    return buffer.reduce((sum, b) => sum + b, 0) % 256;
  }

  #encode(type, data) {
    if (data === true) {
      return [1];
    } else if (data === false) {
      return [0];
    }
    if (typeof data === "number") {
      return [data];
    }
    if (type.struct && this.#isObject(data)) {
      return this.#encodeStruct(this.config[type.value], data);
    }
    return data;
  }

  #parse(data) {
    if (data === "true") {
      return true;
    } else if (data === "false") {
      return false;
    }
    if (!isNaN(parseInt(data)) && String(parseInt(data)) === data) {
      return parseInt(data);
    }
    return data;
  }

  selectBody(body) {
    this.selectedBody = this.config.body[body];
    this.selectedJoint = undefined;
    this.logInfo("Selected body:", this.selectedBody?.name);
  }

  selectJoint(joint) {
    this.selectedJoint = this.config.joint[joint];
    this.selectedBody = undefined;
    this.logInfo("Selected joint:", this.selectedJoint?.name);
  }

  async controlSelection(source, data) {
    if (!this.#check()) {
      return;
    }
    if (!this.selectedBody && !this.selectedJoint) {
      return;
    }
    let move = false;
    const joints = { ...this.jointsCurrent };
    if (data.input === "controller") {
      for (const name of Object.keys(data.value)) {
        const control = data.value[name];
        const joint =
          this.selectedJoint ??
          Object.values(this.config.joint).find(
            (joint) =>
              joint.body === this.selectedBody?.name &&
              joint.control === name &&
              ((joint.axis === "x" && control.x !== 0) || (joint.axis === "y" && control.y !== 0)),
          );
        if (joint) {
          joints[joint.name] =
            control.x < 0 || control.y < 0 ? (!joint.inverse ? joint.min : joint.max) : !joint.inverse ? joint.max : joint.min;
          move = true;
        }
      }
    } else if (data.input === "keyboard") {
      const joint =
        this.selectedJoint ??
        Object.values(this.config.joint)
          .filter((joint) => joint.body === this.selectedBody?.name && joint.key)
          .find((joint) => {
            return joint.key.split("/").includes(data.key);
          });
      if (joint) {
        const keys = joint.key.split("/");
        if (keys.length > 2) {
          joints[joint.name] = keys.indexOf(data.key) === 0 ? joint.min : keys.indexOf(data.key) === 1 ? joint.value : joint.max;
        } else {
          joints[joint.name] = keys.indexOf(data.key) === 0 ? joint.min : joint.max;
        }
        move = true;
      }
    }
    if (move) {
      return await this.moveJoints(joints, source.speed);
    }
  }

  repl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      completer: (line, callback) => {
        const keys = Object.keys(this.commands());
        const hits = keys.filter((k) => k.startsWith(line));
        callback(null, [hits.length ? hits : keys, line]);
      },
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          await this.stop();
          const input = cmd.trim();
          if (input && input !== this.config.command.Move.Stop.name) {
            await this.command(input);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
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
          this.logInfo("Processing ...");
          stopped = true;
          recording.stop();
          resolve();
        }
        if (this.config.recording.stopOnSilence && now - startTime >= this.config.recording.minDuration) {
          if (calculateRMS(chunk) < this.config.recording.silenceThreshold) {
            silenceMs += chunkMs;
            if (silenceMs >= this.config.recording.silenceDuration) {
              this.logInfo("Silence detected");
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
      this.logInfo("No voice detected");
      return;
    }

    const stream = Readable.from(buffer);
    stream.path = "prompt.wav";
    this.logInfo("Transcribing ...");
    const transcription = await this.#llm().openai.audio.transcriptions.create({
      file: stream,
      model: this.config.llm.voice,
    });
    this.logInfo("Recognized:", transcription.text);

    if (signal?.aborted) {
      return;
    }

    return await this.prompt(transcription.text);
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
            await this.wait(this.config.duration?.stop);
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

  async prompt(prompt) {
    const llm = this.#llm();
    const commands = Object.values(this.commands());
    const userPrompt = llm.userPrompt
      .replace("{{prompt}}", prompt)
      .replace(
        "{{commands}}",
        commands
          .map((command) => `- ${command.name} (description: ${command.description ?? ""}, duration: ${command.duration ?? "?"} ms)`)
          .join("\n"),
      );
    const response = await llm.openai.chat.completions.create({
      model: this.config.llm.default,
      temperature: 0,
      messages: [
        { role: "system", content: llm.systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const responseMessage = response.choices[0].message.content;
    const responseObject = JSON.parse(responseMessage);
    const selectedCommands = responseObject.commands.filter((responseCommand) =>
      commands.find((command) => command.name === responseCommand.name),
    );
    if (selectedCommands.length) {
      this.logInfo("Matching commands:", selectedCommands.map((command) => command.name).join(", "), "...");
      for (const command of selectedCommands) {
        await this.command(command.name, undefined, undefined, true);
      }
    } else {
      this.logWarning("No matching commands!");
    }
  }

  promptRepl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          await this.stop();
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

  #llm() {
    return (this._llm ??= {
      openai: new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      }),
      systemPrompt: fs.readFileSync(path.join(this.folder, this.config.llm.systemPrompt), "utf-8"),
      userPrompt: fs.readFileSync(path.join(this.folder, this.config.llm.userPrompt), "utf-8"),
    });
  }

  async #trigger(event, data) {
    try {
      if (event.body !== undefined) {
        return this.selectBody(event.body);
      } else if (event.joint !== undefined) {
        return this.selectJoint(event.joint);
      } else if (event.control) {
        return await this.controlSelection(event.control, data);
      }
      if (this.busy()) {
        if (event.stop) {
          await this.stop();
        }
      } else {
        if (event.command) {
          await this.command(event.command);
        } else if (event.action) {
          await this.action(event.action);
        } else if (event.move) {
          await this.move(event.move, 0);
        }
      }
    } catch (error) {
      this.logError(error.message ?? error);
    }
  }

  async control({ signal } = {}) {
    const devices = hid.devices();
    let device;
    let controller;
    let controllerConfig = {};
    const configName = Object.keys(this.config.controller).find((name) => {
      controllerConfig = this.config.controller[name];
      device =
        devices.find((device) => device.product === controllerConfig.product || device.product === name) ||
        devices.find(
          (device) => !!device.product && device.usagePage === controllerConfig.usagePage && device.usage === controllerConfig.usage,
        );
      return device;
    });

    if (device) {
      this.logWarning("Device found", configName);
      controller = new hid.HID(device.vendorId, device.productId);
      if (controller) {
        this.logInfo("Controller connected:", controller.getDeviceInfo().product);
        const config = this.config.controller[configName];
        this.controller = {
          button: {},
          axis: {
            value: {},
            state: {},
          },
        };
        controller.on("data", (data) => {
          for (const name in config.button) {
            const button = config.button[name];
            const offset = parseInt(button.index);
            const value = (data[offset] & button.value) !== 0 ? 1 : 0;
            const previous = this.controller.button[name];
            this.controller.button[name] = value;
            if (!previous && value) {
              this.#trigger(button, value, { key: name, value });
            }
          }
          for (const name in config.axis) {
            const axis = config.axis[name];
            const offset = parseInt(axis.index);
            let value = data[offset];
            if (axis.bias === 4) {
              value = value | ((data[offset + 1] & 0x0f) << 8);
            } else if (axis.bias === -4) {
              value = (data[offset - 1] >> 4) | (value << 4);
            }
            if (Math.abs(axis.bias) === 4) {
              value = (value - 2048) / 2048;
            } else {
              value = (value - 128) / 128;
            }
            value = Math.max(-1, Math.min(1, value));
            if (Math.abs(value) < config.deadZone) {
              value = 0;
            }
            this.controller.axis.value[name] = value;
            value = value === 0 ? 0 : value > 0 ? 1 : -1;
            const previous = this.controller.axis.state[name];
            this.controller.axis.state[name] = value;
            if (!previous && value) {
              this.#trigger(axis, { key: name, value });
            }
          }
        });
        controller.on("error", (err) => {
          this.logError("Controller error", err);
        });
      }
    }
    if (!controller) {
      this.logInfo("No controller found");
    }

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const initial = Object.keys(this.config.keyboard.key).reduce((result, key) => {
      if (this.#isObject(this.config.keyboard.key[key])) {
        result[key] = 0;
      }
      return result;
    }, {});
    let releaseTimer = null;
    this.keyboard = {
      key: { ...initial },
    };
    process.stdin.on("keypress", async (str, key) => {
      if (key.ctrl && key.name === "c") {
        await this.end();
        return;
      }
      if (!(key.name in this.keyboard.key)) {
        return;
      }

      this.keyboard.key = {
        ...initial,
        [key.name]: 1,
      };
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        this.keyboard.key = { ...initial };
      }, this.config.keyboard.release).unref();
    });

    this.logInfo("Keyboard control active");

    let controllerState = {
      current: {},
      previous: {},
    };
    let keyboardState = this.keyboard.key;

    while (true) {
      if (signal?.aborted) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        return;
      }

      if (this.controller) {
        for (const stickName in controllerConfig.stick) {
          controllerState.current[stickName] = { x: 0, y: 0, _: "" };
        }
        for (const axisName in controllerConfig.axis) {
          const axis = controllerConfig.axis[axisName];
          controllerState.current[axis.stick][axis.direction] = this.controller.axis.state[axisName] ?? 0;
          controllerState.current[axis.stick]._ +=
            `${controllerState.current[axis.stick]._ ? "," : ""}${axis.direction}=${controllerState.current[axis.stick][axis.direction]}`;
        }
        if (!this.selectedBody && !this.selectedJoint) {
          for (const stickName in controllerConfig.stick) {
            const stick = controllerConfig.stick[stickName];
            const currentControllerState = controllerState.current[stickName];
            const previousControllerState = controllerState.previous[stickName];
            if (stick[currentControllerState._] !== stick[previousControllerState?._]) {
              this.#trigger(stick[currentControllerState._], { key: stickName, value: currentControllerState });
              break;
            }
          }
        } else {
          const controllerData = {};
          for (const stickName in controllerConfig.stick) {
            const stick = controllerConfig.stick[stickName];
            const currentControllerState = controllerState.current[stickName];
            const previousControllerState = controllerState.previous[stickName];
            if (stick[currentControllerState._] !== stick[previousControllerState?._]) {
              controllerData[stickName] = currentControllerState;
            }
          }
          if (Object.keys(controllerData).length) {
            this.#trigger(
              {
                control: controllerConfig.control ?? {},
              },
              { input: "controller", key: "", value: controllerData },
            );
          }
        }
        controllerState.previous = { ...controllerState.current };
      }

      for (const name in this.keyboard.key) {
        if (!this.selectedBody && !this.selectedJoint) {
          if (keyboardState[name] === 1 && this.keyboard.key[name] === 0) {
            this.#trigger(this.config.keyboard.key[""], { key: name, value: 0 });
            break;
          } else if (keyboardState[name] === 0 && this.keyboard.key[name] === 1) {
            this.#trigger(this.config.keyboard.key[name], { key: name, value: 1 });
          }
        } else {
          if (keyboardState[name] === 0 && this.keyboard.key[name] === 1) {
            if (this.config.keyboard.key[name].body !== undefined || this.config.keyboard.key[name].joint !== undefined) {
              this.#trigger(this.config.keyboard.key[name], { key: name, value: 1 });
            } else {
              this.#trigger(
                {
                  control: this.config.keyboard.control ?? {},
                },
                { input: "keyboard", key: name, value: 1 },
              );
            }
            break;
          }
        }
      }

      keyboardState = { ...this.keyboard.key };

      await this.wait(this.config.duration?.input);
    }
  }

  async wait(milliseconds) {
    if (milliseconds > 0) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds).unref());
    }
  }

  log(...args) {
    this.#log(this.config.log.prompt, undefined, args);
  }

  logError(...args) {
    this.#log("E", LOG_LEVEL.error, args);
  }

  logWarning(...args) {
    this.#log("W", LOG_LEVEL.warning, args);
  }

  logInfo(...args) {
    this.#log("I", LOG_LEVEL.info, args);
  }

  logVerbose(...args) {
    this.#log("V", LOG_LEVEL.verbose, args);
  }

  #log(prefix = "<", level, args) {
    if (this.config.log?.active && (!level || (LOG_LEVEL[this.config.log.level] ?? LOG_LEVEL.warning) >= level)) {
      args = (args ?? []).filter((arg) => arg !== undefined);
      console.log(`${prefix} [${new Date().toISOString()}]`, ...args);
    }
  }

  #typeConfig(type) {
    return Object.values(this.config.type).find((t) => t.code === type);
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

  #isObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  #isSet(value) {
    return value !== undefined && value !== null && value !== "";
  }

  #isSetString(value) {
    return typeof value === "string" && this.#isSet(value);
  }
};
