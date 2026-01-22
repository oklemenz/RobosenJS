type PacketKind =
    | "none"
    | "data"
    | "progress"
    | "completed"
    | "stop"
    | "invalid"
    ;

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

    [key: string]: any;
}

interface Parameters<Packet> {
    command: Command,
    receive?: Receive<Packet>,
    limited?: boolean,
    check?: boolean,
    block?: boolean,
    wait?: boolean,
    measure?: boolean,
    timeout?: number
}

interface Receive<Packet> {
    kind?: PacketKind,
    type: PacketType,
    collect?: PacketType,
    result?: Packet[]
}

interface RobotOptions {
    [key: string]: any;
}

export class Robot<Packet, State, Joint> {

    constructor(name?: string, options?: RobotOptions);

    config: RobotConfig;

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

    initialPosition(norm?: boolean): Promise<Joint>;

    moveJoint(name: string, value: number | string, speed?: number, norm?: boolean): Promise<Joint>;

    moveJoints(joints: Joint, speed?: number, norm?: boolean): Promise<Joint>;

    moveJointsDelta(deltas: Joint, speed?: number, norm?: boolean): Promise<Joint>;

    moveJointsNorm(joints: Joint, speed?: number): Promise<Joint>;

    headCenter(speed?: number, norm?: boolean): Promise<Joint>;

    headLeft(speed?: number, norm?: boolean): Promise<Joint>;

    headRight(speed?: number, norm?: boolean): Promise<Joint>;

    lockJoint(name: string): Promise<Joint>;

    lockJoints(joints: Joint): Promise<Joint>;

    lockAllJoints(): Promise<Joint>;

    unlockJoint(name: string): Promise<Joint>;

    unlockJoints(joints: Joint): Promise<Joint>;

    unlockAllJoints(): Promise<Joint>;

    kind(): Promise<string>;

    version(): Promise<string>;

    date(): Promise<string>;

    state(): Promise<State>;

    toggle(type: PacketType, value: boolean): Promise<void>;

    autoStand(value: boolean): Promise<void>;

    autoOff(value: boolean): Promise<void>;

    autoTurn(value: boolean): Promise<void>;

    autoPose(value: boolean): Promise<void>;

    list(type: PacketType): Promise<string[]>;

    actionNames(): Promise<string[]>;

    userNames(): Promise<string[]>;

    folderNames(): Promise<string[]>;

    audioNames(): Promise<string[]>;

    mute(): Promise<Packet>;

    volume(level: number): Promise<Packet>;

    increaseVolume(step: number): Promise<number>;

    decreaseVolume(step: number): Promise<number>;

    volumeLow(): Promise<Packet>;

    volumeMedium(): Promise<Packet>;

    volumeHigh(): Promise<Packet>;

    audio(name: string): Promise<void>;

    move(direction: string, time?: number): Promise<Packet>;

    moveForward(time?: number): Promise<Packet>;

    moveBackward(time?: number): Promise<Packet>;

    turnLeft(time?: number): Promise<Packet>;

    turnRight(time?: number): Promise<Packet>;

    moveLeft(time?: number): Promise<Packet>;

    moveRight(time?: number): Promise<Packet>;

    commands(name?: string, types?: string[]): { [name: string]: Command[] } | Command;

    actions(name?: string): { [name: string]: Command[] } | Command;

    command(name: string, args?: any[], types?: string[], limited?: boolean): Promise<Packet>;

    action(name: string, args?: any[], limited?: boolean): Promise<Packet>;

    perform({command, receive, limited, check, block, wait, measure, timeout}: Parameters<Packet>): Promise<Packet>;

    call(command: Command, receive?: Receive<Packet>, measure?: boolean, timeout?: number): Promise<Packet>;

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

    controlSelection(value: number, time?: number): Promise<Packet>;

    repl(): void;

    voice(signal?: AbortSignal): Promise<void>;

    voiceRepl(): Promise<void>;

    prompt(prompt: string): Promise<void>;

    promptRepl(): void;

    control(signal?: AbortSignal): Promise<void>;

    wait(milliseconds: number): Promise<void>;

    log(...args: any[]): void;

    logError(...args: any[]): void;

    logWarning(...args: any[]): void;

    logInfo(...args: any[]): void;

    logVerbose(...args: any[]): void;
}

