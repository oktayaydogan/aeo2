# Combat model

AEO2 resolves combat in `packages/simulation`. Content supplies statistics and classifications; renderers do not own damage, targeting, armor, or chase outcomes.

## Canonical damage order

For every resolved hit:

1. Start with the attacker's base `attackDamage`.
2. Add permanent simulation-owned attack upgrade bonuses.
3. Add every matching data-driven counter bonus. A bonus may match an exact `targetKind`, a `targetTag`, or both.
4. Subtract the target definition's non-negative `armor`.
5. If pre-armor damage was positive, clamp final damage to at least 1. A zero-damage attacker never gains chip damage from the minimum rule.

In formula form:

`damage = base + attackUpgrade + matchingCounterBonuses`

If `damage > 0`:

`resolvedDamage = max(1, damage - armor)`

Otherwise resolved damage is 0.

The pure `resolveCombatDamage` function is the canonical implementation and returns a breakdown for deterministic tests and future diagnostics.

## Combat classification

`combatTags` are content-defined strings. They describe roles/classes without unit-specific simulation branches. Examples that current/future content may use include `infantry`, `ranged`, `mobile`, `worker`, and `structure`.

Counter metadata lives on the attacker definition:

- `targetKind`: exact content-kind counter when a mechanic is intentionally specific.
- `targetTag`: class/role counter used for broader relationships.

Simulation validation rejects negative armor/bonus values, empty tags, and bonuses with no target selector.

## Acquisition

Autonomous acquisition is opt-in through `acquisitionRange`.

- Units without `acquisitionRange` retain the previous explicit-command-only behavior.
- Units with a positive range acquire the nearest living enemy unit within that radius.
- Equal-distance candidates are resolved by stable entity id ordering.
- Acquisition creates the same internal attack task used by normal attack commands; it does not bypass combat resolution.

## Chase limits

`maxChaseDistance` is optional and measured from the attack task's deterministic origin.

- Explicit attack commands capture the attacker's position when the order starts.
- Autonomous acquisition captures the same origin.
- If the live target moves farther than `maxChaseDistance` from that origin, the attack task is abandoned and the unit returns to idle.
- Definitions without a chase limit preserve the existing unlimited explicit chase behavior.

These rules are simulation-tick based and contain no wall-clock or render-frame dependency.

## Buildings and future defensive fire

Building definitions use the same `armor` and `combatTags` target profile as units. Unit attacks against buildings therefore use the same damage resolver. A future tower/defensive-fire attacker should call the same resolver rather than introduce a second damage formula.

## Balance policy

This document defines mechanics, not final balance values. Concrete roster tags, armor values, acquisition ranges, chase limits, and counter numbers belong in content definitions and the balance matrix. They must remain original AEO2 data rather than copied proprietary balance tables.
