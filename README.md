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
- Type `Initial Position`

Press `Tab` for completion suggestions

#### Control

Terminal:

- `k1 control` or `npm run control`

- **Controller:**
  - Press button `L` for `Left Punch`
  - Move Robot:
    - Move left stick to control movement
  - Move Joints:
    - Use DPad to select body parts:
      - `up`: Head
      - `right`: Right Arm
      - `left`: Left Arm
      - `down`: None (-> Move Robot)
    - Control body parts with `left`/`right` stick

- **Keyboard:**
  - Move Robot:
    - Use arrow keys to control movement
    - Use `delete`/`pagedown` for side steps
  - Move Joints:
    - Use `WASD` to select body parts:
      - `w`: Head
      - `a`: Left Arm
      - `s`: None (-> Move Robot)
      - `d`: Right Arm
    - Use arrow keys to control movement
    - Use `space` to reset position

Details see `controller`, `keyboard` and `control` section in [K1/robot.json](src/K1/robot.json).

#### Repl

Terminal:

- `k1` or `k1 repl` or `npm run repl`
- Type `Volume 100` to change volume
- Type `Left Punch` to punch left
- Type `Left Arm +30%` to move
  - `number`: absolute value based movement
  - `+/-`: relative value based movement
  - `%`: percentage based movement (0-100%)
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
await k1.headLeft();
await k1.leftHand("+40%", 30);
await k1.audio("AppSysMS/101");
await k1.wait(3000);
await k1.end();
```

#### Specification

K1 specification and all commands can be found at [K1/robot.json](src/K1/robot.json).
