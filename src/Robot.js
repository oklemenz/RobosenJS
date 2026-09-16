"use strict";

const fs = require("fs");
const path = require("path");
const repl = require("repl");
const { Readable } = require("stream");
const readline = require("readline");

const hid = require("node-hid");
const noble = require("@abandonware/noble");
const recorder = require("node-record-lpcm16");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

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

const PROMPT_SCOPE = {
  command: "command",
  joint: "joint",
};

const SAVE_MODE = {
  full: "full",
  delta: "delta",
  change: "change",
};

/** @type {import('./robot')} */
module.exports = class Robot {
  constructor(code = "", options = {}) {
    this.folder = path.join(__dirname, code);
    this.config = {
      spec: {},
      log: {
        active: true,
        level: "verbose",
      },
      constant: {},
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
      control: {},
      audio: {},
    };
    this.#merge(options, this.config);
    this.#merge(this.#loadConfig(options), options);
    this.#merge(options, this.config);
    this.code = this.config.code ?? code;
    this.name = this.config.name ?? this.code;
    this.status = STATUS.INITIAL;
    this.#link();
    this.#setup();
  }

  #loadConfig(options) {
    let fileName = options?.file ?? CONFIG_FILE;
    fileName += !fileName.endsWith(".json") ? ".json" : "";
    const filePath = path.join(this.folder, fileName);
    try {
      if (fs.existsSync(filePath)) {
        const config = fs.readFileSync(filePath, "utf8");
        return JSON.parse(config);
      }
      this.logWarning("No robot configuration found at", filePath);
    } catch (error) {
      this.logError("Failed to load robot configuration at", filePath, error.message ?? error);
    }
  }

  #link() {
    for (const section in this.config) {
      const sectionConfig = this.config[section];
      if (this.#isObject(sectionConfig)) {
        for (const name in sectionConfig) {
          const entry = sectionConfig[name];
          if (this.#isObject(entry)) {
            entry.name ??= name;
            for (const name in entry) {
              const subEntry = entry[name];
              if (this.#isObject(subEntry)) {
                subEntry.name ??= name;
              }
            }
          }
        }
      }
    }
    for (const group in this.config.command) {
      const groupConfig = this.config.command[group];
      if (groupConfig.group !== true) {
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
      const constantName = this.#toCamelCase(command.name);
      this.config.constant[constantName] ??= command.name;
      this[constantName] ??= async (...args) => {
        return await this.command(command.name, args);
      };
    }
  }

  #setup() {
    this.selectedBody = undefined;
    this.selectedJoint = undefined;
    this.jointInitial = Object.values(this.config.joint).reduce((result, joint) => {
      result[joint.name] = joint.value;
      return result;
    }, {});
    this.jointCurrent = { ...this.jointInitial };
    this.lockInitial = Object.values(this.config.joint).reduce((result, joint, index) => {
      if (index < this.config.type.jointLock.length) {
        result[joint.name] = 1;
      }
      return result;
    }, {});
    this.lockCurrent = { ...this.lockInitial };
  }

  async on() {
    this.logInfo("Waiting for Bluetooth powered on", "...");
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
      this.exit();
    }
  }

  async end() {
    await this.stop();
    return await this.off(true);
  }

  exit() {
    // eslint-disable-next-line
    process.exit(0);
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
      return;
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
      type: this.config.type.handshake,
    });
    this.status = STATUS.READY;
    this.logVerbose("Stopped");
  }

  async shutdown() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logInfo("Shutdown!");
    await this.call(this.config.command.System.Shutdown);
  }

  async initialPosition(norm = false) {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Initial position ...");
    const command = this.config.command.System[this.config.constant.initialPosition];
    return await this.moveJoints(this.jointInitial, command?.speed, norm);
  }

  #normalizeJointValue(joint, value) {
    const currentValue = this.jointCurrent[joint.name] ?? joint.value;
    if (this.#isSet(value) && this.#isString(value)) {
      if (value.endsWith("%")) {
        value = value.trim().slice(0, -1);
        if (value.startsWith("+") || value.startsWith("-")) {
          const percent = Math.min(Math.max(parseInt(value), -100), 100);
          value = currentValue + (percent / 100) * (joint.max - joint.min);
        } else {
          const percent = Math.min(Math.max(parseInt(value), 0), 100);
          value = joint.min + (percent / 100) * (joint.max - joint.min);
        }
      } else {
        value = currentValue + parseInt(value);
      }
    } else {
      if (value < 0) {
        value = currentValue + value;
      } else {
        value = value ?? currentValue;
      }
    }
    if (isNaN(value)) {
      value = currentValue;
    }
    value = Math.min(Math.max(value, joint.min), joint.max);
    return value;
  }

  async moveJoint(name, value, speed, norm = false) {
    name = name?.name ?? name;
    const joint = this.config.joint[name];
    if (!joint) {
      return;
    }
    if (!this.lockCurrent[joint.name]) {
      this.logWarning("Move not possible. Joint is unlocked:", joint.name);
    }
    return await this.moveJoints(
      {
        [joint.name]: value ?? joint.value,
      },
      speed,
      norm,
    );
  }

  async moveJoints(joints, speed = undefined, norm = false) {
    joints.speed = speed ? speed : joints.speed;
    const jointData = Object.keys(this.config.joint).reduce((result, name) => {
      result[name] = this.#normalizeJointValue(this.config.joint[name], joints[name]);
      return result;
    }, {});
    await this.perform({
      command: {
        type: this.config.type.jointMove,
        data: jointData,
      },
      wait: false,
    });
    this.jointCurrent = { ...jointData };
    if (norm) {
      Object.keys(this.config.joint).forEach((name) => {
        const jointConfig = this.config.joint[name];
        if (jointConfig.norm !== false) {
          jointData[name] -= jointConfig.value;
        }
      });
    }
    await this.wait(this.config.duration?.delay);
    return jointData;
  }

  async moveJointsDelta(deltas, speed, norm = false) {
    const joints = Object.keys(deltas).reduce(
      (result, name) => {
        const value = parseInt(deltas?.[name] ?? 0);
        result[name] += !isNaN(value) ? value : 0;
        return result;
      },
      { ...this.jointCurrent },
    );
    return await this.moveJoints(joints, speed, norm);
  }

  async moveJointsNorm(joints, speed) {
    joints = Object.values(this.config.joint).reduce(
      (result, joint) => {
        if (joint.norm !== false) {
          result[joint.name] += joint.value;
        }
        return result;
      },
      { ...joints },
    );
    return await this.moveJoints(joints, speed, true);
  }

  async headCenter(speed, norm = false) {
    const command = this.config.command.Joint[this.config.constant.headCenter];
    const joint = this.config.joint.head;
    return await this.moveJoint(joint, joint.value, speed ?? command?.speed, norm);
  }

  async headLeft(speed, norm = false) {
    const command = this.config.command.Joint[this.config.constant.headLeft];
    const joint = this.config.joint.head;
    return await this.moveJoint(joint, joint.min, speed ?? command?.speed, norm);
  }

  async headRight(speed, norm = false) {
    const command = this.config.command.Joint[this.config.constant.headRight];
    const joint = this.config.joint.head;
    return await this.moveJoint(joint, joint.max, speed ?? command?.speed, norm);
  }

  async runMoves(moves) {
    this.logVerbose("Locking all joints", "...");
    await this.lockAllJoints();
    await this.wait(this.config.duration?.buffer);
    this.logVerbose("Performing moves", "...");
    for (const move of moves) {
      if (move.wait > 0) {
        await this.wait(move.wait);
        continue;
      }
      await this.moveJoints(move);
    }
    return this.jointCurrent;
  }

  async lockJoint(name) {
    name = name?.name ?? name ?? "";
    const joint =
      this.config.joint[name] ||
      Object.values(this.config.joint).find((joint) => joint.joint && joint.name.toLowerCase() === name.replace(/ /g, "").toLowerCase());
    if (!joint) {
      return;
    }
    return await this.lockJoints({
      [joint.name]: 1,
    });
  }

  async lockJoints(joints) {
    const jointData = Object.values(this.config.joint)
      .filter((joint) => joint.joint)
      .reduce((result, joint) => {
        result[joint.name] = this.#isSet(joints[joint.name]) ? (joints[joint.name] ? 1 : 0) : (this.lockCurrent[joint.name] ?? 0);
        return result;
      }, {});
    await this.call({
      type: this.config.type.jointLock,
      data: jointData,
    });
    this.lockCurrent = { ...jointData };
    await this.wait(this.config.duration?.delay);
    return jointData;
  }

  async lockAllJoints() {
    await this.call(
      {
        type: this.config.type.jointLockAll,
      },
      {
        kind: PACKET.NONE,
      },
    );
    this.lockCurrent = Object.values(this.config.joint)
      .filter((joint) => joint.joint)
      .reduce((result, joint) => {
        result[joint.name] = 1;
        return result;
      }, {});
    await this.wait(this.config.duration?.delay);
    return this.lockCurrent;
  }

  async unlockJoint(name) {
    name = name?.name ?? name ?? "";
    const joint =
      this.config.joint[name] ||
      Object.values(this.config.joint).find((joint) => joint.joint && joint.name.toLowerCase() === name.replace(/ /g, "").toLowerCase());
    if (!joint) {
      return;
    }
    return await this.lockJoints({
      [joint.name]: 0,
    });
  }

  async unlockJoints(joints) {
    return await this.lockJoints(joints);
  }

  async unlockAllJoints() {
    await this.call(
      {
        type: this.config.type.jointUnlockAll,
      },
      {
        kind: PACKET.NONE,
      },
    );
    this.lockCurrent = Object.values(this.config.joint)
      .filter((joint) => joint.joint)
      .reduce((result, joint) => {
        result[joint.name] = 0;
        return result;
      }, {});
    await this.wait(this.config.duration?.delay);
    return this.lockCurrent;
  }

  async syncJoints() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Synchronizing joint positions ...");
    const packet = await this.call(
      {
        type: this.config.type.jointSync,
      },
      {
        kind: PACKET.DATA,
      },
    );
    if (packet?.joint) {
      this.jointCurrent = packet.joint;
    }
    return this.jointCurrent;
  }

  async program() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Programming mode activated ...");
    const receive = {
      kind: PACKET.DATA,
      type: this.config.type.program,
      collectType: this.config.type.program,
      collection: [],
      count: 2,
    };
    await this.call(
      {
        type: this.config.type.program,
      },
      receive,
    );
    if (receive.collection.length > 0) {
      this.jointCurrent = receive.collection[0].joint;
    }
    return this.jointCurrent;
  }

  async programExit() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Programming mode deactivated ...");
    const packet = await this.call(
      {
        type: this.config.type.programExit,
      },
      {
        kind: PACKET.DATA,
      },
    );
  }

  async record(file) {
    if (this.jointsRecord) {
      this.logWarning("Recording already active for file:", this.jointsRecordFile);
      return;
    }
    file ??= "demo";
    const fileName = file + (!file.endsWith(".json") ? ".json" : "");
    const filePath = path.join(process.cwd(), this.config.command.System.Record.folder, this.code, fileName);
    try {
      if (fs.existsSync(filePath)) {
        this.logWarning("Run configuration already exists at", filePath);
        return;
      }
      this.jointsRecordFile = filePath;
      this.jointsRecord = [{ ...this.jointInitial, speed: this.config.joint.speed.value }];
      this.logInfo("Recording started for file", filePath);
    } catch (error) {
      this.logError("Failed to check run configuration at", filePath, error.message ?? error);
    }
  }

  async sync() {
    if (!this.jointsRecord) {
      this.logWarning("No recording active!");
      return;
    }
    const joints = await this.syncJoints();
    this.jointsRecord.push({ ...joints, speed: this.config.joint.speed.value });
    return joints;
  }

  async pause(milliseconds = 1000) {
    if (!this.jointsRecord) {
      this.logWarning("No recording active!");
      return;
    }
    this.jointsRecord.push({ wait: parseInt(milliseconds) });
  }

  async save(mode = SAVE_MODE.full) {
    if (!this.jointsRecord) {
      this.logWarning("No recording active!");
      return;
    }
    if ([SAVE_MODE.delta, SAVE_MODE.change].includes(mode)) {
      let jointPrevious = {};
      this.jointsRecord = this.jointsRecord.map((joints) => {
        if (joints.wait) {
          return joints;
        }
        const jointDelta = Object.values(this.config.joint).reduce((result, joint) => {
          if (jointPrevious[joint.name] === undefined) {
            result[joint.name] = joints[joint.name];
          } else if (Math.abs(jointPrevious[joint.name] - joints[joint.name]) > 5) {
            if (mode === SAVE_MODE.delta) {
              result[joint.name] = joints[joint.name];
            } else if (mode === SAVE_MODE.change) {
              const change = joints[joint.name] - jointPrevious[joint.name];
              result[joint.name] = change > 0 ? `+${change}` : `${change}`;
            }
          }
          return result;
        }, {});
        jointDelta.speed = joints.speed;
        jointPrevious = joints;
        return jointDelta;
      });
    }
    try {
      fs.mkdirSync(path.dirname(this.jointsRecordFile), { recursive: true });
      fs.writeFileSync(this.jointsRecordFile, JSON.stringify(this.jointsRecord, null, 2), "utf8");
      this.logInfo("Run configuration saved at", this.jointsRecordFile);
    } catch (error) {
      this.logError("Failed to save run configuration at", this.jointsRecordFile, error.message ?? error);
    }
    this.jointsRecordFile = null;
    this.jointsRecord = null;
  }

  async cancel() {
    if (!this.jointsRecord) {
      this.logInfo("No recording active!");
      return;
    }
    this.logInfo("Recording cancelled", this.jointsRecordFile);
    this.jointsRecordFile = null;
    this.jointsRecord = null;
  }

  async run(file) {
    if (!this.#checkConnected()) {
      return;
    }
    if (!file) {
      return;
    }
    const fileName = file + (!file.endsWith(".json") ? ".json" : "");
    const filePath = path.join(process.cwd(), this.config.command.System.Run.folder, this.code, fileName);
    try {
      if (fs.existsSync(filePath)) {
        const config = fs.readFileSync(filePath, "utf8");
        const moves = JSON.parse(config);
        return await this.runMoves(moves);
      }
      this.logWarning("No run configuration found at", filePath);
    } catch (error) {
      this.logError("Failed to load run configuration at", filePath, error.message ?? error);
    }
  }

  async kind() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Fetching kind ...");
    const packet = await this.call(this.config.command.Info.Kind);
    return packet?.data;
  }

  async version() {
    if (!this.#checkConnected()) {
      return;
    }
    this.logVerbose("Fetching version ...");
    const packet = await this.call(this.config.command.Info.Version);
    return packet?.data;
  }

  async date() {
    if (!this.#checkConnected()) {
      return;
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
      kind: PACKET.DATA,
      type: this.config.type.done,
      collectType: type,
      collection: [],
    };
    await this.call({ type }, receive);
    return receive.collection.map((packet) => {
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
      return;
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
    const command = this.config.command.Sound[this.config.constant.increaseVolume];
    const state = await this.state();
    const level = (state.volume ?? this.config.type.volume.data) + (step ?? command?.data ?? 20);
    return await this.volume(level);
  }

  async decreaseVolume(step) {
    const command = this.config.command.Sound[this.config.constant.decreaseVolume];
    const state = await this.state();
    const level = (state.volume ?? this.config.type.volume.data) - (step ?? command?.data ?? 20);
    return await this.volume(level);
  }

  async audio(name) {
    if (!this.#checkConnected()) {
      return;
    }
    this.logInfo("Playing audio ...");
    await this.call({
      ...this.config.command.Sound.Audio,
      data: name,
    });
  }

  async play(number) {
    if (!this.#checkConnected()) {
      return;
    }
    this.logInfo("Playing message ...");
    await this.call({
      ...this.config.command.Sound.Play,
      data: number,
    });
  }

  async move(direction, time) {
    if (!this.#check()) {
      return;
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
    return await this.perform({
      command: this.config.command.Move[direction],
      receive: { kind: moveCommand.receiveKind ?? PACKET.NONE },
      limit: time,
      wait: false,
      timeout: 0,
    });
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

  async command(name, args = undefined, types = undefined, limit = false) {
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
      this.logVerbose("Calling", command.func, command.id, ...args, command.receiveKind !== PACKET.NONE || limit ? "..." : "");
      if (command.id) {
        return await this[command.func](command.id, ...args);
      } else {
        return await this[command.func](...args);
      }
    }
    const label = this.#isSet(data) && this.#isString(data) ? data : `${command.name}${this.#isSet(data) ? ` ${data}` : ""}`;
    this.logInfo("Performing", label, command.receiveKind !== PACKET.NONE || limit ? "..." : "");
    const timeout =
      (command?.duration > 0 ? command.duration + (this.config.duration?.buffer ?? 0) : undefined) ??
      command?.timeout ??
      this.config.duration?.timeout;
    const packet = await this.perform({
      command: {
        ...command,
        data,
      },
      receive: { kind: command.receiveKind ?? PACKET.COMPLETED },
      limit,
      timeout,
    });
    if (command.receiveKind !== PACKET.NONE) {
      this.logInfo("Finished", label);
    }
    if (command.end) {
      await this.end();
    }
    return packet;
  }

  async action(name, args = undefined, limit = false) {
    return await this.command(name, args, [this.config.type.action], limit);
  }

  async perform({ command, receive = {}, limit = false, check = true, block = true, wait = true, measure = true, timeout }) {
    if (check && !this.#check()) {
      return;
    }
    const timeLimit = this.#isNumber(limit) && limit > 0 ? limit : ((limit ? command.time : 0) ?? 0);
    block = block && command.block !== false;
    if (block) {
      this.status = STATUS.BUSY;
      if (wait && this.config.duration?.warmup > 0) {
        await this.wait(this.config.duration?.warmup);
      }
    }
    receive.kind = receive.kind ?? command.receiveKind ?? PACKET.DATA;
    receive.type = receive.type?.code ?? receive.type ?? command.receiveType ?? command.type.code ?? command.type;
    receive.collectType = receive.collectType?.code ?? receive.collectType;
    receive.collection = [];
    receive.count ??= 1;
    let received;
    if (receive.kind !== PACKET.NONE) {
      timeout ??= command.timeout ?? this.config.duration?.timeout;
      received = new Promise((resolve) => {
        const handle =
          timeout > 0 &&
          setTimeout(() => {
            if (!this.connected()) {
              return;
            }
            this.characteristic.off(BLE.DATA, fnData);
            this.logWarning("Timeout");
            resolve();
          }, timeout).unref();
        const fnData = (data) => {
          if (!this.connected()) {
            return;
          }
          const packet = this.parsePacket(data);
          if (packet.kind === PACKET.DATA && packet.type === receive.collectType) {
            receive.collection.push(packet);
          }
          if (packet.kind === receive.kind && packet.type === receive.type) {
            receive.count--;
            if (receive.count === 0) {
              handle && clearTimeout(handle);
              this.characteristic.off(BLE.DATA, fnData);
              resolve(packet);
            }
          }
        };
        this.characteristic.on(BLE.DATA, fnData);
      });
    }
    let limitStop;
    if (!received && timeLimit > 0) {
      limitStop = new Promise((resolve) => {
        setTimeout(async () => {
          this.logVerbose("Time limit reached");
          resolve(true);
        }, timeLimit);
      });
    }
    const start = measure && performance.now();
    await this.send(command);
    const packet = await received;
    const stop = await limitStop;
    if (measure) {
      const elapsedMs = performance.now() - start;
      this.logVerbose(this.config.log?.indent + "Elapsed", `${elapsedMs.toFixed(0)} ms`);
    }
    if (stop) {
      await this.stop();
    }
    if (block && (received || limitStop)) {
      this.status = STATUS.READY;
      if (wait && this.config.duration?.cooldown > 0) {
        await this.wait(this.config.duration?.cooldown);
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
    if (this.config.spec.header?.length !== 4 || !hex.startsWith(this.config.spec.header) || hex.length < 10) {
      return { kind: PACKET.INVALID, raw: buffer };
    }
    const numBytes = parseInt(hex.slice(4, 6), 16);
    const body = hex.slice(4, 4 + numBytes * 2);
    const type = body.slice(2, 4);
    const data = body.slice(4);
    const checksum = hex.slice(-2);
    let kind = PACKET.DATA;
    const bytes = Buffer.from(data, "hex");
    let value = data;
    const typeConfig = this.#typeConfig(type);
    if (bytes.length === 1 || ["number", "boolean"].includes(typeConfig?.value)) {
      value = parseInt(data, 16);
      if (typeConfig?.value === "boolean") {
        value = !isNaN(value) && value !== 0;
      }
    } else if (typeConfig?.value === "string") {
      value = bytes.toString();
    }
    if (typeConfig?.progress && bytes.length === 1) {
      kind = value === 100 ? PACKET.COMPLETED : PACKET.PROGRESS;
    } else if (typeConfig === this.config.type.stop && bytes.length === 0) {
      kind = PACKET.STOP;
    }
    let struct;
    if (bytes.length > 1 && typeConfig.struct && typeConfig.value && this.config[typeConfig.value]) {
      struct = this.#decodeStruct(this.config[typeConfig.value], bytes, typeConfig?.length);
    }
    const name = typeConfig?.name ?? "";
    return {
      kind,
      type,
      header: this.config.spec.header,
      length: bytes.length,
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
        return `<packet kind=${kind} type=${type} (${name}) data=${JSON.stringify(struct) ?? value}>`;
      },
    };
  }

  #encodeStruct(type, struct, length) {
    const size =
      length ??
      Math.max(
        ...Object.values(type)
          .filter((entry) => entry.index >= 0)
          .map((entry) => entry.index),
      ) + 1;
    const buffer = Buffer.alloc(size);
    for (const entry of Object.values(type)) {
      if (entry.index >= 0 && (!length || entry.index < length)) {
        buffer[entry.index] = struct[entry.name] ?? 0;
      }
    }
    return buffer;
  }

  #decodeStruct(type, buffer, length) {
    const struct = {};
    for (const entry of Object.values(type)) {
      if (entry.index >= 0 && (!length || entry.index < length)) {
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
      return this.#encodeStruct(this.config[type.value], data, type.length);
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
    this.selectedBody = this.config.body?.[body];
    this.selectedJoint = undefined;
    this.logInfo("Selected body:", this.selectedBody?.name);
  }

  selectJoint(joint) {
    this.selectedJoint = this.config.joint?.[joint];
    this.selectedBody = undefined;
    this.logInfo("Selected joint:", this.selectedJoint?.name);
  }

  async #controlSelection(source, data) {
    if (!this.#check()) {
      return;
    }
    if (!this.selectedBody && !this.selectedJoint) {
      return;
    }
    let move = false;
    const joints = { ...this.jointCurrent };
    if (data.input === "controller") {
      for (const name of Object.keys(data.value)) {
        const control = data.value[name];
        const controlJoints = this.selectedJoint
          ? this.config.control.joint[this.selectedJoint.name]
          : Object.values(this.config.control.joint).filter(
              (joint) =>
                joint.body === this.selectedBody?.name &&
                joint.control === name &&
                ((joint.axis === "x" && control.x !== 0) || (joint.axis === "y" && control.y !== 0)),
            );
        for (const joint of controlJoints) {
          const step = joint.step ?? this.config.control.step;
          if ((joint.axis === "x" && control.x > 0) || (joint.axis === "y" && control.y > 0)) {
            joints[joint.name] += step * (joint.invert ? -1 : 1);
          } else if ((joint.axis === "x" && control.x < 0) || (joint.axis === "y" && control.y < 0)) {
            joints[joint.name] -= step * (joint.invert ? -1 : 1);
          } else {
            joints[joint.name] = this.config.joint[joint.name].value;
          }
          move = true;
        }
      }
    } else if (data.input === "keyboard") {
      const controlJoints = this.selectedJoint
        ? this.config.control.joint[this.selectedJoint.name]
        : Object.values(this.config.control.joint).filter(
            (joint) => joint.body === this.selectedBody?.name && joint.key && joint.key.split("/").includes(data.key),
          );
      for (const joint of controlJoints) {
        const step = joint.step ?? this.config.control.step;
        const keys = joint.key.split("/");
        if (keys.indexOf(data.key) === 0) {
          joints[joint.name] -= step;
        } else if (keys.indexOf(data.key) === keys.length - 1) {
          joints[joint.name] += step;
        } else {
          joints[joint.name] = this.config.joint[joint.name].value;
        }
        move = true;
      }
    }
    if (move) {
      return await this.moveJoints(joints, source.speed ?? this.config.control.speed);
    }
  }

  repl() {
    repl.start({
      prompt: `${this.name}> `,
      useColors: true,
      ignoreUndefined: true,
      completer: (line, callback) => {
        const keys = Object.keys(this.commands());
        const hits = keys.filter((key) => key.toLowerCase().startsWith(line.toLowerCase()));
        callback(null, [hits.length ? hits : keys, line]);
      },
      eval: async (cmd, context, filename, callback) => {
        let error = null;
        try {
          await this.stop();
          const input = cmd.trim();
          if (input && input !== this.config.command.Move.Stop.name) {
            await this.command(input, undefined, undefined, true);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
    return new Promise(() => {});
  }

  async voice({ signal } = {}, scope = PROMPT_SCOPE.command) {
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
          this.log("Listening", "...");
        }

        if (now - startTime >= this.config.recording.maxDuration) {
          this.logInfo("Processing", "...");
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
      this.logWarning("No voice detected");
      return;
    }

    const wavHeader = (dataLength, { sampleRate, channels = 1, bitsPerSample = 16 }) => {
      const blockAlign = (channels * bitsPerSample) / 8;
      const byteRate = sampleRate * blockAlign;
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + dataLength, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(channels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write("data", 36);
      header.writeUInt32LE(dataLength, 40);
      return header;
    };
    const wav = Buffer.concat([wavHeader(buffer.length, { sampleRate: this.config.recording.voice.sampleRate }), buffer]);
    const stream = Readable.from(wav);
    stream.path = "prompt.wav";
    this.logInfo("Transcribing", "...");
    const llm = this.#llm();
    const transcription = await llm.transcribe({
      file: stream,
      model: llm.config.model.voice,
    });
    this.logInfo("Recognized:", transcription);

    if (signal?.aborted) {
      return;
    }

    return await this.prompt(transcription, scope);
  }

  async voiceRepl(scope = PROMPT_SCOPE.command) {
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

    const enterPressed = (query) =>
      new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question(query, () => {
          rl.close();
          resolve(true);
        });
        // Ctrl+C
        rl.on("SIGINT", () => {
          rl.close();
          resolve(false);
        });
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
          this.voice({ signal: controller.signal }, scope),
        ]);
      } finally {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      }
      const ok = await enterPressed(`${this.name}> Press Enter to talk ...`);
      if (!ok) {
        return;
      }
    }
  }

  async commandPrompt(prompt) {
    const llm = this.#llm();
    const commands = Object.values(
      this.commands(undefined, [
        this.config.type.action,
        this.config.type.moveNorth,
        this.config.type.moveNorthEast,
        this.config.type.moveEast,
        this.config.type.moveSouthEast,
        this.config.type.moveSouth,
        this.config.type.moveSouthWest,
        this.config.type.moveWest,
        this.config.type.moveNorthWest,
      ]),
    );
    const systemPrompt = llm.command.systemPrompt;
    const userPrompt = llm.command.userPrompt
      .replace("{{prompt}}", prompt)
      .replace(
        "{{commands}}",
        commands
          .map((command) => `- ${command.name} (description: ${command.description ?? ""}, duration: ${command.duration ?? "?"} ms)`)
          .join("\n"),
      );
    const response = await llm.complete({
      model: llm.config.model.default,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const selectedCommands = response.commands.filter((responseCommand) => {
      return commands.find((command) => command.name === responseCommand.name);
    });
    if (selectedCommands.length) {
      this.logInfo("Matching commands:", selectedCommands.map((command) => command.name).join(", "), "...");
      for (const command of selectedCommands) {
        await this.command(command.name, undefined, undefined, true);
      }
    } else {
      this.logWarning("No matching commands!");
    }
  }

  async jointPrompt(prompt) {
    const llm = this.#llm();
    const move = Object.values(this.config.joint)
      .filter((joint) => joint.joint)
      .reduce((result, joint) => {
        result[joint.name] = joint.value;
        return result;
      }, {});
    move.speed = this.config.joint.speed.value;
    const systemPrompt = llm.joint.systemPrompt.replace("{{move}}", JSON.stringify(move)).replace(
      "{{joints}}",
      Object.values(this.config.joint)
        .filter((joint) => joint.joint)
        .map((joint) => `- ${joint.name} (value: ${joint.value}, min: ${joint.min}, max: ${joint.max})`)
        .join("\n"),
    );
    const userPrompt = llm.joint.userPrompt.replace("{{prompt}}", prompt);
    const response = await llm.complete({
      model: llm.config.model.default,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    if (response.moves.length) {
      this.logInfo("Matching moves:", response.moves.length, "...");
      await this.runMoves(response.moves);
    } else {
      this.logWarning("No matching moves!");
    }
  }

  async prompt(prompt, scope = PROMPT_SCOPE.command) {
    switch (scope) {
      case PROMPT_SCOPE.command:
      case "c":
      default:
        return await this.commandPrompt(prompt);
      case PROMPT_SCOPE.joint:
      case "j":
        return await this.jointPrompt(prompt);
    }
  }

  promptRepl(scope = PROMPT_SCOPE.command) {
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
            await this.prompt(input, scope);
          }
        } catch (err) {
          error = err;
        }
        callback(error);
      },
    });
    return new Promise(() => {});
  }

  #llm() {
    if (["openai"].includes(this.config.llm.provider?.toLowerCase())) {
      const OpenAI = require("openai");
      const openai = new OpenAI({
        apiKey: process.env[this.config.llm.env],
      });
      this._llm ??= {
        complete: async (...args) => {
          const response = await openai.chat.completions.create(...args);
          return JSON.parse(response.choices[0].message.content);
        },
        transcribe: async (...args) => {
          const transcription = await openai.audio.transcriptions.create(...args);
          return transcription.text;
        },
      };
    }
    if (this._llm) {
      this._llm.config ??= this.config.llm;
      this._llm.command ??= {
        systemPrompt: this.#readFile(this.config.llm.command.systemPrompt),
        userPrompt: this.#readFile(this.config.llm.command.userPrompt),
      };
      this._llm.joint ??= {
        systemPrompt: this.#readFile(this.config.llm.joint.systemPrompt),
        userPrompt: this.#readFile(this.config.llm.joint.userPrompt),
      };
    }
    return this._llm;
  }

  async #trigger(event, data) {
    try {
      if (!event) {
        return;
      }
      if (event.body !== undefined) {
        return this.selectBody(event.body);
      } else if (event.joint !== undefined) {
        return this.selectJoint(event.joint);
      } else if (event.control) {
        return await this.#controlSelection(event.control, data);
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
            value = value * (axis.invert ? -1 : 1);
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
      this.logWarning("No controller found");
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
          const stick = controllerConfig.stick[stickName];
          if (!this.#isObject(stick)) {
            continue;
          }
          controllerState.current[stickName] = { x: 0, y: 0, _: "" };
        }
        for (const axisName in controllerConfig.axis) {
          const axis = controllerConfig.axis[axisName];
          if (!this.#isObject(axis)) {
            continue;
          }
          controllerState.current[axis.stick][axis.direction] = this.controller.axis.state[axisName] ?? 0;
          controllerState.current[axis.stick]._ +=
            `${controllerState.current[axis.stick]._ ? "," : ""}${axis.direction}=${controllerState.current[axis.stick][axis.direction]}`;
        }
        if (!this.selectedBody && !this.selectedJoint) {
          for (const stickName in controllerConfig.stick) {
            const stick = controllerConfig.stick[stickName];
            if (!this.#isObject(stick)) {
              continue;
            }
            const currentControllerState = controllerState.current[stickName];
            const previousControllerState = controllerState.previous[stickName];
            if (stick[currentControllerState._] !== stick[previousControllerState?._]) {
              this.#trigger(stick[currentControllerState._], {
                key: stickName,
                value: currentControllerState,
              });
              break;
            }
          }
        } else {
          const controllerData = {};
          for (const stickName in controllerConfig.stick) {
            const stick = controllerConfig.stick[stickName];
            if (!this.#isObject(stick)) {
              continue;
            }
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

      await this.wait(this.config.control.input);
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

  #isString(value) {
    return typeof value === "string";
  }

  #isNumber(value) {
    return parseInt(value) === value;
  }

  #merge(data, into) {
    if (!this.#isObject(data)) {
      return into;
    }
    for (const key of Object.keys(data)) {
      if (this.#isObject(into[key]) && this.#isObject(data[key])) {
        into[key] = this.#merge(data[key], into[key]);
      } else {
        into[key] = data[key];
      }
    }
    return into;
  }

  #readFile(file) {
    const filePath = path.join(this.folder, file);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8");
    }
    return "";
  }
};
