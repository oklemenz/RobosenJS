## Robosen

### K1 (Interstellar Scout K1 Series)

#### Getting Started

- Install [Node.js](https://nodejs.org/en/download)
- Install Project: `npm install`
- Run Project: `npm start`
  - Type `Tab` for completion suggestions
  - E.g., type: `Left Punch`

#### Programming

```js
const K1 = new Robot("K1");
await K1.start();
await K1.peform("Left Punch");
await K1.stop();
```

#### Specification

- K1 specification and all commands can be found at [robot/K1.json](robot/K1.json).
