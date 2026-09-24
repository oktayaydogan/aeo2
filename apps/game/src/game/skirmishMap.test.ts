import { GridNavigation } from "@aeo2/simulation";
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

    for (const kind of ["food", "gold"] as const) {
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

  it("supports deterministic small, standard, and large map sizes", () => {
    for (const size of [32, 48, 64]) {
      const first = createSkirmishSetup(1337, size);
      const second = createSkirmishSetup(1337, size);

      expect(first).toEqual(second);
      expect(first.map.width).toBe(size);
      expect(first.map.height).toBe(size);
      expect(first.player.townCenter.x).toBeGreaterThanOrEqual(0);
      expect(first.enemy.townCenter.x).toBeLessThan(size);
      expect(
        first.resources.every(
          (resource) =>
            resource.position.x >= 0 &&
            resource.position.x < size &&
            resource.position.y >= 0 &&
            resource.position.y < size
        )
      ).toBe(true);
    }
  });

  it("never blocks the guaranteed center corridor", () => {
    for (const seed of [1, 2, 3, 10, 42, 1337, 20260920]) {
      const setup = createSkirmishSetup(seed);

      const centerY = Math.floor(setup.map.height / 2);

      expect(
        setup.map.blocked?.some(
          (cell) => cell.y === centerY - 1 || cell.y === centerY
        )
      ).toBe(false);
    }
  });

  it("creates mirrored forest clusters without sealing the center corridor", () => {
    const setup = createSkirmishSetup(20260920, 48);
    const forest = new Set(
      setup.forestCells.map((cell) => `${cell.x},${cell.y}`)
    );
    const centerY = Math.floor(setup.map.height / 2);

    expect(setup.forestCells.length).toBeGreaterThan(20);
    expect(
      setup.forestCells.some(
        (cell) => cell.y === centerY - 1 || cell.y === centerY
      )
    ).toBe(false);

    for (const cell of setup.forestCells) {
      const mirrorKey = `${setup.map.width - 1 - cell.x},${cell.y}`;
      expect(forest.has(mirrorKey)).toBe(true);
    }
  });

  it("represents every forest cell as a harvestable blocking tree", () => {
    const setup = createSkirmishSetup(20260920, 48);
    const trees = setup.resources.filter(
      (resource) => resource.kind === "wood" && resource.blocksMovement
    );
    const blocked = new Set(
      (setup.map.blocked ?? []).map((cell) => `${cell.x},${cell.y}`)
    );

    expect(trees).toHaveLength(setup.forestCells.length);

    for (const tree of trees) {
      expect(tree.amount).toBeGreaterThan(0);
      expect(
        blocked.has(
          `${Math.floor(tree.position.x)},${Math.floor(tree.position.y)}`
        )
      ).toBe(false);
    }
  });

  it("adds safe, secondary, and neutral resource zones", () => {
    const setup = createSkirmishSetup(20260920, 48);
    const ids = new Set(setup.resources.map((resource) => resource.id));

    expect(ids.has("player-gold")).toBe(true);
    expect(ids.has("player-secondary-gold")).toBe(true);
    expect(ids.has("enemy-secondary-gold")).toBe(true);
    expect(ids.has("neutral-gold-north")).toBe(true);
    expect(ids.has("neutral-gold-south")).toBe(true);
    expect(ids.has("neutral-food-center")).toBe(true);
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


  it("keeps a traversable route between both starting bases", () => {
    for (const seed of [1, 2, 42, 1337, 7331, 20260920]) {
      const setup = createSkirmishSetup(seed);
      const navigation = new GridNavigation(setup.map);
      navigation.blockCells(setup.forestCells);

      const path = navigation.findPath(
        {
          x: setup.player.townCenter.x + 4.5,
          y: setup.player.townCenter.y + 2.5
        },
        {
          x: setup.enemy.townCenter.x - 0.5,
          y: setup.enemy.townCenter.y + 2.5
        }
      );

      expect(path.length).toBeGreaterThan(0);
    }
  });
