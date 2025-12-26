"use strict";

const Robot = require("./robot");

(async function main() {
  const K1 = new Robot("K1");
  await K1.start();
  await K1.repl();
  process.on("SIGINT", async () => {
    await K1.stop();
    process.exit(0);
  });
})();
