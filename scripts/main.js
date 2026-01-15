"use strict";

const { K1 } = require("../");

(async function main() {
  const k1 = new K1();
  await k1.on();
  await k1.handshake();
  await k1.version();
  await k1.date();
  await k1.listUserNames();
  await k1.volume(130);
  await k1.toggleAutoOff(true);
  await k1.toggleAutoStand(false);
  await k1.state();
  await k1.moveForward();
  await k1.turnRight();
  await k1.leftPunch();
  await k1.rightPunch();
  await k1.end();
})();
