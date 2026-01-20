"use strict";

const { K1 } = require("../");

(async function main() {
  const k1 = new K1();
  await k1.on();
  await k1.leftPunch();
  await k1.wait(1000);
  await k1.initialPosition();
  await k1.headLeft();
  await k1.headRight();
  await k1.headCenter();
  await k1.leftHand("+40%", 30);
  await k1.rightHand(0, 30);
})();
