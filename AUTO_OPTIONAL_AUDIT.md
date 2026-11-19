# Auto-Resolved "you can / you may" Audit (2026-11-19)

Scope: every card in `game-core/src/data/*.ts` whose printed `text` offers the
player a choice (`can` / `may` / `if you do` / `instead`) — **120 cards**, every
effect/ability kind traced through `game-core/src/engine` (non-test files).
Verdicts: `prompted` (a real player-facing prompt), `manual-button` (the player
triggers it themselves), `automatic` (the engine decides, no prompt, no button),
`not-implemented`, `passive-not-optional` (wording is not really a choice).

Method note: `custom.ts` stores its cards as MULTI-LINE objects, so a line-based
scan silently misses all 45 fan cards. Any future audit must parse whole objects.

> **UPDATE 2026-11-19 — the four priority conversions are DONE.**
> `cw-025` → end-of-turn prompt `cw025Choose`; `cac-004` → `cac004Choose`;
> `loc-014` → `loc014Choose`; `ah-001` → `ah001Choose`. See section D.
>
> Two corrections to the original audit:
> - **AH-001 had never worked at all.** Its arming spread sat in the `playItem`
>   case, where an item's `actionEffects` is always undefined, so
>   `storyModeBossShuffleActive` was never set and the explore-side branch was
>   dead code. Fixed and moved to `playActionCard`.
> - **cw-025's auto-recall has been REMOVED** from `applyEndOfTurn`; the Weapon
>   now takes the normal play-area discard unless the player accepts the prompt.

---

## A. Printed "you can / you may" but the engine decides — no prompt, no button

These are the ones to convert to prompts.

### A1. Damage reduction / negation (auto-applied at the damage site)

| Card | Printed wording | Engine | Evidence |
|---|---|---|---|
| ch-045 HUNK (Mercenaries) | "you can lower that Damage by 20. In that case, Gain 1 'Ammo x10'" | always lowers and always grants the Ammo | `actions.ts:1077`, `actions.ts:3145`, `4304`, `2795`, `2809`, `3547`, `3561` |
| ch-049 Albert Wesker (Mercenaries) | "you may lower that damage by 10 for every card in your hand" | always reduces | `actions.ts:3146`, `4305` |
| b4mc-ch-007 Chris L1 | "you can lower that Damage's number by 10. In that case, Gain 1 'Ammo x10'" | always; auto-take is documented | `abilities.ts:1195`, `actions.ts:3149`, `4975` |
| b4mc-ch-008 Chris L2 | "you can put it on top of the Mansion (even if it's the BOSS)" | always | `abilities.ts:1262`, `actions.ts:4997`, `3270` |
| ma-054o Kevlar Jacket | "you may move this card to the bottom of the mansion. If you do, that character receives no damage during this turn" | always | `outbreak.ts:169` (comment documents the auto-take) |
| in-004 Slough Armor | "you may discard this card from your hand. If you do, reduce the damage of one weapon being used by 20" | always | `actions.ts:5994` (comment: reducer is atomic) |

Hard to prompt: the damage reducer is atomic, so the damage cannot be held
across a prompt. ma-054o and in-004 both carry a comment saying exactly that.

### A2. Free keeping / moving of cards

| Card | Printed wording | Engine | Evidence |
|---|---|---|---|
| cw-025 Elephant Killer | "you can move this Weapon to the top of your Inventory" | always, at end of turn | `actions.ts:458` (comment: "resolved automatically") |
| ch-023 David King L2 | "they can take one [Knife] from their discard pile and let David use it as well" | first discard knife auto-added to the explore | `actions.ts:2488`, `explore.ts:224` |
| ma-070 Treasure Map | "you may attach this card to your character" | auto-attached on take. (The "you may remove" half IS a real manual button.) | `actions.ts:9413` |
| cac-004 Resupply | "you can put it into your Hand instead of your Discard Pile" | auto-routed on the next Item gain | `gainCard.ts:152` |
| loc-014 Terrace | "The first time you gain an action card in each of your turns, you may play it" | auto free play | `actions.ts:5188`, `actions.ts:711` |
| ah-001 Abandon All Hope | "you can shuffle it into the top 10 cards of the Mansion instead" | always, on a not-defeated Boss reveal | `actions.ts:2098`, `actions.ts:4994` |

