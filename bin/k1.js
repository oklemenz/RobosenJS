#!/usr/bin/env node
"use strict";

const Robot = require("../src/robot");

(async function main() {
  const k1 = new Robot("K1");
  await k1.on();
  const cmd = (process.argv.slice(2)?.[0] ?? "").toLowerCase();
  switch (cmd) {
    case "prompt":
    case "llm":
      await k1.prompt();
      break;
    case "chatgpt":
    case "voice":
      await k1.voice();
      break;
    case "talk":
    case "control":
      await k1.control();
      break;
    case "repl":
    default:
      await k1.repl();
      break;
  }
})();
