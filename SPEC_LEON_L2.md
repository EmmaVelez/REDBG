# SPEC — CH-002 Leon S. Kennedy L2 (`pistolsTwicePerTurn`)

Card text (verified, fandom CH-002): "Level 2 (6): All your 'Pistol' Weapons can be used twice per turn."

Official Master FAQ ruling (CH-002 entry, verbatim):

> **Q: How does this character's level 2 effect work?**
> **A: When he uses a pistol weapon, you can pay its ammo requirement twice for that weapon to apply its effect and damage twice.**

## Semantics

1. **Cap.** A Pistol weapon the seat controls may be used at most **twice per turn** while
   `pistolsTwicePerTurn` is unlocked (Leon L2; L1 keeps its own `-10 Ammo Requirement`).
   The cap is per TURN, not per explore, and resets at the seat's `endTurn`.
2. **Double use in one explore.** In a single explore the player may declare the same Pistol
   instance twice. That is one action with two uses:
   - the Ammo Requirement is paid **twice** (once per use, after `ammoReqReduction`);
   - the weapon's **damage is dealt twice**;
   - the weapon's **effect applies twice** (every `weaponEffects` entry runs per use, so
     `grantExplores`, `gainCardsAndActions`, `plusDamagePerExtraWeapon`, … all fire twice).
   This spends **both** uses.
3. **Split across explores.** The two uses may instead be split: use the Pistol once in one
   explore (it moves to the play area) and once more in a LATER explore the same turn —
   the rule that already exists (`canReuseWeapon`). A player who elected NOT to pay twice
   in the first explore keeps the second use for a second explore.
4. **Representation.** A use is one entry in `action.weapons`. The same instance id may
   appear twice; each occurrence is one use. No new action field, no new prompt kind.
5. **Not reusable:** a non-Pistol weapon, a Pistol without the ability (Leon L1 / another
   character), or a weapon already at its cap. Duplicates beyond the cap are rejected.

## Why the old behaviour was wrong

The engine implemented L2 as "the Pistol may be reused in a second explore" only. That is
rule 3, but it is not the FAQ's rule 2: the FAQ's primary play is paying the ammo twice in
ONE explore so the effect and damage apply twice. The old code had no way to express a
double use in a single explore, so the FAQ ruling was unreachable.

## Wiring (all four layers must agree)

- `engine/weaponReuse.ts` — `weaponUsesThisTurn` counts **occurrences** in the log, not log
  entries; `maxWeaponUses` stays 2 for pistols under the ability; new `canUseWeaponTimes`.
- `engine/validate.ts` — the "duplicate weapon" rejection becomes a per-weapon cap check:
  `occurrences(action.weapons, id) + weaponUsesThisTurn(state, seat, id) <= maxWeaponUses(...)`.
  Ammo is already summed per occurrence, so the double cost is automatic.
- `engine/actions.ts` — the play-area move / trash / explosive lists must be de-duplicated
  (a weapon used twice is still ONE card in the play area); damage, effects, grants, ammo
  and the log already iterate per occurrence and need no change.
- `ai/enumerate.ts` — offer the double-use combo so the bot and the client's legality check
  can reach it.
- `client/src/ui/explorePicker.ts` — pure `toggleWeaponDouble` helper; `remainingUses`
  already exposes the cap to the UI.
- `client/src/ui/ActionBar.tsx` — a "×2" button on each weapon option with
  `remainingUses >= 2`; the checkbox still toggles one use.

## Test contract

- `game-core/src/engine/leonL2.test.ts` — double use costs double ammo, deals double damage,
  applies the effect twice, lands in the play area once, spends both uses; split uses across
  two explores; third use rejected; non-pistol / L1 rejected; enumerate offers the double.
- `client/src/ui/ui.test.tsx` — `evaluateExploreCombo([p, p])` is legal with double
  damage/ammo; `toggleWeaponDouble` round-trips.
