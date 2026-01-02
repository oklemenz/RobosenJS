"use strict";

const Robot = require("../src/robot");

(async function main() {
  const k1 = new Robot("K1");
  await k1.on();
  k1.control();
})();
