## Robosen

### K1 (Interstellar Scout K1 Series)

#### Getting Started

- Install [Node.js](https://nodejs.org/en/download)
- Install Project: `npm install`
- Run Project: `npm start`

##### CLI

Terminal:

```shell
  k1
```

- Type `Tab` for completion suggestions
  - E.g., type: `Left Punch`

##### Controller

Terminal:

```shell
  k1 control
```

or

`npm run control`

Press button `A` for `Left Punch`.

#### Repl

Terminal:

```shell
  k1 repl
```

or

`npm run repl`

- Type `Tab` for completion suggestions
  - E.g., type: `Left Punch`

#### Programming

```js
const k1 = new Robot("K1");
await k1.start();
await k1.action("Left Punch");
await k1.end();
```

#### Specification

K1 specification and all commands can be found at [robot/K1.json](src/robot/K1.json).
