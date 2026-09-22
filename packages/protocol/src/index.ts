export const PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type PlayerId = string;
export type MatchId = string;
export type Tick = number;
export type ClientSequence = number;
export type ServerSequence = number;
export type StateHash = string;

export interface Vector2 {
  x: number;
  y: number;
}

export type UnitOrderQueueMode = "replace" | "append";

export interface MoveCommand {
  type: "move";
  playerId: PlayerId;
  unitIds: readonly string[];
  target: Vector2;
  queueMode?: UnitOrderQueueMode;
}

export interface GatherCommand {
  type: "gather";
  playerId: PlayerId;
  unitIds: readonly string[];
  resourceId: string;
  queueMode?: UnitOrderQueueMode;
}

export interface BuildCommand<TBuildingKind extends string = string> {
  type: "build";
  playerId: PlayerId;
  unitIds: readonly string[];
  buildingKind: TBuildingKind;
  position: Vector2;
  queueMode?: UnitOrderQueueMode;
}

export interface TrainCommand<TUnitKind extends string = string> {
  type: "train";
  playerId: PlayerId;
  buildingId: string;
  unitKind: TUnitKind;
}

export interface ResearchCommand<TTechnologyKind extends string = string> {
  type: "research";
  playerId: PlayerId;
  buildingId: string;
  technologyKind: TTechnologyKind;
}

export interface SetRallyPointCommand {
  type: "set-rally-point";
  playerId: PlayerId;
  buildingId: string;
  target: Vector2;
}

export interface AttackCommand {
  type: "attack";
  playerId: PlayerId;
  unitIds: readonly string[];
  targetUnitId: string;
  queueMode?: UnitOrderQueueMode;
}

export interface AttackBuildingCommand {
  type: "attack-building";
  playerId: PlayerId;
  unitIds: readonly string[];
  targetBuildingId: string;
  queueMode?: UnitOrderQueueMode;
}

export type GameCommand<
  TBuildingKind extends string = string,
  TUnitKind extends string = string,
  TTechnologyKind extends string = string
> =
  | MoveCommand
  | GatherCommand
  | BuildCommand<TBuildingKind>
  | TrainCommand<TUnitKind>
  | ResearchCommand<TTechnologyKind>
  | SetRallyPointCommand
  | AttackCommand
  | AttackBuildingCommand;

export interface CommandEnvelope<TCommand extends GameCommand = GameCommand> {
  protocolVersion: ProtocolVersion;
  matchId: MatchId;
  playerId: PlayerId;
  clientSequence: ClientSequence;
  command: TCommand;
}

export interface GameSnapshot<TState = unknown> {
  protocolVersion: ProtocolVersion;
  matchId: MatchId;
  serverSequence: ServerSequence;
  tick: Tick;
  state: TState;
  stateHash?: StateHash;
}

export interface SnapshotDelta<TDelta = unknown> {
  protocolVersion: ProtocolVersion;
  matchId: MatchId;
  serverSequence: ServerSequence;
  fromTick: Tick;
  toTick: Tick;
  delta: TDelta;
  stateHash?: StateHash;
}

export interface StateHashCheckpoint {
  tick: Tick;
  stateHash: StateHash;
}

export interface ReplayHeader {
  replayVersion: number;
  protocolVersion: ProtocolVersion;
  simulationVersion: string;
  contentVersion: string;
  matchId: MatchId;
  mapSeed: number;
}

export interface ReplayCommand<TCommand extends GameCommand = GameCommand> {
  tick: Tick;
  serverSequence: ServerSequence;
  command: TCommand;
}
