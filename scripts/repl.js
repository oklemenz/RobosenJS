"use strict";

const { K1 } = require("../");

(async function main() {
  const k1 = new K1();
  await k1.on();
  await k1.repl();
})();
