"use strict";

const { K1 } = require("../");

describe("K1", () => {
  let k1;

  beforeEach(() => {
    k1 = new K1();
  });

  test("build packet", () => {
    let packet = k1.packetString(k1.config.type.action, "ProAction/Left Punch");
    expect(packet).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    packet = k1.packetCommandString({
      type: k1.config.type.action,
      data: "ProAction/Left Punch",
    });
    expect(packet).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    packet = k1.packetCommandString({
      type: "17",
      data: "Action/Artificial Intelligence",
    });
    expect(packet).toBe("ffff2017416374696f6e2f4172746966696369616c20496e74656c6c6967656e6365af");
  });

  test("build state packet", () => {
    const packet = k1.packetString(k1.config.type.state, {
      pattern: 0,
      battery: 32,
      volume: 130,
      progress: 0,
      autoStand: 0,
      autoTurn: 1,
      autoPose: 0,
      autoOff: 1,
    });
    expect(packet).toBe("ffff0a0f0020820000010001bd");
  });

  test("build joint packet", () => {
    let packet = k1.packetString(k1.config.type.jointMove, {
      leftThigh: 129,
      leftCalf: 60,
      leftAnkle: 106,
      rightThigh: 118,
      rightCalf: 190,
      rightAnkle: 146,
      leftShoulder: 212,
      rightShoulder: 36,
      leftHip: 123,
      leftFoot: 123,
      rightHip: 129,
      rightFoot: 115,
      leftArm: 223,
      leftHand: 116,
      rightArm: 34,
      rightHand: 126,
      head: 122,
      value17: 125,
      value18: 125,
      value19: 125,
      value20: 100,
      value21: 100,
      value22: 125,
      value23: 125,
      speed: 30,
    });
    expect(packet).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d1e96");
    packet = k1.packetString(k1.config.type.jointMove, {
      head: 122,
      leftAnkle: 106,
      leftArm: 223,
      leftCalf: 60,
      leftFoot: 123,
      leftHand: 116,
      leftHip: 123,
      leftShoulder: 212,
      leftThigh: 129,
      rightAnkle: 146,
      rightArm: 34,
      rightCalf: 190,
      rightFoot: 115,
      rightHand: 126,
      rightHip: 129,
      rightShoulder: 36,
      rightThigh: 118,
      speed: 30,
      value17: 125,
      value18: 125,
      value19: 125,
      value20: 100,
      value21: 100,
      value22: 125,
      value23: 125,
    });
    expect(packet).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d1e96");
  });

  test("build lock packet", () => {
    let packet = k1.packetString(k1.config.type.jointLock, {
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
      value17: 1,
      value18: 0,
      value19: 1,
      value20: 0,
      value21: 1,
      value22: 0,
      value23: 1,
      speed: 0,
    });
    expect(packet).toBe("ffff1bed0001000100010001000100010001000100010001000100010014");
    packet = k1.packetString(k1.config.type.jointLock, {
      head: 0,
      leftAnkle: 0,
      leftArm: 0,
      leftCalf: 1,
      leftFoot: 1,
      leftHand: 1,
      leftHip: 0,
      leftShoulder: 0,
      leftThigh: 0,
      rightAnkle: 1,
      rightArm: 0,
      rightCalf: 0,
      rightFoot: 1,
      rightHand: 1,
      rightHip: 0,
      rightShoulder: 1,
      rightThigh: 1,
      speed: 0,
      value17: 1,
      value18: 0,
      value19: 1,
      value20: 0,
      value21: 1,
      value22: 0,
      value23: 1,
    });
    expect(packet).toBe("ffff1bed0001000100010001000100010001000100010001000100010014");
  });

  test("parse pro action packet", () => {
    const packetString = k1.packetString(k1.config.type.action, "ProAction/Left Punch");
    const packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      name: "action",
      header: "ffff",
      data: "ProAction/Left Punch",
      length: 20,
      checksum: "94",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse action packet", () => {
    const packetString = k1.packetString(k1.config.type.action, "Action/Artificial Intelligence");
    const packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      name: "action",
      header: "ffff",
      data: "Action/Artificial Intelligence",
      length: 30,
      checksum: "af",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse boolean packet", () => {
    let packetString = k1.packetString(k1.config.type.handshake, false);
    let packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0b",
      name: "handshake",
      data: 0,
      checksum: "0e",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
    packetString = k1.packetString("0b", true);
    packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0b",
      name: "handshake",
      data: 1,
      checksum: "0f",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse progress packet", () => {
    let packetString = k1.packetString(k1.config.type.action, 50);
    expect(packetString).toBe("ffff0317324c");
    let buffer = Buffer.from(packetString, "hex");
    let packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "progress",
      type: "17",
      name: "action",
      data: 50,
      checksum: "4c",
      valid: true,
      raw: buffer,
    });
    packetString = k1.packetString(k1.config.type.action, 100);
    expect(packetString).toBe("ffff0317647e");
    buffer = Buffer.from("ffff0317647e", "hex");
    packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "completed",
      type: "17",
      name: "action",
      data: 100,
      checksum: "7e",
      valid: true,
      raw: buffer,
    });
  });

  test("parse handshake packet", () => {
    let packetString = k1.packetString(k1.config.type.handshake, "");
    expect(packetString).toBe("ffff020b0d");
    const buffer = Buffer.from(packetString, "hex");
    expect(buffer).toEqual(k1.packet("0b", ""));
    const packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0b",
      name: "handshake",
      data: "",
      checksum: "0d",
      valid: true,
      raw: buffer,
    });
  });

  test("parse stop packet", () => {
    let packetString = k1.packetString(k1.config.type.stop, "");
    expect(packetString).toBe("ffff020c0e");
    const buffer = Buffer.from(packetString, "hex");
    expect(buffer).toEqual(k1.packet("0c", ""));
    const packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "stop",
      type: "0c",
      name: "stop",
      data: "",
      checksum: "0e",
      valid: true,
      raw: buffer,
    });
  });

  test("parse volume packet", () => {
    let packetString = k1.packetString(k1.config.type.volume, 50);
    expect(packetString).toBe("ffff030d3242");
    const buffer = Buffer.from(packetString, "hex");
    expect(buffer).toEqual(k1.packet("0d", 50));
    const packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0d",
      name: "volume",
      data: 50,
      checksum: "42",
      valid: true,
      raw: buffer,
    });
  });

  test("parse state packet", () => {
    let packetString = k1.packetString(k1.config.type.state, "");
    expect(packetString).toBe("ffff020f11");
    const requestPacket = k1.parsePacketString(packetString);
    expect(requestPacket).toMatchObject({
      kind: "data",
      type: "0f",
      name: "state",
      checksum: "11",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
    packetString = k1.packetString(k1.config.type.state, Buffer.from("0020820000010001", "hex"));
    expect(packetString).toBe("ffff0a0f0020820000010001bd");
    const responsePacket = k1.parsePacketString(packetString);
    expect(responsePacket).toMatchObject({
      kind: "data",
      type: "0f",
      name: "state",
      state: {
        pattern: 0,
        battery: 32,
        volume: 130,
        progress: 0,
        autoStand: 0,
        autoTurn: 1,
        autoPose: 0,
        autoOff: 1,
      },
      checksum: "bd",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse joint packet", () => {
    let packetString = k1.packetString(k1.config.type.program, Buffer.from("813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d", "hex"));
    expect(packetString).toBe("ffff1ae6813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d75");
    let packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "e6",
      name: "program",
      joint: {
        leftThigh: 129,
        leftCalf: 60,
        leftAnkle: 106,
        rightThigh: 118,
        rightCalf: 190,
        rightAnkle: 146,
        leftShoulder: 212,
        rightShoulder: 36,
        leftHip: 123,
        leftFoot: 123,
        rightHip: 129,
        rightFoot: 115,
        leftArm: 223,
        leftHand: 116,
        rightArm: 34,
        rightHand: 126,
        head: 122,
        value17: 125,
        value18: 125,
        value19: 125,
        value20: 100,
        value21: 100,
        value22: 125,
        value23: 125,
        speed: 0,
      },
      checksum: "75",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
    // Head turn right
    packetString = k1.packetString(k1.config.type.jointMove, Buffer.from("813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e", "hex"));
    expect(packetString).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e46");
    packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "e8",
      name: "jointMove",
      joint: {
        leftThigh: 129,
        leftCalf: 60,
        leftAnkle: 106,
        rightThigh: 118,
        rightCalf: 190,
        rightAnkle: 146,
        leftShoulder: 212,
        rightShoulder: 36,
        leftHip: 123,
        leftFoot: 123,
        rightHip: 129,
        rightFoot: 115,
        leftArm: 223,
        leftHand: 116,
        rightArm: 34,
        rightHand: 126,
        head: 42,
        value17: 125,
        value18: 125,
        value19: 125,
        value20: 100,
        value21: 100,
        value22: 125,
        value23: 125,
        speed: 30,
      },
      checksum: "46",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse lock packet", () => {
    let packetString = k1.packetString(k1.config.type.jointLock, Buffer.from("00010001000100010001000100010001000100010001000100", "hex"));
    expect(packetString).toBe("ffff1bed0001000100010001000100010001000100010001000100010014");
    let packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "ed",
      name: "jointLock",
      length: 25,
      joint: {
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
        value17: 1,
        value18: 0,
        value19: 1,
        value20: 0,
        value21: 1,
        value22: 0,
        value23: 1,
        speed: 0,
      },
      checksum: "14",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
    // Lock Head
    packetString = k1.packetString(k1.config.type.jointLock, Buffer.from("00010001000100010001000100010001010100010001000100", "hex"));
    expect(packetString).toBe("ffff1bed0001000100010001000100010001000101010001000100010015");
    packet = k1.parsePacketString(packetString);
    expect(packet).toMatchObject({
      kind: "data",
      type: "ed",
      name: "jointLock",
      joint: {
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
        head: 1,
        value17: 1,
        value18: 0,
        value19: 1,
        value20: 0,
        value21: 1,
        value22: 0,
        value23: 1,
        speed: 0,
      },
      checksum: "15",
      valid: true,
      raw: Buffer.from(packetString, "hex"),
    });
  });

  test("parse unknown packet", () => {
    const buffer = Buffer.from("ffff04175550", "hex");
    const packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      name: "action",
      data: "UP",
      checksum: "50",
      valid: false,
      raw: buffer,
    });
  });

  test("parse non-buffer packet", () => {
    const packet = k1.parsePacket("not a buffer");
    expect(packet).toMatchObject({
      kind: "invalid",
    });
  });

  test("parse short packet", () => {
    const buffer = Buffer.from("abcd", "hex");
    const packet = k1.parsePacket(buffer);
    expect(packet).toMatchObject({
      kind: "invalid",
      raw: buffer,
    });
  });
});
