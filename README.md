## Robosen

### K1 (Interstellar Scout K1 Series)

#### Getting Started

- Install [Node.js](https://nodejs.org/en/download)
- Install Project: `npm install`
- Run Project: `npm start`

##### CLI

Terminal:

- `k1`
- Type `Left Punch`
- Type `Tab` for completion suggestions

##### Controller

Terminal:

- `k1 control` or `npm run control`
- Press button `A` for `Left Punch`
- Move left stick to control movement
- Move right stick to control head, body and arms
  - Use D-Pad to select parts

#### Repl

Terminal:

- `k1` or `k1 repl` or `npm run repl`
- Type `Left Punch`
- Type `Tab` for completion suggestions

#### Prompt

Prerequisites:

- Setup `.env` specifying `OPENAI_API_KEY`

Terminal:

- `k1 prompt` or `npm run prompt`
- Type your command in natural language.
  - E.g., type: `Make a left punch`

#### Voice

Prerequisites:

- Setup `.env` specifying `OPENAI_API_KEY`
- Install [dependencies](https://www.npmjs.com/package/node-record-lpcm16#dependencies)

Terminal:

- `k1 voice` or `npm run voice`
- Speak your command in natural language.
  - E.g., say: `Make a left punch`

#### Programming

```js
const k1 = new Robot("K1");
await k1.on();
await k1.action("Left Punch");
await k1.end();
```

#### Specification

K1 specification and all commands can be found at [robot/K1.json](src/robot/K1.json).
