"use strict";

const EventEmitter = require("events");

class MockRobotCharacteristic extends EventEmitter {
  constructor(robot) {
    super();
    this.robot = robot;
    this.writeAsync = jest.fn(async () => {});
    this.subscribeAsync = jest.fn(async () => {});
    this.unsubscribeAsync = jest.fn(async () => {});
  }

  emitData(buffer) {
    this.emit("data", buffer);
  }

  emitPacket(type, data) {
    this.emitData(this.robot.packet(type, data));
  }
}

class MockRobotPeripheral extends EventEmitter {
  constructor(robot) {
    super();
    this.robot = robot;
    this.advertisement = { localName: this.robot.name };
    this.characteristic = new MockRobotCharacteristic(this.robot);
    this.serviceUuid = this.robot.config.spec.serviceUuid;
    this.characteristicUuid = this.robot.config.spec.characteristicUuid;
  }

  connectAsync = jest.fn(async () => {});
  disconnectAsync = jest.fn(async () => {});

  discoverSomeServicesAndCharacteristicsAsync = jest.fn(async (serviceUuids, characteristicUuids) => {
    return {
      services: [],
      characteristics: [this.characteristic],
    };
  });
}

class MockRobotNoble extends EventEmitter {
  constructor() {
    super();
    this.startScanningAsync = jest.fn(async () => {});
    this.stopScanningAsync = jest.fn(async () => {});
  }

  async test(robot) {
    this.robot = robot;
    this.robot.config.log.level = "error";
    this.robot.config.duration = {};
    this.peripheral = new MockRobotPeripheral(this.robot);
    const onPromise = this.robot.on();
    this.emit("stateChange", "poweredOn");
    this.emit("discover", this.peripheral);
    await onPromise;
    return this.robot;
  }

  mock(fn) {
    this.peripheral.characteristic.writeAsync.mockImplementationOnce(async () => {
      await fn(this);
    });
    return this.peripheral.characteristic.writeAsync;
  }

  notify(type, data, wait) {
    this.robot.wait(wait);
    this.peripheral.characteristic.emitPacket(type, data);
  }
}

module.exports = new MockRobotNoble();
