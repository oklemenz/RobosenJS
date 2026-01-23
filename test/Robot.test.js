"use strict";

const noble = require("@abandonware/noble");

const { Robot, K1 } = require("../");

let k1;

describe("Robot", () => {
  test("Connect", async () => {
    const robot = await noble.test(new Robot("", { log: { level: "error" } }));
    expect(noble.startScanningAsync).toHaveBeenCalled();
    expect(noble.peripheral.connectAsync).toHaveBeenCalled();
    expect(robot.connected()).toBe(true);
    expect(robot.ready()).toBe(true);
    await robot.off();
    expect(noble.peripheral.characteristic.unsubscribeAsync).toHaveBeenCalled();
    expect(noble.peripheral.disconnectAsync).toHaveBeenCalled();
    expect(robot.connected()).toBe(false);
    expect(robot.ready()).toBe(false);
  });

  beforeEach(async () => {
    k1 = await noble.test(new K1());
  });

  afterEach(async () => {
    await k1.off();
  });

  test("Kind", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.kind, "K1", 5);
    });
    const promise = k1.kind();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toBe("K1");
    expect(k1.ready()).toBe(true);
  });

  test("Version", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.version, "1.2.3", 5);
    });
    const promise = k1.version();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toBe("1.2.3");
    expect(k1.ready()).toBe(true);
  });

  test("Date", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.date, "2025-01-01", 5);
    });
    const promise = k1.date();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toBe("2025-01-01");
    expect(k1.ready()).toBe(true);
  });

  test("State", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.state, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), 5);
    });
    const promise = k1.state();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toBeDefined();
    expect(result).toMatchObject({
      pattern: 0,
      battery: 1,
      volume: 2,
      progress: 3,
      autoStand: 4,
      autoTurn: 5,
      autoPose: 6,
      autoOff: 7,
    });
    expect(k1.ready()).toBe(true);
  });

  test("Volume", async () => {
    const volumeType = k1.config.type.volume;
    const max = volumeType.max;
    const level = max - 50;
    const call = noble.mock(async () => {});
    const promise = k1.volume(level);
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toBe(level);
    expect(k1.ready()).toBe(true);
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.data).toBe(level);
  });

  test("Volume Increase", async () => {
    noble.mock(async () => {
      noble.notify(k1.config.type.state, { volume: 50 }, 5);
    });
    const call = noble.mock(async () => {});
    const promise = k1.increaseVolume(10);
    expect(call).toHaveBeenCalledTimes(1);
    const result = await promise;
    expect(result).toBe(60);
    expect(k1.ready()).toBe(true);
    const [, [buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.data).toBe(60);
  });

  test("Volume Decrease", async () => {
    noble.mock(async () => {
      noble.notify(k1.config.type.state, { volume: 50 }, 5);
    });
    const call = noble.mock(async () => {});
    const promise = k1.decreaseVolume(10);
    expect(call).toHaveBeenCalledTimes(1);
    const result = await promise;
    expect(result).toBe(40);
    expect(k1.ready()).toBe(true);
    const [, [buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.data).toBe(40);
  });

  test("Audio", async () => {
    const audioCall = noble.mock(async () => {});
    const promise = k1.audio("AppSysMS/101");
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(audioCall).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.data).toBe("AppSysMS/101");
    expect(k1.ready()).toBe(true);
  });

  test("Play", async () => {
    const playCall = noble.mock(async () => {
      noble.notify(k1.config.type.play, "ee", 5);
    });
    const promise = k1.play(101);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(playCall).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.data).toBe(101);
    expect(k1.ready()).toBe(true);
  });

  test("List Action Names", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.actionNames, "Left Punch", 5);
      noble.notify(k1.config.type.actionNames, "Right Punch", 10);
      noble.notify(k1.config.type.done, "", 15);
    });
    const promise = k1.actionNames();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toEqual(["Left Punch", "Right Punch"]);
    expect(k1.ready()).toBe(true);
  });

  test("List User Names", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.userNames, "Alice", 5);
      noble.notify(k1.config.type.userNames, "Bob", 10);
      noble.notify(k1.config.type.done, "", 15);
    });
    const promise = k1.userNames();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toEqual(["Alice", "Bob"]);
    expect(k1.ready()).toBe(true);
  });

  test("List Folder Names", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.folderNames, "music", 5);
      noble.notify(k1.config.type.folderNames, "audio", 10);
      noble.notify(k1.config.type.done, "", 15);
    });
    const promise = k1.folderNames();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toEqual(["music", "audio"]);
    expect(k1.ready()).toBe(true);
  });

  test("List Audio Names", async () => {
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.audioNames, "beep.wav", 5);
      noble.notify(k1.config.type.audioNames, "boop.wav", 10);
      noble.notify(k1.config.type.done, "", 15);
    });
    const promise = k1.audioNames();
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(result).toEqual(["beep.wav", "boop.wav"]);
    expect(k1.ready()).toBe(true);
  });

  test("Toggle autoOff on", async () => {
    const type = k1.config.type.autoOff;
    const call = noble.mock(async () => {});
    const promise = k1.autoOff(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    await promise;
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(type.code);
    expect(packet.data).toBe(1);
    expect(k1.ready()).toBe(true);
  });

  test("Toggle autoOff off", async () => {
    const type = k1.config.type.autoOff;
    const call = noble.mock(async () => {});
    const promise = k1.autoOff(false);
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    await promise;
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(type.code);
    expect(packet.data).toBe(0);
    expect(k1.ready()).toBe(true);
  });

  test("Toggle autoStand on", async () => {
    const type = k1.config.type.autoStand;
    const call = noble.mock(async () => {});
    const promise = k1.autoStand(1);
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    await promise;
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(type.code);
    expect(packet.data).toBe(1);
    expect(k1.ready()).toBe(true);
  });

  test("Toggle autoStand off", async () => {
    const type = k1.config.type.autoStand;
    const call = noble.mock(async () => {});
    const promise = k1.autoStand(0);
    expect(call).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(false);
    await promise;
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(type.code);
    expect(packet.data).toBe(0);
    expect(k1.ready()).toBe(true);
  });

  test("Stop", async () => {
    let commandCall;
    const performingPromise = new Promise((resolve) => {
      commandCall = noble.mock(async () => {
        resolve();
        noble.notify(k1.config.type.action, 25, 5);
      });
    });
    const actionPromise = k1.leftPunch();
    await performingPromise;
    expect(commandCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    const stopPromise = k1.stop();
    expect(stopCall).toHaveBeenCalledTimes(2);
    await stopPromise;
    expect(k1.ready()).toBe(true);
    expect(k1.busy()).toBe(false);
    expect(actionPromise).toBeDefined();
  });

  test("Move (forward)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.moveForward].min = 0;
    const promise = k1.moveForward(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveNorth.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Move (backward)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.moveBackward].min = 0;
    const promise = k1.moveBackward(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveSouth.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Move (turnLeft)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.turnLeft].min = 0;
    const promise = k1.turnLeft(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveNorthWest.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Move (turnRight)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.turnRight].min = 0;
    const promise = k1.turnRight(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveNorthEast.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Move (moveLeft)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.moveLeft].min = 0;
    const promise = k1.moveLeft(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveWest.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Move (moveRight)", async () => {
    let moveCall;
    const performingPromise = new Promise((resolve) => {
      moveCall = noble.mock(async () => {
        resolve();
      });
    });
    k1.config.command.Move[k1.config.constant.moveRight].min = 0;
    const promise = k1.moveRight(1);
    await performingPromise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(k1.busy()).toBe(true);
    const stopCall = noble.mock(async () => {
      noble.notify(k1.config.type.handshake, "", 5);
    });
    let packet = await promise;
    expect(packet).not.toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.moveEast.code);
    expect(packet.data).toBe("");
    expect(stopCall).toHaveBeenCalledTimes(2);
    expect(k1.ready()).toBe(true);
  });

  test("Action Command", async () => {
    expect(k1.ready()).toBe(true);
    const leftPunch = k1.actions("Left Punch");
    expect(leftPunch).toBeDefined();
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.action, 25, 5);
      noble.notify(k1.config.type.action, 50, 10);
      noble.notify(k1.config.type.action, 75, 15);
      noble.notify(k1.config.type.action, 100, 20);
    });
    const leftPunchPromise = k1.leftPunch();
    expect(k1.busy()).toBe(true);
    let packet = await leftPunchPromise;
    expect(call).toHaveBeenCalledTimes(1);
    expect(packet).toBeDefined();
    expect(packet.kind).toBe("completed");
    expect(packet.type).toBe(leftPunch.type);
    expect(packet.data).toBe(100);
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.action.code);
    expect(packet.data).toBe("ProAction/Left Punch");
    expect(k1.ready()).toBe(true);
  });

  test("Joint Command", async () => {
    expect(k1.ready()).toBe(true);
    const head = k1.commands("Head");
    expect(head).toBeDefined();
    const call = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const headPromise = k1.command("Head 101");
    expect(k1.busy()).toBe(true);
    let packet = await headPromise;
    expect(call).toHaveBeenCalledTimes(1);
    expect(packet).toBeDefined();
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.data).toBe("813c6a76be92d4247b7b8173df74227e657d7d7d64647d7d1e");
    expect(k1.ready()).toBe(true);
  });

  test("Initial Position", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.initialPosition();
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual(k1.jointsInitial);
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d28a0");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joint", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJoint("head", 100);
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      head: 100,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e647d7d7d64647d7d1e80");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joints", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJoints({
      leftThigh: 0,
      leftCalf: 10,
      leftAnkle: 20,
      rightThigh: 30,
      rightCalf: 40,
      rightAnkle: 50,
      leftShoulder: 60,
      rightShoulder: 70,
      leftHip: 80,
      leftFoot: 90,
      rightHip: 100,
      rightFoot: 110,
      leftArm: 120,
      leftHand: 130,
      rightArm: 140,
      rightHand: 150,
      head: 160,
      value17: 170,
      value18: 180,
      value19: 190,
      value20: 200,
      value21: 210,
      value22: 220,
      value23: 230,
      speed: 240,
    });
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      leftThigh: 29,
      leftCalf: 10,
      leftAnkle: 26,
      rightThigh: 30,
      rightCalf: 40,
      rightAnkle: 50,
      leftShoulder: 60,
      rightShoulder: 70,
      leftHip: 103,
      leftFoot: 93,
      rightHip: 119,
      rightFoot: 110,
      leftArm: 120,
      leftHand: 130,
      rightArm: 140,
      rightHand: 150,
      head: 160,
      value17: 125,
      value18: 125,
      value19: 125,
      value20: 100,
      value21: 100,
      value22: 125,
      value23: 125,
      speed: 100,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be81d0a1a1e28323c46675d776e78828c96a07d7d7d64647d7d6440");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joints (result normalized)", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJoints(
      {
        leftThigh: 0,
        leftCalf: 10,
        leftAnkle: 20,
        rightThigh: 30,
        rightCalf: 40,
        rightAnkle: 50,
        leftShoulder: 60,
        rightShoulder: 70,
        leftHip: 80,
        leftFoot: 90,
        rightHip: 100,
        rightFoot: 110,
        leftArm: 120,
        leftHand: 130,
        rightArm: 140,
        rightHand: 150,
        head: 160,
        value17: 170,
        value18: 180,
        value19: 190,
        value20: 200,
        value21: 210,
        value22: 220,
        value23: 230,
        speed: 240,
      },
      50,
      true,
    );
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      leftThigh: -100,
      leftCalf: -50,
      leftAnkle: -80,
      rightThigh: -88,
      rightCalf: -150,
      rightAnkle: -96,
      leftShoulder: -152,
      rightShoulder: 34,
      leftHip: -20,
      leftFoot: -30,
      rightHip: -10,
      rightFoot: -5,
      leftArm: -103,
      leftHand: 14,
      rightArm: 106,
      rightHand: 24,
      head: 38,
      value17: 0,
      value18: 0,
      value19: 0,
      value20: 0,
      value21: 0,
      value22: 0,
      value23: 0,
      speed: 50,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be81d0a1a1e28323c46675d776e78828c96a07d7d7d64647d7d320e");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joints (mixed)", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJoints({
      leftThigh: 50,
      leftCalf: "+10",
      leftAnkle: -20,
      rightThigh: "30%",
      rightCalf: "-10%",
      rightAnkle: "-20",
    });
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      leftThigh: 50,
      leftCalf: 70,
      leftAnkle: 86,
      rightThigh: 78,
      rightCalf: 169,
      rightAnkle: 126,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be83246564ea97ed4247b7b8173df74227e7a7d7d7d64647d7d1eec");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joint (delta)", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJointsDelta({
      leftThigh: 10,
      leftCalf: 0,
      leftAnkle: -10,
      rightThigh: 20,
      rightCalf: 0,
      rightAnkle: -20,
    });
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      leftThigh: 139,
      leftCalf: 60,
      leftAnkle: 96,
      rightThigh: 138,
      rightCalf: 190,
      rightAnkle: 126,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be88b3c608abe7ed4247b7b8173df74227e7a7d7d7d64647d7d1e96");
    expect(k1.ready()).toBe(true);
  });

  test("Move Joint (normalized)", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.moveJointsNorm({
      leftThigh: -100,
      leftCalf: -50,
      leftAnkle: -80,
      rightThigh: -88,
      rightCalf: -150,
      rightAnkle: -96,
      leftShoulder: -152,
      rightShoulder: 34,
      leftHip: -20,
      leftFoot: -30,
      rightHip: -10,
      rightFoot: -5,
      leftArm: -103,
      leftHand: 14,
      rightArm: 106,
      rightHand: 24,
      head: 38,
      value17: 0,
      value18: 0,
      value19: 0,
      value20: 0,
      value21: 0,
      value22: 0,
      value23: 0,
      speed: 50,
    });
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      leftThigh: -100,
      leftCalf: -50,
      leftAnkle: -80,
      rightThigh: -88,
      rightCalf: -150,
      rightAnkle: -96,
      leftShoulder: -152,
      rightShoulder: 34,
      leftHip: -20,
      leftFoot: -30,
      rightHip: -10,
      rightFoot: -5,
      leftArm: -103,
      leftHand: 14,
      rightArm: 106,
      rightHand: 24,
      head: 38,
      value17: 0,
      value18: 0,
      value19: 0,
      value20: 0,
      value21: 0,
      value22: 0,
      value23: 0,
      speed: 50,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be81d0a1a1e28323c46675d776e78828c96a07d7d7d64647d7d320e");
    expect(k1.ready()).toBe(true);
  });

  test("Head Center", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.headCenter();
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      head: 122,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d1e96");
    expect(k1.ready()).toBe(true);
  });

  test("Head Left", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.headLeft();
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      head: 42,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e46");
    expect(k1.ready()).toBe(true);
  });

  test("Head Right", async () => {
    const moveCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointMove, "", 5);
    });
    const promise = k1.headRight();
    expect(k1.busy()).toBe(true);
    const result = await promise;
    expect(moveCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.jointsInitial,
      head: 202,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointMove.code);
    expect(packet.raw.toString("hex")).toBe("ffff1be8813c6a76be92d4247b7b8173df74227eca7d7d7d64647d7d1ee6");
    expect(k1.ready()).toBe(true);
  });

  test("Lock Joint", async () => {
    noble.mock(async () => {
      noble.notify(k1.config.type.jointUnlockAll, "", 5);
    });
    const unlockedJoints = await k1.unlockAllJoints();
    const lockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointLock, "", 5);
    });
    const promise = k1.lockJoint(k1.config.joint.head);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(lockCall).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ...unlockedJoints,
      head: 1,
    });
    const [[unlockBuffer], [lockBuffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const unlockPacket = k1.parsePacket(unlockBuffer);
    expect(unlockPacket.type).toBe(k1.config.type.jointUnlockAll.code);
    expect(unlockPacket.raw.toString("hex")).toBe("ffff02eaec");
    const lockPacket = k1.parsePacket(lockBuffer);
    expect(lockPacket.type).toBe(k1.config.type.jointLock.code);
    expect(lockPacket.raw.toString("hex")).toBe("ffff13ed000000000000000000000000000000000101");
    expect(k1.ready()).toBe(true);
  });

  test("Lock Joints", async () => {
    noble.mock(async () => {
      noble.notify(k1.config.type.jointUnlockAll, "", 5);
    });
    await k1.unlockAllJoints();
    const lockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointLock, "", 5);
    });
    const promise = k1.lockJoints({
      leftThigh: 0,
      leftCalf: 1,
      leftAnkle: 0,
      rightThigh: 1,
      rightCalf: 0,
      rightAnkle: 1,
      leftShoulder: 0,
      rightShoulder: 1,
      leftHip: 0,
      leftFoot: 1,
      rightHip: 0,
      rightFoot: 1,
      leftArm: 0,
      leftHand: 1,
      rightArm: 0,
      rightHand: 1,
      head: 0,
    });
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(lockCall).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      leftThigh: 0,
      leftCalf: 1,
      leftAnkle: 0,
      rightThigh: 1,
      rightCalf: 0,
      rightAnkle: 1,
      leftShoulder: 0,
      rightShoulder: 1,
      leftHip: 0,
      leftFoot: 1,
      rightHip: 0,
      rightFoot: 1,
      leftArm: 0,
      leftHand: 1,
      rightArm: 0,
      rightHand: 1,
      head: 0,
    });
    const [[unlockBuffer], [lockBuffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const unlockPacket = k1.parsePacket(unlockBuffer);
    expect(unlockPacket.type).toBe(k1.config.type.jointUnlockAll.code);
    expect(unlockPacket.raw.toString("hex")).toBe("ffff02eaec");
    const lockPacket = k1.parsePacket(lockBuffer);
    expect(lockPacket.type).toBe(k1.config.type.jointLock.code);
    expect(lockPacket.raw.toString("hex")).toBe("ffff13ed000100010001000100010001000100010008");
    expect(k1.ready()).toBe(true);
  });

  test("Lock All Joints", async () => {
    noble.mock(async () => {
      noble.notify(k1.config.type.jointUnlockAll, "", 5);
    });
    await k1.unlockAllJoints();
    const lockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointLockAll, "", 5);
    });
    const promise = k1.lockAllJoints();
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(lockCall).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      leftThigh: 1,
      leftCalf: 1,
      leftAnkle: 1,
      rightThigh: 1,
      rightCalf: 1,
      rightAnkle: 1,
      leftShoulder: 1,
      rightShoulder: 1,
      leftHip: 1,
      leftFoot: 1,
      rightHip: 1,
      rightFoot: 1,
      leftArm: 1,
      leftHand: 1,
      rightArm: 1,
      rightHand: 1,
      head: 1,
    });
    const [[unlockBuffer], [lockBuffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const unlockPacket = k1.parsePacket(unlockBuffer);
    expect(unlockPacket.type).toBe(k1.config.type.jointUnlockAll.code);
    expect(unlockPacket.raw.toString("hex")).toBe("ffff02eaec");
    const lockPacket = k1.parsePacket(lockBuffer);
    expect(lockPacket.type).toBe(k1.config.type.jointLockAll.code);
    expect(lockPacket.raw.toString("hex")).toBe("ffff02ebed");
    expect(k1.ready()).toBe(true);
  });

  test("Unlock Joint", async () => {
    const lockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointLock, "", 5);
    });
    const promise = k1.unlockJoint(k1.config.joint.head);
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(lockCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ...k1.locksInitial,
      head: 0,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointLock.code);
    expect(packet.raw.toString("hex")).toBe("ffff13ed010101010101010101010101010101010010");
    expect(k1.ready()).toBe(true);
  });

  test("Unlock Joints", async () => {
    const unlockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointLock, "", 5);
    });
    const promise = k1.unlockJoints({
      leftThigh: 0,
      leftCalf: 1,
      leftAnkle: 0,
      rightThigh: 1,
      rightCalf: 0,
      rightAnkle: 1,
      leftShoulder: 0,
      rightShoulder: 1,
      leftHip: 0,
      leftFoot: 1,
      rightHip: 0,
      rightFoot: 1,
      leftArm: 0,
      leftHand: 1,
      rightArm: 0,
      rightHand: 1,
      head: 0,
    });
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(unlockCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      leftThigh: 0,
      leftCalf: 1,
      leftAnkle: 0,
      rightThigh: 1,
      rightCalf: 0,
      rightAnkle: 1,
      leftShoulder: 0,
      rightShoulder: 1,
      leftHip: 0,
      leftFoot: 1,
      rightHip: 0,
      rightFoot: 1,
      leftArm: 0,
      leftHand: 1,
      rightArm: 0,
      rightHand: 1,
      head: 0,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointLock.code);
    expect(packet.raw.toString("hex")).toBe("ffff13ed000100010001000100010001000100010008");
    expect(k1.ready()).toBe(true);
  });

  test("Unlock All Joints", async () => {
    const unlockCall = noble.mock(async () => {
      noble.notify(k1.config.type.jointUnlockAll, "", 5);
    });
    const promise = k1.unlockAllJoints();
    expect(k1.busy()).toBe(false);
    const result = await promise;
    expect(unlockCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      leftThigh: 0,
      leftCalf: 0,
      leftAnkle: 0,
      rightThigh: 0,
      rightCalf: 0,
      rightAnkle: 0,
      leftShoulder: 0,
      rightShoulder: 0,
      leftHip: 0,
      leftFoot: 0,
      rightHip: 0,
      rightFoot: 0,
      leftArm: 0,
      leftHand: 0,
      rightArm: 0,
      rightHand: 0,
      head: 0,
    });
    const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls;
    const packet = k1.parsePacket(buffer);
    expect(packet.type).toBe(k1.config.type.jointUnlockAll.code);
    expect(packet.raw.toString("hex")).toBe("ffff02eaec");
    expect(k1.ready()).toBe(true);
  });
});
