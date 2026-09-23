import { describe, expect, it } from "vitest";
import { resolveCombatDamage } from "./combatDamage";

describe("resolveCombatDamage", () => {
  it("applies base damage and attack upgrades before armor", () => {
    expect(
      resolveCombatDamage({
        baseDamage: 6,
        attackUpgradeBonus: 2,
        target: { armor: 3 }
      })
    ).toMatchObject({
      preArmorDamage: 8,
      armor: 3,
      damage: 5
    });
  });

  it("adds all matching data-driven kind and tag bonuses", () => {
    expect(
      resolveCombatDamage({
        baseDamage: 3,
        bonuses: [
          { targetKind: "archer", damage: 2 },
          { targetTag: "ranged", damage: 4 },
          { targetTag: "structure", damage: 99 }
        ],
        target: {
          kind: "archer",
          tags: ["ranged"],
          armor: 1
        }
      })
    ).toMatchObject({
      counterBonus: 6,
      preArmorDamage: 9,
      damage: 8
    });
  });

  it("enforces minimum positive damage after armor", () => {
    expect(
      resolveCombatDamage({
        baseDamage: 2,
        target: { armor: 20 }
      }).damage
    ).toBe(1);
  });

  it("does not turn zero attack damage into minimum chip damage", () => {
    expect(
      resolveCombatDamage({
        baseDamage: 0,
        target: { armor: 20 }
      }).damage
    ).toBe(0);
  });
});
