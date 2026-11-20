#!/usr/bin/env node
"use strict";

const { K1 } = require("../");

(async function main() {
  const k1 = new K1();
  try {
    await k1.on();
    const args = process.argv.slice(2) ?? [];
    const cmd = (args[0] ?? "").toLowerCase();
    const parameter = (args[1] ?? "").toLowerCase();
    switch (cmd) {
      case "r":
      case "repl":
      case "action":
      case "command":
      default:
        await k1.repl();
        break;
      case "c":
      case "control":
      case "move":
      case "walk":
        await k1.control();
        break;
      case "e":
      case "exec":
      case "run":
        await k1.run(parameter);
        break;
      case "p":
      case "prompt":
      case "ai":
      case "llm":
        await k1.promptRepl(parameter);
        break;
      case "v":
      case "voice":
      case "talk":
        await k1.voiceRepl(parameter);
        break;
    }
  } catch (err) {
    k1.logError("Fatal error:", err?.message ?? err);
    process.exitCode = 1;
  } finally {
    await k1.end();
  }
})();
