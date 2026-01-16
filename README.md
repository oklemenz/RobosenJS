## RobosenJS

### K1 (Interstellar Scout K1 Series)

#### Getting Started

- Install [Node.js](https://nodejs.org/en/download)
- Install Project: `npm install`
- Run Project: `npm start`
- Run Tests: `npm test`

#### CLI

Terminal:

- `k1`
- Type `Left Punch`
- Press `Tab` for completion suggestions

#### Control

Terminal:

- `k1 control` or `npm run control`
- **Controller:**
  - Press button `L` for `Left Punch`
  - Move left stick to control movement
  - Details see `controller` section in [robot configuration](./src/K1/robot.json)
- **Keyboard:**
  - Arrow keys to control movement
  - Details see `keyboard` section in [robot configuration](./src/K1/robot.json)

#### Repl

Terminal:

- `k1` or `k1 repl` or `npm run repl`
- Type `Volume 100` to change volume
- Type `Left Punch` to punch left
- Press `Tab` for completion suggestions

#### Prompt

Prerequisites:

- Setup [.env](.env) specifying `OPENAI_API_KEY`

Terminal:

- `k1 prompt` or `npm run prompt`
- Type your command in natural language.
  - E.g., enter: `Walk forward and punch left`

#### Voice

Prerequisites:

- Install [dependencies](https://www.npmjs.com/package/node-record-lpcm16#dependencies)
- Setup [.env](.env) specifying `OPENAI_API_KEY`

Terminal:

- `k1 voice` or `npm run voice`
- Speak your command in natural language.
  - E.g., say: `Walk forward and punch left`

#### Programming

```js
const { K1 } = require("robosen-js");
const k1 = new K1();
await k1.on();
await k1.volume(100);
await k1.autoStand(false);
await k1.moveForward();
await k1.leftPunch();
await k1.end();
```

#### Specification

K1 specification and all commands can be found at [K1/robot.json](src/K1/robot.json).
