"use strict";

const { K1 } = require("../");

describe("K1", () => {
  let k1;

  beforeEach(() => {
    k1 = new K1();
  });

  test("build packet", () => {
    let text = k1.packetString(k1.config.type.action, "ProAction/Left Punch");
    expect(text).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    text = k1.packetCommandString({
      type: k1.config.type.action,
      data: "ProAction/Left Punch",
    });
    expect(text).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    text = k1.packetCommandString({
      type: "17",
      data: "Action/Artificial Intelligence",
    });
    expect(text).toBe("ffff2017416374696f6e2f4172746966696369616c20496e74656c6c6967656e6365af");
  });

  test("build state packet", () => {
    const responsePacket = k1.packetString(k1.config.type.state, {
      pattern: 0,
      battery: 32,
      volume: 130,
      progress: 0,
      autoStand: 0,
      autoTurn: 1,
      autoPose: 0,
      autoOff: 1,
    });
    expect(responsePacket).toBe("ffff0a0f0020820000010001bd");
  });

  test("build joint packet", () => {
    const responsePacket = k1.packetString(k1.config.type.jointMove, {
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
    });
    expect(responsePacket).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e46");
  });

  test("parse pro action packet", () => {
    const text = k1.packetString(k1.config.type.action, "ProAction/Left Punch");
    const packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      name: "action",
      data: "ProAction/Left Punch",
      checksum: "94",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse action packet", () => {
    const text = k1.packetString(k1.config.type.action, "Action/Artificial Intelligence");
    const packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      name: "action",
      data: "Action/Artificial Intelligence",
      checksum: "af",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse boolean packet", () => {
    let text = k1.packetString(k1.config.type.handshake, false);
    let packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0b",
      name: "handshake",
      data: 0,
      checksum: "0e",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
    text = k1.packetString("0b", true);
    packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0b",
      name: "handshake",
      data: 1,
      checksum: "0f",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse progress packet", () => {
    let text = k1.packetString(k1.config.type.action, 50);
    expect(text).toBe("ffff0317324c");
    let buffer = Buffer.from(text, "hex");
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
    text = k1.packetString(k1.config.type.action, 100);
    expect(text).toBe("ffff0317647e");
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
    let text = k1.packetString(k1.config.type.handshake, "");
    expect(text).toBe("ffff020b0d");
    const buffer = Buffer.from(text, "hex");
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
    let text = k1.packetString(k1.config.type.stop, "");
    expect(text).toBe("ffff020c0e");
    const buffer = Buffer.from(text, "hex");
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
    let text = k1.packetString(k1.config.type.volume, 50);
    expect(text).toBe("ffff030d3242");
    const buffer = Buffer.from(text, "hex");
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
    let text = k1.packetString(k1.config.type.state, "");
    expect(text).toBe("ffff020f11");
    const requestPacket = k1.parsePacketString(text);
    expect(requestPacket).toMatchObject({
      kind: "data",
      type: "0f",
      name: "state",
      checksum: "11",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
    text = k1.packetString(k1.config.type.state, Buffer.from("0020820000010001", "hex"));
    expect(text).toBe("ffff0a0f0020820000010001bd");
    const responsePacket = k1.parsePacketString(text);
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
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse joint packet", () => {
    let text = k1.packetString(k1.config.type.program, Buffer.from("813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d", "hex"));
    expect(text).toBe("ffff1ae6813c6a76be92d4247b7b8173df74227e7a7d7d7d64647d7d75");
    let responsePacket = k1.parsePacketString(text);
    expect(responsePacket).toMatchObject({
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
      raw: Buffer.from(text, "hex"),
    });
    // Head turn right
    text = k1.packetString(k1.config.type.jointMove, Buffer.from("813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e", "hex"));
    expect(text).toBe("ffff1be8813c6a76be92d4247b7b8173df74227e2a7d7d7d64647d7d1e46");
    responsePacket = k1.parsePacketString(text);
    expect(responsePacket).toMatchObject({
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
      raw: Buffer.from(text, "hex"),
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
