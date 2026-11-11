# Rachael Foley (CH-000) — Spec

Fan character, printed code **CH-000**, 80 Health, level gates **1** (L1) and **5** (L2).

## Card text (verbatim)

- **Level 1:** "At the beginning of your turn, you can get +1 Explore. If so, Rachael must Explore at least twice this turn."
- **Level 2:** "Whenever Rachael Explores, if she has no Partner and she has 50 or less Health, she gets +20 damage this turn."

## Ability kinds

| Level | Kind | Params | Meaning |
|---|---|---|---|
| 1 | `turnStartPlusExploreRequiresTwoExplores` | — | Turn-start choice: +1 Explore, and the seat then owes 2 Explores this turn |
| 2 | `exploreDamageIfNoPartnerLowHp` | `amount: 20`, `hpThreshold: 50` | On each Explore, +20 damage this turn when the seat has no Partner and Health <= 50 |

## L1 — trigger, condition, prompt

- **Trigger:** at the start of the seat's turn (in `turnStartAbilityPrompts`), when the seat's
  active character (or Partner) has the ability at its current level.
- **Condition:** none — the choice is always offered.
- **Prompt kind:** `turnStartPlusExploreRequiresTwoExplores`
- **Options:** `['Gain +1 Explore', 'Decline']`
- **On 'Gain +1 Explore':** `exploresLeft += 1` and set `exploresRequiredThisTurn = 2`.
- **On 'Decline':** nothing.

## L1 — obligation semantics

New `PlayerState` field `exploresRequiredThisTurn?: number`.

- Set to `2` when the +1 Explore is taken; reset to `undefined` at the start of every turn
  (before the turn-start prompt is raised, so the prompt can set it again).
- Each `explore` action decrements it by 1 (floor 0), applied in `applyOutbreakHooks`
  (the single post-action choke point, so every explore path counts).
- `endTurn` is rejected while `exploresRequiredThisTurn > 0` AND `canExploreLegally` is true
  (same escape hatch as Wesker's `mustExplore`: a seat that cannot explore is not blocked).
- The bot's "never volunteer an unarmed explore" filter treats `exploresRequiredThisTurn > 0`
  exactly like `mustExplore === true` (shared helper `mustExploreNow`).

## L2 — trigger, condition, effect

- **Trigger:** every Explore action by the seat.
- **Condition:** `partnerInstanceId === undefined` AND `hp <= hpThreshold` (50).
  ("no Partner" implies she is the Main character, so `player.hp` is Rachael's Health.)
- **Effect:** `+amount` (20) to `abilityDamage` for that explore — i.e. +20 damage on each
  qualifying explore. Implemented as a helper next to `exploreBonusIfAmmoAbove`, added to the
  shared `abilityDamage` term so single-explore and multi-explore both pick it up.

## Notes / edge cases

- If she takes the +1 Explore and then cannot explore (no ammo / no legal explore),
  `canExploreLegally` is false and `endTurn` is allowed — the obligation never deadlocks.
- Multiple explores each get +20 (the bonus is computed per explore from current state), matching
  the "whenever she Explores" wording and the `exploreBonusIfAmmoAbove` precedent.
