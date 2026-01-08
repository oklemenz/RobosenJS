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
    case "chatgpt":
      await k1.promptRepl();
      break;
    case "voice":
    case "talk":
      await k1.voiceRepl();
      break;
    case "control":
      await k1.control();
      break;
    case "repl":
    case "action":
    default:
      await k1.repl();
      break;
  }
})();
