type MoveDirection =
    | "Move Forward"
    | "Move Backward"
    | "Turn Left"
    | "Turn Right"
    | "Move Left"
    | "Move Right"
    | "Stop";

type ActionName =
    | "Artificial Intelligence"
    | "Boogaloo"
    | "Cyberpunk"
    | "Digital Night"
    | "Funky Wiggle"
    | "Lay Back"
    | "Mechanical Beats"
    | "Robot Talk"
    | "Rocking Soul"
    | "Funny"
    | "Easy Action"
    | "Quick sneak"
    | "The Squat"
    | "Appreciation"
    | "Back Flip"
    | "Battle State"
    | "Bow, Please"
    | "Crazy"
    | "Cross Arms"
    | "Crouch Down"
    | "Do Dog Barks"
    | "Do Exercise"
    | "Do Squats"
    | "Fire In The Hole!"
    | "Front Flip"
    | "Handstand"
    | "Kneel,Please"
    | "Kung Fu"
    | "Lay Down"
    | "Left Kick"
    | "Left Punch"
    | "Mountain Running"
    | "Play Cool"
    | "Play Dead"
    | "Pretend To Fart"
    | "Push Ups"
    | "Right Kick"
    | "Right Punch"
    | "Take A Pee"
    | "Take A Poop"
    | "Take A Seat"
    | "Twist Butt"
    | "Bend Back"
    | "Celebrate"
    | "Close Combat"
    | "Defend The Enemies"
    | "Do Cat Meows"
    | "Double Punch"
    | "Horse Stance"
    | "Keep Rolling Backward"
    | "Launch Cannon"
    | "Lay Face Down"
    | "Lean Back"
    | "Lean Forward"
    | "Open Fire"
    | "Play Drum"
    | "Propose"
    | "Ready To Strafe"
    | "Say Hello"
    | "Start Shooting"
    | "Swing Arms"
    | "Swing Left To Right"
    | "Swing Left"
    | "Swing Right"
    | "Tilt Left"
    | "Tilt Right"
    | "Wave Hands"
    | "Yield";

type BodyName =
    | "None"
    | "Head"
    | "Left Arm"
    | "Right Arm"
    | "Torso";

type JointName =
    | "None"
    | "Head"
    | "Left Shoulder"
    | "Right Shoulder"
    | "Left Arm"
    | "Right Arm"
    | "Left Hand"
    | "Right Hand"
    | "Left Hip"
    | "Right Hip"
    | "Left Thigh"
    | "Right Thigh"
    | "Left Calf"
    | "Right Calf"
    | "Left Ankle"
    | "Right Ankle"
    | "Left Foot"
    | "Right Foot";

interface RobotOptions {
    [key: string]: any;
}

export class Robot {
    constructor(name: string, options?: RobotOptions);

    on(): Promise<void>;

    off(end?: boolean): Promise<void>;

    end(): Promise<void>;

    ready(): boolean;

    busy(): boolean;

    stopping(): boolean;

    connected(): boolean;

    handshake(): Promise<any>;

    version(): Promise<any>;

    date(): Promise<any>;

    state(): Promise<any>;

    parseState(state: string): object;

    move(direction: MoveDirection, time?: number): Promise<any>;

    moveForward(time?: number): Promise<any>;

    moveBackward(time?: number): Promise<any>;

    turnLeft(time?: number): Promise<any>;

    turnRight(time?: number): Promise<any>;

    moveLeft(time?: number): Promise<any>;

    moveRight(time?: number): Promise<any>;

    moveBody(direction: number, time?: number): Promise<any>;

    moveJoint(direction: number, time?: number): Promise<any>;

    stop(): Promise<void>;

    commands(group: string, name?: string): { [name: string]: object } | object;

    actions(name?: String): { [name: string]: object } | object;

    action(name: ActionName, limited?: boolean): Promise<any>;

    perform({command, receive, timeout, check, block, wait, measure}): Promise<any>;

    call(command: object, receive?: { kind: string, type: string }, timeout?: number, measure?: boolean): Promise<any>;

    send(command: object | string | Buffer): Promise<any>;

    packet(type, data): Buffer;

    packetCommand(command: object | string | Buffer): Buffer;

    packetCommandString(command: object | string | Buffer): String;

    packetString(type: String, data: any): String;

    parsePacket(buffer: Buffer): object;

    parsePacketString(text: String): object;

    body(body: BodyName);

    joint(joint: JointName);

    repl(): void;

    voiceRepl(): Promise<void>;

    voice(signal: AbortSignal): Promise<void>;

    promptRepl(): void;

    prompt(prompt: string): Promise<void>;

    control(signal: AbortSignal): Promise<void>;

    wait(milliseconds: number): Promise<void>;

    log(...args: any[]): void;

    artificialIntelligence(): Promise<any>;

    boogaloo(): Promise<any>;

    cyberpunk(): Promise<any>;

    digitalNight(): Promise<any>;

    funkyWiggle(): Promise<any>;

    layBack(): Promise<any>;

    mechanicalBeats(): Promise<any>;

    robotTalk(): Promise<any>;

    rockingSoul(): Promise<any>;

    funny(): Promise<any>;

    easyAction(): Promise<any>;

    quickSneak(): Promise<any>;

    theSquat(): Promise<any>;

    appreciation(): Promise<any>;

    backFlip(): Promise<any>;

    battleState(): Promise<any>;

    bowPlease(): Promise<any>;

    crazy(): Promise<any>;

    crossArms(): Promise<any>;

    crouchDown(): Promise<any>;

    doDogBarks(): Promise<any>;

    doExercise(): Promise<any>;

    doSquats(): Promise<any>;

    fireInTheHole(): Promise<any>;

    frontFlip(): Promise<any>;

    handstand(): Promise<any>;

    kneelPlease(): Promise<any>;

    kungFu(): Promise<any>;

    layDown(): Promise<any>;

    leftKick(): Promise<any>;

    leftPunch(): Promise<any>;

    mountainRunning(): Promise<any>;

    playCool(): Promise<any>;

    playDead(): Promise<any>;

    pretendToFart(): Promise<any>;

    pushUps(): Promise<any>;

    rightKick(): Promise<any>;

    rightPunch(): Promise<any>;

    takeAPee(): Promise<any>;

    takeAPoop(): Promise<any>;

    takeASeat(): Promise<any>;

    twistButt(): Promise<any>;

    bendBack(): Promise<any>;

    celebrate(): Promise<any>;

    closeCombat(): Promise<any>;

    defendTheEnemies(): Promise<any>;

    doCatMeows(): Promise<any>;

    doublePunch(): Promise<any>;

    horseStance(): Promise<any>;

    keepRollingBackward(): Promise<any>;

    launchCannon(): Promise<any>;

    layFaceDown(): Promise<any>;

    leanBack(): Promise<any>;

    leanForward(): Promise<any>;

    openFire(): Promise<any>;

    playDrum(): Promise<any>;

    propose(): Promise<any>;

    readyToStrafe(): Promise<any>;

    sayHello(): Promise<any>;

    startShooting(): Promise<any>;

    swingArms(): Promise<any>;

    swingLeftToRight(): Promise<any>;

    swingLeft(): Promise<any>;

    swingRight(): Promise<any>;

    tiltLeft(): Promise<any>;

    tiltRight(): Promise<any>;

    waveHands(): Promise<any>;

    yield(): Promise<any>;
}