### A3. Grants worded as permission (prompting these is arguably pointless)

| Card | Printed wording | Engine | Evidence |
|---|---|---|---|
| ac-040 Vengeful Intention | "You may play as many actions as you like this turn" | `actionsLeft = 999` | `actions.ts:1634` |
| sk-004 Medic LV.1 | "you can Heal that amount, plus 10 instead" | always-on +10 heal | `skill.ts:374` |
| ce-008 Low on Ammo | "Players may use 'Pistol' Weapons without paying their ammo cost if they do Trash them at the end of the turn" | end-of-turn trash is automatic | `actions.ts:2473`, `3466`, `481` |

---

## B. Printed "you can / you may" that nothing implements

Not auto-resolved — simply absent. Each needs a full implementation, not just a
prompt.

| Card | Printed wording | State | Evidence |
|---|---|---|---|
| ch-015 Hunk L1 | "you may redirect it to his partner instead" | the redirect is NEVER applied; the ability is only read to gate Ada's lethal-damage override | `actions.ts:4746`, `4751` |
| ac-012 Struggle for Survival | "May discard from hand to set the damage of 1 Weapon (cost 40 or less) being used to 0" | explicit v1 reactive no-op | `actions.ts:1408` |
| cw-013 Pump-Action Shotgun | "you can take 20 Damage if you do this Weapon gains the type 'Melee' and +10 Damage" | kind only in `types.ts` + data; only the +1 Explore works | `custom.ts:937`, `types.ts:241` |
| ac-040 Vengeful Intention | "Each time you play another action this turn, your character takes 10 damage" | `damagePerAdditionalActionThisTurn` is written, never read | `actions.ts:1639` |
| ac-018 Uroboros Injection | "you may trash this card to give +20 health to a revealed infected of your choice" | the trash prompt works; the +20 Health is never applied | `actions.ts:4119`, `7042` |

---

## C. Everything else with can/may wording

Genuine prompts (a `chooseOption` payload the player answers) or manual buttons
(a `useCharacterAbility` / `useSkill` / `useWeaponAbility` / `useActionAbility`
activation). No action needed.

---

## D. The 3 easiest to convert to prompts

Ranked by "reuses an existing prompt choke point, and the card is already in a
zone when the choice is offered".

### 1. cw-025 Elephant Killer — end-of-turn weapon recall

- Trigger: the `endTurn` case, which already holds the turn for AM-007.
- `endTurnOrAmmoChoice()` (`actions.ts:687`) is the ready-made template; it just
  needs a weapon sibling of `recycleAmmoPrompt()` (`mercenaries.ts:724`).
- The card is sitting in the Play Area, so no state has to be held.
- Pattern is proven one card earlier in the same file (AM-007).

### 2. cac-004 Resupply — route the next Item gain to Hand

- Trigger: `gainCard()` (`gainCard.ts:152`), which already raises prompts for
  CAC-005 and the fan locations (`locTrashSecondGain`, `gainCard.ts:104`).
- The Item is already gained (in hand or discard), so the prompt only has to
  move an instance that exists — no held state.
- One prompt kind + one resolver branch.

### 3. loc-014 Terrace — play the first action card gained

- Trigger: the gain site that already arms `pendingFreeActionInstanceId`
  (`actions.ts:5188`); the free-play machinery (`actions.ts:711`) stays exactly
  as it is and is simply gated on the prompt's answer.
- Same choke point family as #2.
- Runner-up: **ah-001** (Boss reveal → "shuffle to top 10 instead?"), which is
  also a single reveal site but needs the reveal flow to hold a not-yet-resolved
  outcome.

**All four are now implemented (2026-11-19).** `cw025Choose` / `cac004Choose` /
`loc014Choose` / `ah001Choose`. Two notes from the implementation:
- `ah001Choose` is raised AFTER the Boss takes its normal not-defeated
  disposition and the handler moves it to index 9 — no need to hold an
  unresolved explore. `insertAt` SPLICES IN A COPY, so the handler drops the
  existing occurrence first or the soak's duplicate-placement assertion fires.
- `cac004Choose` consumes `nextItemToHand` when the offer is MADE, not when it is
  answered, so two Items gained in one action cannot raise colliding prompts.

---

## D2. The NEXT 3 easiest (after the four above)

