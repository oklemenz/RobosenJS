type PacketKind =
    | "none"
    | "data"
    | "progress"
    | "completed"
    | "stop"
    | "invalid";

type PacketType =
    | "00" // InstructMoves
    | "01" // MoveNorth
    | "02" // MoveNE
    | "03" // MoveEast
    | "04" // MoveSE
    | "05" // MoveSouth
    | "06" // MoveSW
    | "07" // MoveWest
    | "08" // MoveNW
    | "09" // RegularMoves
    | "0a" // Transform
    | "0b" // HandShake
    | "0c" // StopMove
    | "0d" // VoiceControl
    | "0e" // NoneUsed
    | "0f" // States
    | "10" // GetUserActionName
    | "11" // GyrosOfforOn
    | "13" // RobotAutoOff
    | "14" // GetOffActionName
    | "15" // OfficialMoves
    | "16" // GetFolderActionNames
    | "17" // FolderActionNameMovesOrActionProgress
    | "18" // GetFolderAudioNames
    | "19" // PlayAudioInFolder
    | "1a" // SetAutoTurn
    | "1b" // SetAutoPose
    | "33" // forward
    | "34" // back
    | "36" // fire
    | "37" // Turn_left
    | "38" // Turn_right
    | "39" // shift_left
    | "3a" // right_shift
    | "d3" // Eye_lights_are_always_on
    | "d4" // blinking_eye_lights
    | "d5" // Excessive_discoloration
    | "d6" // breathing_light
    | "d7" // Marquee
    | "dc" // CreatNewRobotActionFileAndDone
    | "dd" // DeleteActionByFilePath
    | "e3" // WriteDataToNewFileAndWriteSuccess
    | "e6" // InEditor
    | "e7" // ExitEditor
    | "e8" // MoveJoint
    | "e9" // RobotUpJoint
    | "ea" // UnLockAllJoint
    | "eb" // LockAllJoint
    | "ec" // OneJointLockControl
    | "ed" // JointLockControl
    | "ee" // PlayAudioControl
    | "f4" // RobotNormalPos
    | "f5" // RobotOnUSBMode
    | "f6" // GetRobotKindName
    | "f7" // GetRobotVersion
    | "f8" // GetRobotVersionDate
    | "fa" // GetFileNameDone / RobotShutDown
    | "ff" // Failure
    ;

interface Command {
    type: string;
    data?: string | number | boolean | Buffer;
}

interface Packet {
    kind?: PacketKind;
    type: PacketType;
    name?: string;
    data?: string | number;
    state?: State;
    bytes?: Buffer;
    checksum?: string;
    valid?: boolean;
    raw?: Buffer;

    toString(): string;

    toLogString(): string;
}

interface Receive {
    kind?: PacketKind,
    type: PacketType,
    collect?: PacketType,
    result?: Packet[]
}

interface State {
    pattern: number,
    battery: number,
    volume: number,
    progress: number,
    autoStand: number,
    autoTurn: number,
    autoPose: number,
    autoOff: number
}

interface Parameters {
    command: Command,
    receive?: Receive,
    limited?: boolean,
    check?: boolean,
    block?: boolean,
    wait?: boolean,
    measure?: boolean,
    timeout?: number
}

interface RobotOptions {
    [key: string]: any;
}

export class Robot {
    constructor(name?: string, options?: RobotOptions);

    on(): Promise<void>;

    off(end?: boolean): Promise<void>;

    end(): Promise<void>;

    connected(): boolean;

    ready(): boolean;

    busy(): boolean;

    stopping(): boolean;

    handshake(): Promise<void>;

    stop(): Promise<void>;

    shutdown(): Promise<void>;

    kind(): Promise<string>;

    version(): Promise<string>;

    date(): Promise<string>;

    state(): Promise<State>;

    toggle(type: PacketType, value: boolean): Promise<void>;

    autoStand(value: boolean): Promise<void>;

    autoOff(value: boolean): Promise<void>;

    list(type: PacketType): Promise<string[]>;

    actionNames(): Promise<string[]>;

    userNames(): Promise<string[]>;

    folderNames(): Promise<string[]>;

    audioNames(): Promise<string[]>;

    volume(level: number): Promise<number>;

    increaseVolume(step: number): Promise<number>;

    decreaseVolume(step: number): Promise<number>;

    audio(name: string): Promise<void>;

    move(direction: string, time?: number): Promise<Packet>;

    moveForward(time?: number): Promise<Packet>;

    moveBackward(time?: number): Promise<Packet>;

    turnLeft(time?: number): Promise<Packet>;

    turnRight(time?: number): Promise<Packet>;

    moveLeft(time?: number): Promise<Packet>;

    moveRight(time?: number): Promise<Packet>;

    moveBody(direction: number, time?: number): Promise<Packet>;

    moveJoint(direction: number, time?: number): Promise<Packet>;

    commands(name?: string, types?: string[]): { [name: string]: Command[] } | Command;

    command(name: string, types?: string[], limited?: boolean): Promise<Packet>;

    actions(name?: string): { [name: string]: Command[] } | Command;

    action(name: string, limited?: boolean): Promise<Packet>;

    perform({command, receive, limited, check, block, wait, measure, timeout}: Parameters): Promise<Packet>;

    call(command: Command, receive?: Receive, measure?: boolean, timeout?: number): Promise<Packet>;

    send(command: Command | string | Buffer): Promise<any>;

    packet(type: PacketType, data: string | number | boolean | Buffer): Buffer;

    packetString(type: PacketType, data: string | number | boolean | Buffer): string;

    packetCommand(command: Command | string | Buffer): Buffer;

    packetCommandString(command: Command | string | Buffer): string;

    parsePacket(buffer: Buffer): Packet;

    parsePacketString(string: string): Packet;

    checksum(buffer: Buffer): string;

    selectBody(body: string);

    selectJoint(joint: string);

    repl(): void;

    voice(signal?: AbortSignal): Promise<void>;

    voiceRepl(): Promise<void>;

    prompt(prompt: string): Promise<void>;

    promptRepl(): void;

    control(signal?: AbortSignal): Promise<void>;

    wait(milliseconds: number): Promise<void>;

    log(...args: any[]): void;
}