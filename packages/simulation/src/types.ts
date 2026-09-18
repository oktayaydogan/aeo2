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
export type UnitKind = "villager" | "military";
export type UnitActivity = "idle" | "moving" | "gathering" | "returning";

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

export interface SimulationSnapshot {
  tick: number;
  units: readonly UnitState[];
  resources: readonly ResourceNodeState[];
  stockpiles: readonly PlayerStockpileState[];
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

export type GameCommand = MoveCommand | GatherCommand;

export interface SimulationOptions {
  tickRate?: number;
  units?: readonly UnitState[];
  map?: GridMapDefinition;
  resources?: readonly ResourceNodeState[];
  dropOffPoints?: readonly DropOffPointState[];
  stockpiles?: Readonly<
    Record<string, Partial<ResourceStockpile>>
  >;
}
