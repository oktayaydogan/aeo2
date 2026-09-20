import { describe, expect, it } from "vitest";
import { createSkirmishSetup } from "./skirmishMap";

describe("createSkirmishSetup", () => {
  it("returns identical layouts for the same seed", () => {
    expect(createSkirmishSetup(1337)).toEqual(
      createSkirmishSetup(1337)
    );
  });

  it("varies obstacle layouts for different seeds", () => {
    expect(createSkirmishSetup(1337).map.blocked).not.toEqual(
      createSkirmishSetup(7331).map.blocked
    );
  });

  it("keeps mirrored starting resources equally distant from both Town Centers", () => {
    const setup = createSkirmishSetup(20260920);

    for (const kind of ["wood", "food", "gold"] as const) {
      const playerResource = setup.resources.find(
        (resource) =>
          resource.id === `player-${kind}`
      );
      const enemyResource = setup.resources.find(
        (resource) =>
          resource.id === `enemy-${kind}`
      );

      expect(playerResource).toBeDefined();
      expect(enemyResource).toBeDefined();

      const playerCenter = {
        x: setup.player.townCenter.x + 2,
        y: setup.player.townCenter.y + 2
      };
      const enemyCenter = {
        x: setup.enemy.townCenter.x + 2,
        y: setup.enemy.townCenter.y + 2
      };

      const playerDistance = Math.hypot(
        (playerResource?.position.x ?? 0) - playerCenter.x,
        (playerResource?.position.y ?? 0) - playerCenter.y
      );
      const enemyDistance = Math.hypot(
        (enemyResource?.position.x ?? 0) - enemyCenter.x,
        (enemyResource?.position.y ?? 0) - enemyCenter.y
      );

      expect(enemyDistance).toBeCloseTo(playerDistance, 8);
      expect(enemyResource?.amount).toBe(playerResource?.amount);
    }
  });

  it("never blocks the guaranteed center corridor", () => {
    for (const seed of [1, 2, 3, 10, 42, 1337, 20260920]) {
      const setup = createSkirmishSetup(seed);

      expect(
        setup.map.blocked?.some(
          (cell) => cell.y === 9 || cell.y === 10
        )
      ).toBe(false);
    }
  });

  it("keeps resource cells free from generated obstacles", () => {
    for (const seed of [1, 42, 1337, 9001]) {
      const setup = createSkirmishSetup(seed);
      const blocked = new Set(
        (setup.map.blocked ?? []).map(
          (cell) => `${cell.x},${cell.y}`
        )
      );

      for (const resource of setup.resources) {
        expect(
          blocked.has(
            `${Math.floor(resource.position.x)},${Math.floor(
              resource.position.y
            )}`
          )
        ).toBe(false);
      }
    }
  });
});
