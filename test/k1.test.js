"use strict";

const Robot = require("../src/robot");

describe("K1", () => {
  let k1;

  beforeEach(() => {
    k1 = new Robot("K1");
  });

  test("build packet", () => {
    let text = k1.packetString("17", "ProAction/Left Punch");
    expect(text).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    text = k1.packetCommandString({ type: "17", data: "ProAction/Left Punch" });
    expect(text).toBe("ffff161750726f416374696f6e2f4c6566742050756e636894");
    text = k1.packetCommandString({
      type: "17",
      data: "Action/Artificial Intelligence",
    });
    expect(text).toBe(
      "ffff2017416374696f6e2f4172746966696369616c20496e74656c6c6967656e6365af",
    );
  });

  test("parse pro action packet", () => {
    const text = k1.packetString("17", "ProAction/Left Punch");
    const packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      data: "ProAction/Left Punch",
      checksum: "94",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse action packet", () => {
    const text = k1.packetString("17", "Action/Artificial Intelligence");
    const packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "17",
      data: "Action/Artificial Intelligence",
      checksum: "af",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse states packet", () => {
    const text = "ffff0c0f014e8f00000000010001fb";
    const packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "data",
      type: "0f",
      checksum: "fb",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
    const states = {
      AutoOff: packet.bytes.readUInt8(0),
      Battery: packet.bytes.readUInt8(1),
      Volume: packet.bytes.readUInt8(2),
    };
    expect(states).toEqual({
      AutoOff: 1,
      Battery: 78,
      Volume: 143,
    });
  });

  test("parse boolean packet", () => {
    let text = k1.packetString("0b", false);
    let packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "progress",
      type: "0b",
      data: 0,
      checksum: "0e",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
    text = k1.packetString("0b", true);
    packet = k1.parsePacketString(text);
    expect(packet).toMatchObject({
      kind: "progress",
      type: "0b",
      data: 1,
      checksum: "0f",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse progress packet", () => {
    let buffer = Buffer.from("ffff0317324c", "hex");
    let result = k1.parsePacket(buffer);
    expect(result).toMatchObject({
      kind: "progress",
      type: "17",
      data: 50,
      checksum: "4c",
      valid: true,
      raw: buffer,
    });
    buffer = Buffer.from("ffff0317647e", "hex");
    result = k1.parsePacket(buffer);
    expect(result).toMatchObject({
      kind: "completed",
      type: "17",
      data: 100,
      checksum: "7e",
      valid: true,
      raw: buffer,
    });
  });

  test("parse stop command packet", () => {
    const buffer = Buffer.from("ffff020c0e", "hex");
    expect(buffer).toEqual(k1.packet("0c", ""));
    const text = k1.parsePacket(buffer);
    expect(text).toMatchObject({
      kind: "stop",
      type: "0c",
      data: "",
      checksum: "0e",
      valid: true,
      raw: buffer,
    });
  });

  test("parse unknown packet", () => {
    const buffer = Buffer.from("ffff04175550", "hex");
    const result = k1.parsePacket(buffer);
    expect(result).toMatchObject({
      kind: "data",
      type: "17",
      data: "UP",
      checksum: "50",
      valid: false,
      raw: buffer,
    });
  });

  test("parse non-buffer packet", () => {
    const text = k1.parsePacket("not a buffer");
    expect(text).toMatchObject({
      kind: "invalid",
    });
  });

  test("parse short packet", () => {
    const buffer = Buffer.from("abcd", "hex");
    const text = k1.parsePacket(buffer);
    expect(text).toMatchObject({
      kind: "invalid",
      raw: buffer,
    });
  });
});
