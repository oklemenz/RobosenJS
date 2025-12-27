"use strict";

const Robot = require("../src/robot");

(async function main() {
  const k1 = new Robot("k1");
  await k1.start();
  await k1.action("Left Punch");
  await k1.stop();
})();