> **UPDATE 2026-11-19 — all three are DONE.**
> `b4mc-ch-008` L2 → `chrisL2TopChoose`; `ma-070` → `ma070Choose`; `sk-004` →
> `medicHealBonusChoose`. Details in the implementation notes at the bottom.
>
> **ac-018 is DONE too** — it was NOT a 5-line fix, exactly as suspected: the
> "+20 health to a revealed infected" has to change the combat OUTCOME, so the
> explore is now DEFERRED for it (the AC-042 / Flash-Grenade mechanism).
> `shouldDefer` includes `ac018Eligible`, `pendingExplore` carries the
> `resolveExplore` params (`ExploreParams`, now an exported type) plus
> `autoDefeat`, and the handler re-resolves with `hp + 20` and recomputes the
> flipped outcome's Damage/Decoration delta. The shared outcome application was
> extracted to `applyPendingExploreOutcome` so AC-042 and AC-018 stop duplicating
> it. It also gained the missing `Decline` option (the card says "you may"), and
> AC-042's handler no longer trash-labels `Decline` into `removed`.

1. **b4mc-ch-008 Chris L2** — "you can put it on top of the Mansion (even if it's
   the BOSS)". The exact analog of ah-001. `chrisL2Top` is already computed at
   both explore sites (`actions.ts:5056` single, `actions.ts:3328` multi, inside
   the `undefeatedEntries` disposition loop). Raise `chrisL2TopChoose` instead of
   inserting; the handler inserts at index 0 (drop the existing occurrence first).
2. **ma-070 Treasure Map** — "you may attach this card to your character". The
   auto-attach is one branch inside the `takeOrBottom` handler
   (`actions.ts:9499`), which already chains follow-up prompts (Weapon Case at
   `actions.ts:9457`). Delete the branch so the take lands in the discard
   (`actions.ts:9540`) and raise `ma070Choose` from that normal-take return.
3. **sk-004 Medic LV.1** — "you can Heal that amount, plus 10 instead".
   `skillHealAmountBonus` has exactly ONE reader (`actions.ts:9271`, applied at
   `9306`/`9311`) inside the `healGreenHerb` resolution. Cheapest route is a
   follow-up prompt ("heal 10 more?") rather than re-encoding the heal prompt's
   (target, amount) option list.

After those, the rest is genuinely hard: the damage-reduction family
(ch-045, ch-049, b4mc-ch-007 L1, ma-054o, in-004) needs the damage HELD across a
prompt at an atomic reducer; ch-023 decides while the explore's weapon list is
being built; ce-008 decides at weapon-use time inside `exploreWeapons`.
`ac-040`'s unlimited actions is a grant, not a real either/or.

---

### Implementation notes (2026-11-19)

- **`chrisL2TopChoose`** — the auto-insert was removed from BOTH explore paths
  (single and the multi `undefeatedEntries` loop); the survivor takes the normal
  not-defeated disposition and the handler moves it to index 0. The once-per-round
  mark is consumed when the offer is MADE. The offer is skipped if the survivor
  never reached the Mansion deck.
- **`ma070Choose`** — the auto-attach branch was deleted from `takeOrBottom`; the
  normal-take return now raises the offer when the taken item carries
  `attachThenRemoveForCardsAndGold`. Declining leaves it in the discard. The
  "you may remove" half was already a real button (`removeAttachedItem`).
