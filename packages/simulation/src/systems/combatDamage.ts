import type {
  CombatTag,
  UnitAttackBonus,
  UnitKind
} from "../types";

export interface CombatTargetProfile {
  kind?: UnitKind;
  tags?: readonly CombatTag[];
  armor?: number;
}

export interface CombatDamageInput {
  baseDamage: number;
  attackUpgradeBonus?: number;
  bonuses?: readonly UnitAttackBonus[];
  target: CombatTargetProfile;
  minimumDamage?: number;
}

export interface CombatDamageBreakdown {
  baseDamage: number;
  attackUpgradeBonus: number;
  counterBonus: number;
  armor: number;
  preArmorDamage: number;
  damage: number;
}

export function resolveCombatDamage(
  input: CombatDamageInput
): CombatDamageBreakdown {
  const attackUpgradeBonus = input.attackUpgradeBonus ?? 0;
  const targetTags = new Set(input.target.tags ?? []);
  const counterBonus = (input.bonuses ?? [])
    .filter(
      (bonus) =>
        (bonus.targetKind !== undefined &&
          bonus.targetKind === input.target.kind) ||
        (bonus.targetTag !== undefined &&
          targetTags.has(bonus.targetTag))
    )
    .reduce((sum, bonus) => sum + bonus.damage, 0);
  const armor = Math.max(input.target.armor ?? 0, 0);
  const preArmorDamage =
    input.baseDamage + attackUpgradeBonus + counterBonus;
  const minimumDamage = Math.max(input.minimumDamage ?? 1, 0);
  const damage =
    preArmorDamage <= 0
      ? 0
      : Math.max(preArmorDamage - armor, minimumDamage);

  return {
    baseDamage: input.baseDamage,
    attackUpgradeBonus,
    counterBonus,
    armor,
    preArmorDamage,
    damage
  };
}
