"use strict";

const Robot = require("./Robot");

/** @type {import('./k1')} */
module.exports = class K1 extends Robot {
  constructor(options) {
    super("K1", options);
  }
};
