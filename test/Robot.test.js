"use strict";

jest.mock("@abandonware/noble");

const noble = require("@abandonware/noble");
const { Robot, K1 } = require("../");

describe("Robot", () => {
  test("Connect", async () => {
    const robot = new Robot();
    const onPromise = robot.on();
    noble.test(robot);
    await onPromise;
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
      k1 = new K1();
      const onPromise = k1.on();
      noble.test(k1);
      await onPromise;
    });

    afterEach(async () => {
      await k1.off();
    });

    test("Kind", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.command.Kind, "K1", 5);
      });
      const promise = k1.kind();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toBe("K1");
      expect(k1.ready()).toBe(true);
    });

    test("Version", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.command.Version, "1.2.3", 5);
      });
      const promise = k1.version();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toBe("1.2.3");
      expect(k1.ready()).toBe(true);
    });

    test("Date", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.command.Date, "2025-01-01", 5);
      });
      const promise = k1.date();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toBe("2025-01-01");
      expect(k1.ready()).toBe(true);
    });

    test("State", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.command.State, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), 5);
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
        autoPose: 4,
        autoTurn: 5,
        charging: 6,
        autoOff: 7,
      });
      expect(k1.ready()).toBe(true);
    });

    test("List Action Names", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.type.actionNames, "Left Punch", 5);
        noble.receive(k1.config.type.actionNames, "Right Punch", 10);
        noble.receive(k1.config.type.done, "", 15);
      });
      const promise = k1.listActionNames();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toEqual(["Left Punch", "Right Punch"]);
      expect(k1.ready()).toBe(true);
    });

    test("List User Names", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.type.userNames, "Alice", 5);
        noble.receive(k1.config.type.userNames, "Bob", 10);
        noble.receive(k1.config.type.done, "", 15);
      });
      const promise = k1.listUserNames();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toEqual(["Alice", "Bob"]);
      expect(k1.ready()).toBe(true);
    });

    test("List Folder Names", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.type.folderNames, "music", 5);
        noble.receive(k1.config.type.folderNames, "audio", 10);
        noble.receive(k1.config.type.done, "", 15);
      });
      const promise = k1.listFolderNames();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toEqual(["music", "audio"]);
      expect(k1.ready()).toBe(true);
    });

    test("List Audio Names", async () => {
      const call = noble.call(async () => {
        noble.receive(k1.config.type.audioNames, "beep.wav", 5);
        noble.receive(k1.config.type.audioNames, "boop.wav", 10);
        noble.receive(k1.config.type.done, "", 15);
      });
      const promise = k1.listAudioNames();
      expect(call).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(false);
      const result = await promise;
      expect(result).toEqual(["beep.wav", "boop.wav"]);
      expect(k1.ready()).toBe(true);
    });

    test("Stop", async () => {
      const leftPunch = k1.actions("Left Punch");
      let actionCall;
      const performingPromise = new Promise((resolve) => {
        actionCall = noble.call(async () => {
          resolve();
          noble.receive(leftPunch, 25, 5);
        });
      });
      const actionPromise = k1.leftPunch();
      await performingPromise;
      expect(actionCall).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(true);
      const stopCall = noble.call(async () => {
        noble.receive(k1.config.command.Handshake, "", 5);
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
        moveCall = noble.call(async () => {
          resolve();
          const moveForward = k1.config.command.Move["Move Forward"];
          noble.receive(moveForward, 25, 5);
          noble.receive(moveForward, 50, 10);
          noble.receive(moveForward, 100, 15);
        });
      });
      const promise = k1.moveForward(10);
      await performingPromise;
      expect(moveCall).toHaveBeenCalledTimes(1);
      expect(k1.busy()).toBe(true);
      const stopCall = noble.call(async () => {
        noble.receive(k1.config.command.Handshake, "", 5);
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
      const call = noble.call(async () => {
        noble.receive(leftPunch, 25, 5);
        noble.receive(leftPunch, 50, 10);
        noble.receive(leftPunch, 75, 15);
        noble.receive(leftPunch, 100, 20);
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
  });
});
