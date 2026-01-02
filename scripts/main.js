"use strict";

const Robot = require("../src/robot");

(async function main() {
  const k1 = new Robot("K1");
  await k1.on();
  await k1.action("Left Punch");
  await k1.action("Right Punch");
  await k1.end();
})();