export interface RobotConfig {
    code: string;
    name: string;
    spec: SpecConfig;
    log: LogConfig;
    constant: Record<string, string>;
    duration: DurationConfig;
    state: Record<string, StateEntry>;
    type: Record<string, TypeEntry>;
    body: Record<string, BodyEntry>;
    joint: Record<string, JointConfig>;
    direction: Record<string, string>;
    command: CommandConfig;
    llm: LLMConfig;
    recording: RecordingConfig;
    controller: ControllerConfig;
    keyboard: KeyboardConfig;
    control: ControlConfig;
}

export interface SpecConfig {
    manufacturerUuid: string;
    serviceUuid: string;
    characteristicsUuid: string;
    header: string;
}

export interface LogConfig {
    active: boolean;
    traffic: boolean;
    level: "verbose" | "info" | "warn" | "error";
    prompt: string;
    indent: string;
    mark: string;
}

export interface DurationConfig {
    announcement: number;
    warmup: number;
    cooldown: number;
    timeout: number;
    buffer: number;
    stop: number;
    jointDelay: number;
    lockDelay: number;
}

export interface StateEntry {
    index: number;
}

export interface TypeEntry {
    code: string;
    alt?: string;
    data?: number | string | boolean;
    value?: "string" | "state" | "joint";
    min?: number;
    max?: number;
    move?: boolean;
    toggle?: boolean;
    list?: boolean;
    struct?: boolean;
    progress?: boolean;
}

export interface BodyEntry {
    name: string;
}

export interface JointConfig {
    index: number;
    value: number;
    min: number;
    max: number;
    body?: string;
    norm?: boolean;
}

export interface CommandEntry {
    name?: string;
    group?: string;
    kind?: number | string;
    type?: string;
    func?: string;
    data?: unknown;
    timeout?: number;
    duration?: number;
    speed?: number;
    step?: number;
    parameter?: boolean;
    receive?: PacketKind;
    description?: string;
    status?: number;
    end?: boolean;
    stop?: boolean;
    check?: boolean;
    pro?: boolean;
}

export interface CommandGroup {
    group: true;
    block?: boolean;
    derive?: boolean;
    receive?: PacketKind;
    type?: string;
    func?: string;
    speed?: number;
    timeout?: number;
    parameter?: boolean;
    data?: unknown;
    min?: number;
    max?: number;
    time?: number;

    [commandName: string]: CommandEntry | boolean | string | number | undefined;
}

export interface CommandConfig {
    [groupName: string]: CommandGroup;
}

export interface LLMConfig {
    provider: string;
    env: string;
    model: {
        default: string;
        voice: string;
    };
    command: PromptConfig;
    joint: PromptConfig;
}

export interface PromptConfig {
    systemPrompt: string;
    userPrompt: string;
}

export interface RecordingConfig {
    warmup: number;
    minDuration: number;
    maxDuration: number;
    stopOnSilence: boolean;
    silenceDuration: number;
    silenceThreshold: number;
    voice: {
        sampleRate: number;
        frameMs: number;
        rmsThreshold: number;
        minVoicedMs: number;
    };
}

export interface ControllerConfig {
    [controllerName: string]: GameController;
}

export interface GameController {
    vendorId: number;
    productId: number;
    product: string;
    usagePage: number;
    usage: number;
    deadZone: number;
    button: Record<string, ButtonBinding>;
    axis: Record<string, AxisBinding>;
    stick: Record<string, StickMapping>;
}

export interface ButtonBinding {
    index: number;
    value: number;
    command?: string;
    body?: string | null;
}

export interface AxisBinding {
    index: number;
    bias: number;
    stick: string;
    direction: "x" | "y";
}

export type StickMapping = Record<
    `${"x" | "y"}=${-1 | 0 | 1},${"y"}=${-1 | 0 | 1}`,
    {
        move?: string;
        stop?: boolean;
    }
>;

export interface KeyboardConfig {
    release: number;
    key: Record<
        string,
        {
            move?: string;
            stop?: boolean;
            body?: string | null;
        }
    >;
}

export interface ControlConfig {
    input: number;
    speed: number;
    step: number;

    joint: Record<
        string,
        {
            body: string;
            axis: "x" | "y";
            control?: string;
            key?: string;
        }
    >;
}

