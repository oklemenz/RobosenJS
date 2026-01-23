"use strict";

module.exports = {
  main: async (k1) => {
    await k1.handshake();
    await k1.version();
    await k1.date();
    await k1.userNames();
    await k1.volume(130);
    await k1.audio("AppSysMS/101");
    await k1.wait(3000);
    await k1.autoOff(true);
    await k1.autoStand(false);
    await k1.state();
    await k1.moveForward();
    await k1.turnRight();
    await k1.leftPunch();
    await k1.rightPunch();
  },
  code: async (k1) => {
    await k1.initialPosition();
    await k1.headLeft();
    await k1.headRight();
    await k1.headCenter();
    await k1.leftHand("+40%", 30);
    await k1.rightHand(50, 30);
    await k1.unlockLeftHand();
  },
};
