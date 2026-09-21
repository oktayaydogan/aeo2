import type {
  AttackBuildingCommand as ProtocolAttackBuildingCommand,
  AttackCommand as ProtocolAttackCommand,
  BuildCommand as ProtocolBuildCommand,
  GameCommand as ProtocolGameCommand,
  GatherCommand as ProtocolGatherCommand,
  MoveCommand as ProtocolMoveCommand,
  ResearchCommand as ProtocolResearchCommand,
  SetRallyPointCommand as ProtocolSetRallyPointCommand,
  TrainCommand as ProtocolTrainCommand
} from "@aeo2/protocol";

export interface Vector2 {
  x: number;
  y: number;
}

export interface GridCell {
  x: number;
  y: number;
}

export interface GridMapDefinition {
  width: number;
  height: number;
  blocked?: readonly GridCell[];
}

export type ResourceKind = "wood" | "food" | "gold";
export type UnitKind = "villager" | "militia" | "archer" | "spearman";
export type UnitActivity =
  | "idle"
  | "moving"
  | "gathering"
  | "returning"
  | "building"
  | "attacking";

export type BuildingKind =
  | "town-center"
  | "house"
  | "barracks"
  | "archery-range";

export type TechnologyKind = "forged-weapons";

export interface CargoState {
  kind: ResourceKind;
  amount: number;
}

export interface UnitState {
  id: string;
  ownerId: string;
  kind: UnitKind;
  position: Vector2;
  destination: Vector2 | null;
  speed: number;
  hitPoints: number;
  activity: UnitActivity;
  cargo: CargoState | null;
}

export interface ResourceNodeState {
  id: string;
  kind: ResourceKind;
  position: Vector2;
  amount: number;
}

export interface DropOffPointState {
  id: string;
  ownerId: string;
  position: Vector2;
  accepts?: readonly ResourceKind[];
}

export interface ResourceStockpile {
  wood: number;
  food: number;
  gold: number;
}

export interface PlayerStockpileState {
  playerId: string;
  resources: ResourceStockpile;
}

export interface PlayerPopulationState {
  playerId: string;
  used: number;
  queued: number;
  cap: number;
}

export interface UnitAttackBonus {
  targetKind: UnitKind;
  damage: number;
}

export interface UnitDefinition {
  kind: UnitKind;
  displayName: string;
  cost: ResourceStockpile;
  trainTimeSeconds: number;
  maxHitPoints: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownSeconds: number;
  populationCost: number;
  bonuses?: readonly UnitAttackBonus[];
}

export interface BuildingDefinition {
  kind: BuildingKind;
  displayName: string;
  footprint: {
    width: number;
    height: number;
  };
  cost: ResourceStockpile;
  buildTimeSeconds: number;
  maxHitPoints: number;
  populationProvided: number;
}

export interface TrainingQueueItemState {
  unitKind: UnitKind;
  progress: number;
}

export interface TechnologyDefinition {
  kind: TechnologyKind;
  displayName: string;
  cost: ResourceStockpile;
  researchTimeSeconds: number;
  buildingKind: BuildingKind;
  attackDamageBonus: number;
}

export interface ResearchQueueItemState {
  technologyKind: TechnologyKind;
  progress: number;
}

export interface BuildingState {
  id: string;
  ownerId: string;
  kind: BuildingKind;
  position: Vector2;
  progress: number;
  completed: boolean;
  hitPoints: number;
  trainingQueue: TrainingQueueItemState[];
  researchQueue?: ResearchQueueItemState[];
  rallyPoint?: Vector2 | null;
}

export type AiMode =
  | "waiting"
  | "economy"
  | "military"
  | "attacking"
  | "idle";

export interface AiPlayerState {
  playerId: string;
  mode: AiMode;
}

export interface PlayerTechnologyState {
  playerId: string;
  researched: readonly TechnologyKind[];
}

export interface SimulationSnapshot {
  tick: number;
  units: readonly UnitState[];
  resources: readonly ResourceNodeState[];
  stockpiles: readonly PlayerStockpileState[];
  population: readonly PlayerPopulationState[];
  aiPlayers: readonly AiPlayerState[];
  technologies: readonly PlayerTechnologyState[];
  match: MatchState;
  buildings: readonly BuildingState[];
}

export type MoveCommand = ProtocolMoveCommand;
export type GatherCommand = ProtocolGatherCommand;
export type BuildCommand = ProtocolBuildCommand<BuildingKind>;
export type TrainCommand = ProtocolTrainCommand<UnitKind>;
export type ResearchCommand = ProtocolResearchCommand<TechnologyKind>;
export type SetRallyPointCommand = ProtocolSetRallyPointCommand;
export type AttackCommand = ProtocolAttackCommand;
export type AttackBuildingCommand = ProtocolAttackBuildingCommand;

export type MatchStatus = "playing" | "ended";

export interface MatchState {
  status: MatchStatus;
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  reason: "town-center-destroyed" | null;
}

export type GameCommand = ProtocolGameCommand<
  BuildingKind,
  UnitKind,
  TechnologyKind
>;

export interface AiPlayerDefinition {
  playerId: string;
  enemyPlayerId: string;
  thinkIntervalTicks?: number;
  targetVillagers?: number;
  targetMilitary?: number;
  attackThreshold?: number;
}

export interface SimulationOptions {
  tickRate?: number;
  units?: readonly UnitState[];
  map?: GridMapDefinition;
  resources?: readonly ResourceNodeState[];
  dropOffPoints?: readonly DropOffPointState[];
  buildingDefinitions?: readonly BuildingDefinition[];
  unitDefinitions?: readonly UnitDefinition[];
  technologyDefinitions?: readonly TechnologyDefinition[];
  buildings?: readonly BuildingState[];
  aiPlayers?: readonly AiPlayerDefinition[];
  stockpiles?: Readonly<
    Record<string, Partial<ResourceStockpile>>
  >;
}
