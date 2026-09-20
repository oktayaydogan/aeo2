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

export interface MoveCommand {
  type: "move";
  playerId: string;
  unitIds: readonly string[];
  target: Vector2;
}

export interface GatherCommand {
  type: "gather";
  playerId: string;
  unitIds: readonly string[];
  resourceId: string;
}

export interface BuildCommand {
  type: "build";
  playerId: string;
  unitIds: readonly string[];
  buildingKind: BuildingKind;
  position: Vector2;
}

export interface TrainCommand {
  type: "train";
  playerId: string;
  buildingId: string;
  unitKind: UnitKind;
}

export interface ResearchCommand {
  type: "research";
  playerId: string;
  buildingId: string;
  technologyKind: TechnologyKind;
}

export interface SetRallyPointCommand {
  type: "set-rally-point";
  playerId: string;
  buildingId: string;
  target: Vector2;
}

export interface AttackCommand {
  type: "attack";
  playerId: string;
  unitIds: readonly string[];
  targetUnitId: string;
}

export interface AttackBuildingCommand {
  type: "attack-building";
  playerId: string;
  unitIds: readonly string[];
  targetBuildingId: string;
}

export type MatchStatus = "playing" | "ended";

export interface MatchState {
  status: MatchStatus;
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  reason: "town-center-destroyed" | null;
}

export type GameCommand =
  | MoveCommand
  | GatherCommand
  | BuildCommand
  | TrainCommand
  | ResearchCommand
  | SetRallyPointCommand
  | AttackCommand
  | AttackBuildingCommand;

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
