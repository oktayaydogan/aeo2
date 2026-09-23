import type {
  CommandRejectionReason
} from "@aeo2/simulation";

const MESSAGES: Record<CommandRejectionReason, string> = {
  "no-controllable-units": "No controllable units selected",
  "villager-required": "Select a villager for that order",
  "combat-unit-required": "Select a military unit for that order",
  "invalid-resource": "That resource is unavailable",
  "invalid-building": "That building is unavailable",
  "invalid-target": "Invalid target",
  "invalid-placement": "Can't build there",
  unreachable: "No reachable path",
  "insufficient-resources": "Not enough resources",
  "building-incomplete": "Building is not complete",
  "wrong-building": "Wrong building for that command",
  "building-busy": "Building is busy",
  "queue-full": "Training queue is full",
  "population-cap": "Population cap reached",
  "already-researched": "Already researched",
  "invalid-technology": "Technology is unavailable"
};

export function commandRejectionMessage(
  reason: CommandRejectionReason
): string {
  return MESSAGES[reason];
}
