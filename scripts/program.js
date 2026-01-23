"use strict";

const { K1 } = require("../");
const demo = require("../scripts/demo");

(async function main() {
  const k1 = new K1();
  await k1.on();
  await demo.code(k1);
  await k1.end();
})();
