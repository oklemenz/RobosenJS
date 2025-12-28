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
  });

  test("parse packet", () => {
    const text = k1.packetString("17", "ProAction/Left Punch");
    const result = k1.parsePacketString(text);
    expect(result).toMatchObject({
      kind: "data",
      type: "17",
      data: "ProAction/Left Punch",
      checksum: "94",
      valid: true,
      raw: Buffer.from(text, "hex"),
    });
  });

  test("parse 50% progress packet", () => {
    const buffer = Buffer.from("ffff0317324c", "hex");
    const result = k1.parsePacket(buffer);
    expect(result).toMatchObject({
      kind: "progress",
      type: "17",
      data: 50,
      checksum: "4c",
      valid: true,
      raw: buffer,
    });
  });

  test("parse 100% completed packet", () => {
    const buffer = Buffer.from("ffff0317647e", "hex");
    const result = k1.parsePacket(buffer);
    expect(result).toMatchObject({
      kind: "completed",
      type: "17",
      data: 100,
      checksum: "7e",
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
