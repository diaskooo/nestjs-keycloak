/**
 * File: /.eslintrc.js
 * Project: nestjs-keycloak
 * File Created: 14-07-2021 11:43:59
 * Author: Clay Risser <email@clayrisser.com>
 * -----
 * Last Modified: 02-04-2022 09:12:18
 * Modified By: Clay Risser
 * -----
 * Silicon Hills LLC (c) Copyright 2021
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const fs = require("fs");

const cspell = JSON.parse(fs.readFileSync(".vscode/settings.json").toString())[
  "cSpell.words"
];

module.exports = {
  extends: ["airbnb-typescript/base", "prettier"],
  parser: "@typescript-eslint/parser",
  root: true,
  env: {
    browser: true,
  },
  plugins: ["spellcheck", "import"],
  parserOptions: {
    project: "./tsconfig.json",
    ecmaFeatures: {
      legacyDecorators: true,
    },
  },
  rules: {
    "no-inner-declarations": "off",
    "@typescript-eslint/comma-dangle": "off",
    "@typescript-eslint/no-redeclare": "off",
    "@typescript-eslint/indent": "off",
    "@typescript-eslint/no-shadow": "off",
    "@typescript-eslint/no-use-before-define": "off",
    "arrow-body-style": "off",
    "class-methods-use-this": "off",
    "comma-dangle": "off",
    "default-case": "off",
    "import/extensions": [
      "error",
      "never",
      {
        decorator: "always",
        json: "always",
        middleware: "always",
        module: "always",
        provider: "always",
        service: "always",
      },
    ],
    "import/no-cycle": "off",
    "import/prefer-default-export": "off",
    "max-classes-per-file": "off",
    "max-lines": ["error", 999],
    "max-lines-per-function": ["warn", 99],
    "no-await-in-loop": "off",
    "no-empty-function": ["warn", { allow: ["constructors"] }],
    "no-extra-boolean-cast": "off",
    "no-param-reassign": "off",
    "no-plusplus": "off",
    "no-return-assign": "off",
    "no-shadow": "off",
    "no-underscore-dangle": "off",
    "no-use-before-define": "off",
    "no-useless-constructor": "off",
    "react/jsx-props-no-spreading": "off",
    yoda: "off",
    "spellcheck/spell-checker": [
      "warn",
      {
        comments: true,
        strings: true,
        identifiers: true,
        lang: "en_US",
        skipWords: cspell,
        skipIfMatch: ["http?://[^s]*", "^[-\\w]+/[-\\w\\.]+$"],
        skipWordIfMatch: [],
        minLength: 3,
      },
    ],
    "lines-between-class-members": [
      "error",
      "always",
      { exceptAfterSingleLine: true },
    ],
    "import/no-unresolved": [
      "error",
      {
        ignore: ["^~"],
      },
    ],
    "no-unused-vars": [
      "warn",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "all",
      },
    ],
    "@typescript-eslint/lines-between-class-members": [
      "error",
      "always",
      { exceptAfterSingleLine: true },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        args: "after-used",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        vars: "all",
      },
    ],
    "import/no-extraneous-dependencies": [
      "error",
      {
        devDependencies: [
          "**/*.spec.js",
          "**/*.spec.jsx",
          "**/*.spec.ts",
          "**/*.spec.tsx",
          "**/*.test.js",
          "**/*.test.jsx",
          "**/*.test.ts",
          "**/*.test.tsx",
          "tests/**/*.js",
          "tests/**/*.jsx",
          "tests/**/*.ts",
          "tests/**/*.tsx",
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["*.test.js", "*.test.jsx", "*.test.ts", "*.test.tsx"],
      env: {
        jest: true,
      },
      plugins: ["jest"],
    },
    {
      files: ["*.ts", "*.tsx"],
      rules: {
        "no-unused-vars": "off",
      },
    },
  ],
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },
};
