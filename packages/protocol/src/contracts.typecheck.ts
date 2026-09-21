import {
  PROTOCOL_VERSION,
  type CommandEnvelope,
  type GameCommand,
  type GameSnapshot,
  type ReplayCommand
} from "./index";

type BuildingKind = "house";
type UnitKind = "villager";
type TechnologyKind = "forged-weapons";

const command: GameCommand<BuildingKind, UnitKind, TechnologyKind> = {
  type: "build",
  playerId: "player-1",
  unitIds: ["unit-1"],
  buildingKind: "house",
  position: { x: 4, y: 7 }
};

const envelope: CommandEnvelope<typeof command> = {
  protocolVersion: PROTOCOL_VERSION,
  matchId: "match-1",
  playerId: "player-1",
  clientSequence: 1,
  command
};

const snapshot: GameSnapshot<{ winnerPlayerId: string | null }> = {
  protocolVersion: PROTOCOL_VERSION,
  matchId: envelope.matchId,
  serverSequence: 1,
  tick: 20,
  state: { winnerPlayerId: null }
};

const replayCommand: ReplayCommand<typeof command> = {
  tick: snapshot.tick,
  serverSequence: snapshot.serverSequence,
  command
};

void replayCommand;
