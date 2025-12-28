#!/usr/bin/env node
"use strict";

const Robot = require("../src/robot");

(async function main() {
  const k1 = new Robot("K1");
  await k1.start();
  const cmd = (process.argv.slice(2)?.[0] ?? "").toLowerCase();
  switch (cmd) {
    case "prompt":
    case "chatgpt":
    case "llm":
      k1.prompt();
      break;
    case "talk":
    case "voice":
      k1.voice();
      break;
    case "control":
      k1.control();
      break;
    case "repl":
    default:
      k1.repl();
      break;
  }
})();