- **`medicHealBonusChoose`** — the base heal lands WITHOUT the bonus and the offer
  is chained after it (and after SK-005's trash offer). Only offered when the
  +N would actually change a Health total. The handler only moves Health, so the
  heal's own side effects do not double-fire.
- **`uroborosInjection` (AC-018)** — the explore is deferred while the reactive
  window is open; trashing re-resolves with `revealed.hp + 20` and applies the
  new outcome. Declining resolves with the base outcome. An unconditional
  auto-defeat (Rocket Launcher / Crossbow) always wins. The resumption shared with
  AC-042 now lives in `applyPendingExploreOutcome`.
- **Explore entry guard** — a deferred explore whose reactive prompts were never
  answered used to be silently overwritten by the next explore, orphaning the
  revealed Infected (the soak's conservation check caught it). The `explore` case
  now resolves any outstanding `pendingExplore` with its base outcome before
  revealing again. This is a pre-existing defect in the shared AC-042 / Las Plagas
  mechanism that AC-018 simply made easy to hit.

---

## E. Deliberately auto, with a documented reason — do NOT "fix" blind

- **ma-054o / in-004**: the damage reducer is atomic; a prompt would need the
  damage held, which the reducer does not support (`outbreak.ts:159`,
  `actions.ts:5996`).
- **cw-025**: comment says keeping the Weapon is never worse than discarding it
  (`actions.ts:460`) — the same ruling AM-007 originally used before it became
  a choice.
- **ac-040 / sk-004 / ce-008**: grants/permissions whose "may" is not a real
  either/or.

---

## F. Remaining backlog (re-verified 2026-11-19)

Everything from A/B still outstanding after the D / D2 work, re-checked against
the current tree (line numbers differ from the tables above).

### F1. Still auto-resolved — these need a prompt

| Card | Printed wording | Where the engine decides for you |
|---|---|---|
| ch-045 HUNK (Merc.) | "you can lower that Damage by 20. In that case, Gain 1 'Ammo x10'" | reduction summed at 7 damage sites (`actions.ts:2997, 3011, 3340, 3753, 3767, 4510`, `mercenaries.ts:119`); the Ammo comes from a post-action hook (`actions.ts:1219`) |
| ch-049 Albert Wesker (Merc.) | "you may lower that damage by 10 for every card in your hand" | explore only: `amount * handAfter.length` (`actions.ts:3341`, `4511`) |
| b4mc-ch-007 Chris L1 | "you can lower that Damage's number by 10. In that case, Gain 1 'Ammo x10'" | `chrisL1DamageReduction` (`abilities.ts:1195`) folded into the damage total (`actions.ts:3344`, `4535`); Ammo + once-per-round latch (`3716`, `5203`) |
| ma-054o Kevlar Jacket | "you may move this card to the bottom of the mansion. If you do, that character receives no damage during this turn" | `applyDamageWithKevlar` (`outbreak.ts`) always fires |
| in-004 Slough Armor | "you may discard this card from your hand. If you do, reduce the damage of one weapon being used by 20" | `actions.ts:6270-6292` auto-discards it from the hand |
| ch-023 David King L2 | "they can take one [Knife] from their discard pile and let David use it as well" | the FIRST knife in the discard is silently added to the explore weapon list (`explore.ts:224`, `actions.ts:2656`) |

Why these are hard: five of the six are decided inside an ATOMIC damage
reducer, so the damage has to be HELD across a prompt (the AC-018 `pendingExplore`
deferral pattern) and the reducer re-run. ch-023 is decided while the explore's
weapon list is still being built.

### F2. Still not implemented at all

| Card | Printed wording | State |
|---|---|---|
| ch-015 Hunk L1 (Alliance) | "Whenever Hunk would take damage, you may redirect it to his partner instead" | the redirect is NEVER applied. `damageRedirectToPartner` has exactly one reader (`actions.ts:4972`) and it only gates Ada's lethal-damage override (`4977`). The comment at `actions.ts:4969` says "Automatic redirect when a partner is present" — aspirational, no code does it. |
| ac-012 Struggle for Survival | "May discard from hand to set the damage of 1 Weapon (cost 40 or less) being used to 0" | explicit v1 reactive no-op (`actions.ts:1549`, `cards.ts:94`) |
| cw-013 Pump-Action Shotgun | "you can take 20 Damage if you do this Weapon gains the type 'Melee' and +10 Damage" | only `grantExplores` is read; `optionalSelfDamageForDamageAndType` (`custom.ts:939`) is never referenced by the engine |

### F3. Half-implemented

| Card | Printed wording | State |
|---|---|---|
| ac-040 Vengeful Intention | "Each time you play another action this turn, your character takes 10 damage" | `damagePerAdditionalActionThisTurn` is WRITTEN (`actions.ts:1780`) and initialised (`game.ts:689/1221/1446`) but has no reader. The other half ("you may play as many actions as you like") works. |

### F4. Deliberately automatic — leave alone

- **ce-008 Low on Ammo** — implemented: pistols cost 0 ammo (`actions.ts:2641`)
  and are trashed at end of turn (`actions.ts:3672`). "if they do Trash them"
  is the cost of the free use, not a choice.
- **ac-040's unlimited actions / sk-004's +10 heal** — "may" as a grant. (sk-004's
  heal is now a real prompt anyway; see D2.)
