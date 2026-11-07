# Official FAQ — Engine Verification Checklist (M5-T05)

**Source of truth:** `docs/rules/RE1_Rulebook.pdf`, Chapter VIII (FAQ), extracted with
`pdftotext -layout` (the OCR'd `re1_rulebook.txt` is column-mangled and unreliable for
scenario/pile lists; the FAQ text itself is clean in the PDF).
**Engine under test:** `game-core` (Premier / Story Mode) at commit `1374c2a`.
**Method:** a scratch probe drove the real explore path with the real Premier card data
(`setup` + `applyAction`, PREMIER_CARDS / FIRST_TIMER_PILES) and printed the resulting
zones/HP; the probe was deleted after the run. The pure helpers are additionally covered
by `game-core/src/engine/rules-faq.test.ts`.

The official FAQ has three rulings. A fourth rule that the M1-T16 spec folded into the
same module — "do as much as you can" — is included for completeness.

---

## FAQ-1 — Jill Valentine L1 adds Damage to the Grenade's effect

> Q: Does Jill Valentine's Level 1 ability add Damage to the Grenade's effect?
> A: Yes it does.

**Engine:** `passiveDamageBonus` (`game-core/src/engine/abilities.ts`) applies
`explosivesPlusDamage` (+5) once per Explosive-tagged weapon in the explore's weapon set;
`actions.ts` passes the exploring seat's level-gated abilities and the weapon defs.

**Probe:** Jill (ch-009, L1) + Grenade (WE-001, 15) vs Zombie (Male) (MA-002, 20 HP) →
defeated (15 + 5 = 20 damage). Control: the same Grenade under a non-Jill character →
15 damage, Zombie not defeated.

**Status:** PASS

---

## FAQ-2 — Jill Valentine L2: the Rocket Launcher is never Trashed

> Q: ... since the Rocket Launcher is considered to be an "Explosive", does Jill Valentine
> never Trash the Rocket Launcher as long as she has her Level 2 ability?
> A: That is correct, since the Rocket Launcher will always go to her Discard Pile instead.

**Engine:** `explosivesGoToDiscard` (`abilities.ts`) → the explore path in `actions.ts`
routes every Explosive used in the explore to the seat's discard pile instead of `removed`.
(The Rocket Launcher carries no `trashAfterUse` effect; it is trashed by the
all-explosives rule, which Jill L2 overrides.)

**Probe:** Jill (L2) + Rocket Launcher (WE-008) → `discard: [we-008#1]`, `removed: []`.
Control: a non-Jill character + Rocket Launcher → `removed: [we-008#1]`.

**Status:** PASS

---

## FAQ-3 — Gatling Gun Majini: +5 Damage per full 10 total Ammo

> Q: The Gatling Gun Majini says for every 10 Ammo I have he deals +5 Damage. Does this
> mean for every 10 Ammo card?
> A: No, the effect is referring to every increment of 10 Ammo you have in your total. For
> example, if you played two "Ammo X 30" cards, you have a total of 60 Ammo for the turn,
> meaning the Gatling Gun Majini would get +30 Damage.

**Engine (fixed):** `resolveExplore` / `resolveMultiExplore` (`game-core/src/engine/explore.ts`)
add `amount * floor(ammo / 10)` to the **Infected's** attack (`boostedAttack` / `atk`). The
engine previously added it to the exploring player's damage — the wrong side.

**Probe (single-explore):** 60 Ammo + Handgun (WE-009, 10) vs Gatling Gun Majini
(MA-014, 40 HP / 30 atk). Before the fix → player damage 40, Majini **defeated**, 0 taken.
After the fix → not defeated, **60 taken** (HP 40). Matches the FAQ.

**Probe (multi-explore):** 60 Ammo + Handgun (10), 2 Explores, Mansion top
[MA-014 (40/30), MA-001 (15/10)]. Before the fix → player damage 40 vs combined HP 55 →
not defeated, combined attack 40 → 40 taken (HP 60). After the fix → combined attack
(30 + 30) + 10 = 70 → **70 taken** (HP 30). Matches the FAQ.

**Status:** PASS — fixed per Manny's ruling (2026-11-07: the Infected's attack is boosted,
per the FAQ / Master Card List). Regression tests in `game-core/src/engine/explore.test.ts`.

---

## Related rule — "do as much as you can" (partial effects)

> "If a Player cannot perform all of the listed effects, then the Player does as much as he
> can." (rulebook ch. V, Playing Action(s) / Playing Item(s))

**Engine:** `drawWithReshuffle` (`game-core/src/engine/deck.ts`) draws
`min(requested, inventory + discard)`, reshuffling the discard when the inventory runs
short.

**Probe:** draw 5 from 2+0 → 2 cards; draw 5 from 1+2 → 3 cards; AC-007 Umbrella
Corporation (+2 Cards) with only 2 drawable → the hand gains exactly 2, then the card's own
`moveHandCardToTopOfInventory` prompt appears.

**Status:** PASS

---

## Summary

| # | Rule | Status |
|---|------|--------|
| FAQ-1 | Jill L1 adds Damage to the Grenade | PASS |
| FAQ-2 | Jill L2: Rocket Launcher → Discard, never Trashed | PASS |
| FAQ-3 | Gatling Gun Majini: +5 per full 10 total Ammo | PASS (fixed per ruling) |
| — | "do as much as you can" (partial draws) | PASS |

**Ruling (Manny, 2026-11-07):** FAQ-3 boosts the Infected's own attack, per the official FAQ
and the Master Card List. Fixed in `resolveExplore` / `resolveMultiExplore`; regression
tests added to `game-core/src/engine/explore.test.ts`.

## Out-of-FAQ-scope observation (not a FAQ gap)

The Outbreak `attack` action (`actions.ts`) does not consult `passiveDamageBonus` or
`explosivesGoToDiscard`, so Jill L1's +5 and Jill L2's discard redirect do not apply when
an Explosive is used to Attack. The FAQ rulings are written about Explores (Story Mode has
no attack action), so this is recorded as an observation, not a FAQ failure.
