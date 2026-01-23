#!/usr/bin/env node
"use strict";

const { K1 } = require("../");
const demo = require("../scripts/demo");

(async function main() {
  const k1 = new K1();
  await k1.on();
  const cmd = (process.argv.slice(2)?.[0] ?? "").toLowerCase();
  switch (cmd) {
    case "d":
    case "demo":
      await demo.main(k1);
      break;
    case "code":
      await demo.code(k1);
      break;
    case "p":
    case "prompt":
    case "ai":
    case "llm":
    case "chatgpt":
      await k1.promptRepl();
      break;
    case "v":
    case "voice":
    case "talk":
      await k1.voiceRepl();
      break;
    case "c":
    case "control":
    case "move":
    case "walk":
      await k1.control();
      break;
    case "r":
    case "repl":
    case "action":
    case "command":
    default:
      await k1.repl();
      break;
  }
  await k1.end();
})();
