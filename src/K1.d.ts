import {Packet, Robot} from "./Robot";

type MoveDirection =
    | "Move Forward"
    | "Move Backward"
    | "Turn Left"
    | "Turn Right"
    | "Move Left"
    | "Move Right";

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


interface K1Options {
    [key: string]: any;
}

export class K1 extends Robot {
    constructor(options?: K1Options)

    move(direction: MoveDirection, time?: number): Promise<Packet>;

    action(name: ActionName, limited?: boolean): Promise<Packet>;

    selectBody(body: BodyName): void;

    selectJoint(joint: JointName): void;

    artificialIntelligence(): Promise<Packet>;

    boogaloo(): Promise<Packet>;

    cyberpunk(): Promise<Packet>;

    digitalNight(): Promise<Packet>;

    funkyWiggle(): Promise<Packet>;

    layBack(): Promise<Packet>;

    mechanicalBeats(): Promise<Packet>;

    robotTalk(): Promise<Packet>;

    rockingSoul(): Promise<Packet>;

    funny(): Promise<Packet>;

    easyAction(): Promise<Packet>;

    quickSneak(): Promise<Packet>;

    theSquat(): Promise<Packet>;

    appreciation(): Promise<Packet>;

    backFlip(): Promise<Packet>;

    battleState(): Promise<Packet>;

    bowPlease(): Promise<Packet>;

    crazy(): Promise<Packet>;

    crossArms(): Promise<Packet>;

    crouchDown(): Promise<Packet>;

    doDogBarks(): Promise<Packet>;

    doExercise(): Promise<Packet>;

    doSquats(): Promise<Packet>;

    fireInTheHole(): Promise<Packet>;

    frontFlip(): Promise<Packet>;

    handstand(): Promise<Packet>;

    kneelPlease(): Promise<Packet>;

    kungFu(): Promise<Packet>;

    layDown(): Promise<Packet>;

    leftKick(): Promise<Packet>;

    leftPunch(): Promise<Packet>;

    mountainRunning(): Promise<Packet>;

    playCool(): Promise<Packet>;

    playDead(): Promise<Packet>;

    pretendToFart(): Promise<Packet>;

    pushUps(): Promise<Packet>;

    rightKick(): Promise<Packet>;

    rightPunch(): Promise<Packet>;

    takeAPee(): Promise<Packet>;

    takeAPoop(): Promise<Packet>;

    takeASeat(): Promise<Packet>;

    twistButt(): Promise<Packet>;

    bendBack(): Promise<Packet>;

    celebrate(): Promise<Packet>;

    closeCombat(): Promise<Packet>;

    defendTheEnemies(): Promise<Packet>;

    doCatMeows(): Promise<Packet>;

    doublePunch(): Promise<Packet>;

    horseStance(): Promise<Packet>;

    keepRollingBackward(): Promise<Packet>;

    launchCannon(): Promise<Packet>;

    layFaceDown(): Promise<Packet>;

    leanBack(): Promise<Packet>;

    leanForward(): Promise<Packet>;

    openFire(): Promise<Packet>;

    playDrum(): Promise<Packet>;

    propose(): Promise<Packet>;

    readyToStrafe(): Promise<Packet>;

    sayHello(): Promise<Packet>;

    startShooting(): Promise<Packet>;

    swingArms(): Promise<Packet>;

    swingLeftToRight(): Promise<Packet>;

    swingLeft(): Promise<Packet>;

    swingRight(): Promise<Packet>;

    tiltLeft(): Promise<Packet>;

    tiltRight(): Promise<Packet>;

    waveHands(): Promise<Packet>;

    yield(): Promise<Packet>;
}
