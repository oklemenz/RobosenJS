"use strict";

const globals = require("globals");
const js = require("@eslint/js");

const nodePlugin = require("eslint-plugin-n");
const jestPlugin = require("eslint-plugin-jest");
const configPrettier = require("eslint-config-prettier");

module.exports = [
  {
    ignores: ["**/lib/", "**/node_modules/"],
  },
  js.configs.recommended,
  nodePlugin.configs["flat/recommended-script"],
  jestPlugin.configs["flat/recommended"],
  configPrettier,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      strict: ["error"],
      curly: ["error"],
      "no-unused-vars": ["off"],
      "no-restricted-modules": ["off"],
      "no-eval": ["error"],
      "no-implied-eval": ["error"],
      "no-console": ["off"],
      "no-throw-literal": ["error"],
      "no-control-regex": ["off"],
      "no-constant-binary-expression": ["off"],
      "no-inner-declarations": ["off"],
      "prefer-promise-reject-errors": ["error"],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-var": ["error"],
      "no-prototype-builtins": ["off"],
      "n/no-extraneous-require": ["off"],
      "n/no-unpublished-require": ["off"],
    },
  },
];
