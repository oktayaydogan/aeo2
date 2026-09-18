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

export interface UnitState {
  id: string;
  ownerId: string;
  position: Vector2;
  destination: Vector2 | null;
  speed: number;
}

export interface SimulationSnapshot {
  tick: number;
  units: readonly UnitState[];
}

export interface MoveCommand {
  type: "move";
  playerId: string;
  unitIds: readonly string[];
  target: Vector2;
}

export type GameCommand = MoveCommand;

export interface SimulationOptions {
  tickRate?: number;
  units?: readonly UnitState[];
  map?: GridMapDefinition;
}
