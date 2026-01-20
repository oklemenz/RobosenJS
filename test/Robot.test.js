"use strict";

const noble = require("@abandonware/noble");

const { Robot, K1 } = require("../");

describe("Robot", () => {
  test("Connect", async () => {
    const robot = await noble.test(new Robot());
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

  describe("API", () => {
    let k1;

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
      const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls.slice(-1);
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
      const [[buffer]] = noble.peripheral.characteristic.writeAsync.mock.calls.slice(-1);
      const packet = k1.parsePacket(buffer);
      expect(packet.data).toBe(40);
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
      const leftPunch = k1.commands("Left Punch");
      expect(leftPunch).toBeDefined();
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

    test("Move", async () => {
      let moveCall;
      const performingPromise = new Promise((resolve) => {
        moveCall = noble.mock(async () => {
          resolve();
        });
      });
      const promise = k1.moveForward(10);
      await performingPromise;
      expect(moveCall).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(true);
      const stopCall = noble.mock(async () => {
        noble.notify(k1.config.type.handshake, "", 5);
      });
      const packet = await promise;
      expect(packet).not.toBeDefined();
      expect(stopCall).toHaveBeenCalledTimes(2);
      expect(k1.ready()).toBe(true);
    });

    test("Action", async () => {
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
      const packet = await leftPunchPromise;
      expect(call).toHaveBeenCalledTimes(1);
      expect(packet).toBeDefined();
      expect(packet.kind).toBe("completed");
      expect(packet.type).toBe(leftPunch.type);
      expect(packet.data).toBe(100);
      expect(k1.ready()).toBe(true);
    });

    test("Initial Position", async () => {});

    test("Joint", async () => {});

    test("Joint Delta", async () => {});

    test("Joint Norm", async () => {});

    test("Head Center", async () => {});

    test("Head Left", async () => {});

    test("Head Right", async () => {});

    test("Lock Joint", async () => {});

    test("Unlock Joint", async () => {});

    test("Lock all Joint", async () => {});

    test("Unlock all Joint", async () => {});
  });
});
