# HANDOFF — resume here

**CU-001 Ricardo Irving art re-pulled UNCROPPED (2026-11-10):** Manny sent a single-card image of
Ricardo Irving (569x800 JPG) and said "update the card art for this one, do not crop". The existing
`CARD-ART/CU-001.png` was still the old **320x260 ART WINDOW** (portrait only - no `[CHARACTER]`
banner, no name bar, no ability text), the same crop the CH art used before it went full-card. The new
file is the WHOLE CARD at 320x450, quantized to 256 colours, 97,049 bytes. The source is framed exactly
to the card's edges with no background (verified by reading the image: light-green top border with
`[CHARACTER]` and the 80 Health badge, portrait, tan text box with name + both level lines, and the
copyright + `CU-001` code line at the bottom). One caveat: the decorative gold flourish at the card's
top-left is itself clipped by the LEFT edge of the source image - that is how the scan is, not
something the extraction did. The Health badge measures ~(88.8%, 8.4%) against the standard
`.card-character` geometry of (89.7%, 7.7%), so no badge override was needed; the art's ratio (0.7111)
differs slightly from 320x456 (0.7018), so `object-fit: contain` letterboxes it by ~3px top and bottom.
`cu-001` is a custom character defined in `game-core/src/data/custom.ts`. Verified: vite emits
`CU-001-DW3Utc3I.png` and :1724 serves it (97,049 bytes).

**FCH-008 Sherry Birkin art re-pulled UNCROPPED (2026-11-10):** Manny sent a single-card image of
Sherry Birkin (452x630 JPG) and said "pull this art again, no cropping". The existing
`CARD-ART/FCH-008.png` was still the old **320x260 ART WINDOW** (portrait only - no `[CHARACTER]`
banner, no name bar, no ability text), the same crop the CH art used before it went full-card; every
other character card (CH-*, PR-*) is now the whole 320x456 / 320x448 scan. The new file is the WHOLE
CARD at 320x446 (the source is 452x630, ratio 0.7175, trimmed exactly to the card's own border with no
background - verified by reading the image), quantized to 256 colours, 109,281 bytes. Note the ratio
differs slightly from the character sheet's 320x456 (0.7018); `object-fit: contain` letterboxes it by
~5px top and bottom, and the Health badge still measures (89.6%, 7.1%) against the standard
`.card-character` geometry of (89.7%, 7.7%), so no badge override was needed. FCH-008 is the ONLY
`FCH-*` card with art - the rest of that character set has no sheet. Verified: vite emits
`FCH-008-DHnWXYg8.png` and :1724 serves it (109,281 bytes).
**POISON IS NOW A SINGLE LOBBY CHECK + THE COUNTER SUPPLY IS HIDDEN UNTIL USED (2026-11-10):**
Manny: "Remove ex-006 through ex-009 from the custom card check list, replace it with a
single check called 'poison'; when selected add 2 x ex-006 and 2 x ex-008 to the mansion,
add a stack of 5 blue herbs to the resource pile. The game board shouldn't show poison
counters until they are attached to a character."
1. **One lobby check** (`client/src/ui/Lobby.tsx`): EX-006..EX-009 are filtered out of the
   Custom Cards picker and replaced by a single `POISON` check. Selecting it stores the
   option id `'poison'` in the room's `customCards`.
2. **The bundle** (`game-core/src/data/cards.ts`): new `POISON_OPTION_ID`, `POISON_BUNDLE`
   (ex-006/007/008/009) and `expandCustomCards()`, used by both `cardsForScenario` and
   `pilesForScenario` so the server host and pass-and-play agree. EX-007's `copies` is now
   5, so the bundle's `custom-ex-007` pile is a 5-card stack (was 1). EX-009 is pulled in as
   the shared-supply counter the two Infected attach.
3. **The board** (`client/src/ui/Board.tsx`): the "Counter supply" pile renders only once at
   least one counter is attached to a Character
   (`state.seats.some(s => (s.counters ?? []).length > 0)`), instead of whenever the supply
   is non-empty.
**Browser-verified** (server room, POISON selected): the picker lists EX-001..EX-005 plus
POISON (no EX-006..009); the `custom-ex-007` pile reads "5 left"; the Mansion is 42
(38 + 2x EX-006 + 2x EX-008); the Counter supply pile is absent until a counter attaches.
Tests: `engine/unofficialExpansion.test.ts` +2 (bundle selection, bundle seeding),
`client/src/ui/ui.test.tsx` +2 (Poison check replaces the four cards, supply hidden until
attached). Gates: typecheck clean, game-core 848, client 188, server 104.

**Partner death: stale leader selection blocked every explore (2026-11-10):** Manny reported that
after his Partner died while LEADING an explore (Six Shooter + Knife attached), the following turn he
could not explore at all. Two defects:
1. **Client (the blocker).** `ActionBar`'s `leader` is component state (`useState<'main'|'partner'>`)
   and was never reset when the Partner died. The leader toggle hides itself once
   `partnerInstanceId` is undefined, but the state survived - so every later explore was priced with
   `leaderAbilities(state, seat, 'partner')` (which returns `[]` for a dead Partner) and the action
   was sent as `leader: 'partner'`, which `validate` rejects with `explore: no partner`. The picker
   also evaluated the combo against `(e.leader ?? 'main') === 'partner'`, so `combo.legal` was false
   and the Explore button rendered DISABLED. Fixed by adding the pure helper
   `resolveExploreLeader(state, seat, leader)` in `client/src/ui/explorePicker.ts` (falls back to
   'main' when the seat has no partner) and using it for the options, the preview and the action, plus
   an effect that resets the state. **The engine was never at fault here** - `explore` already falls
   back to the Main when `partnerLeading` is unset, and `enumerate` only offers the Main once the
   Partner is gone.
2. **Engine (spec violation, not the blocker).** `docs/rules/ALLIANCE-ENGINE-SPEC.md` (3) PARTNER
   DEATH: "Partner at ≤0 HP is removed from the game permanently; **trash all cards attached to it**".
   The death branch only cleared `partnerAttached` - the attached cards (the Six Shooter and Knife)
   vanished from the player state while still sitting in `state.cards`. Both death sites
   (`actions.ts` explore path ~line 2014 and the multi-explore path ~line 3088) now append the dead
   Partner's attached cards to `removed` (the codebase's trash destination - MA-036 Reaper does the
   same) and also clear `partnerHp`/`partnerMaxHp`, which were left at 0 as stale state.
   Regression tests: `partnerLevel.test.ts` §7 (death removes the Partner, trashes the attached card,
   leaves the Main at full Health, and the Main can still explore while `leader: 'partner'` is
   refused) and `ui.test.tsx` ("falls back to the Main character once the Partner is gone").
   Gates: game-core 840, client 184, server 102, typecheck clean, vite build OK.

**Unofficial Expansion 1 art re-pulled from Manny's updated sheets (2026-11-10):** Manny sent a
new EX sheet (840x1216 PNG) and asked for EX-001..EX-009 to be pulled from it. It is a 3x3 grid
with the **top-middle slot EMPTY (pure white, RGB 255,255,255, std 0)** — that is EX-002's slot,
so the sheet carries only 8 cards. He then sent the EX-002 Special Rocket Launcher card
separately (1054x1492 PNG, card face only, no background) and said "use this for ex-002".
Mapping: EX-001<-r0c0, EX-003<-r0c2, EX-004<-r1c0, EX-005<-r1c1, EX-006<-r1c2, EX-007<-r2c0,
EX-008<-r2c1, EX-009<-r2c2 (confirmed by reading each bottom-right corner crop individually; a
full-sheet read mislabelled r0c2 as EX-002 - the name "Weapon Case" is EX-003, EX-002 is the
Special Rocket Launcher weapon card). **Grid boundaries were the tricky part:** the strong
dark peaks in the edge-strength profile are the CARDS' OWN frames, not gutters - the real
gutters/margins are only 1-2px. The reliable anchors are the white empty slot (x 283..558) and
the black outer margins (x 0..0, 833..839, y 0..0, 1214..1215). Correct card rectangles:
col1 x 1..282, col2 x 283..558, col3 x 559..832; row1 y 1..404, row2 y 414..810, row3 y 813..1215.
The first attempt used the dark peaks as gutters and cut 4-5px into every card. All nine are now
quantized to 256 colours at ~274-282 px wide (EX-002 downscaled from 1054 to 282 to match), and
every crop is tight to the card's decorative frame with **no white border** - which matches the
rest of the CARD-ART set (MA-001/WE-001/AC-001/IT-002 all measure 0% white border); the OLD EX
art was the anomaly, carrying a few px of blank card base outside the frame. Note the new renders
differ from the old artwork (resize-and-diff scores 64-89 mean abs), so these are genuinely new
images, not the old ones re-cropped.

**SHERRY FORCED EXPLORE: NO-OP + REVEAL OVERLAY FIXED (2026-11-09):** Manny: "When
sherry uses her ability to force another player to explore, nothing happens the reveal
doesn't play". Three coupled causes, all fixed:
1. **Engine no-op** (`engine/allyExplore.ts`): `resolveAllyExplore` returned the state
   UNCHANGED when the combined arsenal was empty (`if (weaponIds.length === 0) return
   state`) and on `insufficientAmmo`. The card says Sherry FORCES the explore, so it
   must happen — unarmed if necessary. Removed the empty-arsenal early return; the
   insufficient case now selects the weapons that fit (cheapest first) through the new
   exported `allyExploreUsedWeaponIds`. An empty arsenal is a valid result.
2. **Client/server disagreement** (`engine/validate.ts`): `forceAllyExploreWithSupport`
   required Sherry to afford the target's arsenal, but the client enumerates from its
   SANITIZED view (other seats' hands are `hidden-*`), so the ability button appeared
   and the server then rejected it ("not enough Ammo to assist"). Removed the
   hand-dependent Ammo precondition — the ability is offered whenever another living
   player exists. Regression test asserts `enumerateLegalActions` agrees between the
   full state and `sanitize(state, 0)`.
3. **Reveal overlay never fired** (`client/src/ui/anims.ts`, `engine/actions.ts`): a
   forced explore resolves through `chooseOption`, and `detectReveal` only accepted a
   literal `explore` action by the viewing seat. The reducer now appends an `explore`
   log entry (new optional `Action.explore.forcedBy`) so the overlay fires and the turn
   history shows the target's explore; `detectReveal` accepts it for the exploring seat
   OR the forcing seat, and `MansionReveal` reads "Damage dealt" for a viewer who is
   not the explorer. **Browser-verified** (server room, Sherry + bot): with 0 Ammo the
   ability opens the prompt, the bot explores with the combined 0-cost knives, and the
   overlay shows the Hunter, "Damage dealt: 20", the four knives and "escaped to the
   bottom of the Mansion"; the history reads "Bot 2: explored the Mansion with Combat
   Knife x4". Also verified with Ammo spent (Licker, "Damage dealt: 15").
   Tests: `engine/fanSherry.test.ts` +3, `client/src/ui/anims.test.ts` +3.

**Promo (PR-*) art re-extracted as WHOLE CARDS (2026-11-09):** Manny supplied the
promo contact sheet (`...\Tabletop Simulator\Mods\Images\httpssteamusercontentaakamaihdnetugc8597016264951356044441A5720A186471CFB7F9630C44D760C710889.png`,
5500x5390, cards filling only the top 1539 px: 10 @ 550x770 in row 1 + the stray
CH-022 Kevin Ryman below) and asked for the promo character cards to be pulled from it,
replacing the images in use. The existing PR-*.png were the 320x292 ART-WINDOW crops
(portrait only — no name banner, no ability text), the last holdout after the regular CH
art went full-card. Now all ten are the WHOLE CARD SCAN: 320x448 (550x770 cell), quantized
to 256 colours (~101-114 KB each, was ~100 KB at the smaller window). Cell→code mapping
was confirmed by PIXEL-MATCHING the old crops against the new cells (mean abs diff 4.4-7.5
for the true match vs 33-74 for the rest) and cross-checked with bottom-right corner OCR —
the OCR misread r0c8 as PR-001 (it is PR-002); trust the pixel match. Mapping:
PR-001←r0c5, PR-002←r0c8, PR-003←r0c7, PR-004←r0c9, PR-005←r0c3, PR-006←r0c0,
PR-007←r0c4, PR-008←r0c6, PR-009←r0c1, PR-010←r0c2. The stray CH-022 was skipped (a
duplicate the character sheet already covers). CSS: `.card-character.card-promo
.card-portrait` (and the art-only variant) moved from `aspect-ratio: 320/292` to
`320/448`, and the promo health-ring badge moved from (89.5%,4.5%) to (89.7%,6.7%) —
measured by comparing the PR-001 badge against the CH-001 badge in the same crop (same x,
~5px higher). **Verified in the browser:** the promo card renders the complete card
(banner, art, name, both abilities) with the ring concentric on the printed badge, and the
img box (54x76.4) sits inside the card (56x79.8) with `object-fit: contain` so nothing is
clipped. Note: PR-003..PR-008 have no engine `CardDef` (promo-only cards) but their art is
kept, as before.

**The Partner is a full second character + bots heal their Partner (2026-11-09):**
Follow-up to the partner-leveling commit. Four pieces:
(1) **`seatAbilities(state, seat)`** (engine/abilities.ts) = the Main's abilities PLUS the
Partner's — the Partner is "another Character under your control" and a seat shares one
hand/discard/inventory, so its abilities are the player's. A `PER_CHARACTER_ONLY` set
(`cannotUseWeapons`, `singleWeaponLimiter`, `weaponCostCap`, `noHealingNoNonInfectedAttach`,
`setHpToOnLethal`, `infectedDamageReduction`, `weaponDamageReduction`,
`damageReductionForAmmo`, `exploreDamageReductionPerHandCard`) keeps one character's personal
limits from leaking onto the other — Krauser as a Partner must not cap the Main at one weapon.
Routed the player-scoped consumers through it: `validate` hasAbilityKind (heal/attach blocks,
weapon reuse), `mercenaries` weaponAmmoReq, and in `actions.ts` trashRedirect,
partnerAttachCap (×2), actionBonus/trashEffectBonus, Claire's herb-trash, ammunitionCardBonus,
buyRedirect, discardAnyForAmmo, gainInfectionForGold, gainSpecificWeaponIntoInventory,
movePlayAreaWeaponToInventoryTop, zombieB/ AoE, goldOnFirstHealThisTurn, Sergei self-damage.
**Bug caught by the test:** the first `seatAbilities` returned the Partner's list unfiltered
when the Main had no abilities — the filter now runs before the early returns.
(2) **Turn start** (`game.ts`): `turnStartAbilityPrompts` and the infection/decrease +
Excella draw now read `seatAbilities`, and each prompt's text is looked up from the character
that actually owns the ability (`abilityText(kind)`). The Partner's `healAtTurnStart` now
restores **partnerHp**, never the Main's (Steve Burnside L1). `turnStartDecreaseInfection`,
`turnStartCardsIfInfectionAtLeast`, goldAtTurnStart, goldOnFirstHealThisTurn,
turnStartActionIfHpAtMost, plusBuyBonus and extraExploreAtTurnStart all use the union.
(3) **Manual abilities**: `useCharacterAbility` gained `character?: 'main' | 'partner'`;
`characterSource(state, seat, character)` resolves the def + level (the Partner's level still
derived from the Main's Decorations). `enumerate` emits both characters' abilities, and the
ActionBar labels the Partner's with a "Partner: " prefix (`data-ability-character`). Steve's L2
`discardCardForHealAndDamage` heals partnerHp when the Partner owns it.
(4) **Healing targets ONE character (Red Herb excepted).** Manny's ruling: "the red
herb healing is the only one that applies to both character and partner at once, all
other healing items need to have a specific character as a target." The old `playItem`
code computed `healPartner` and never used it (dead variable + a comment asking
"Partner HP stored on player?"). Now `playItem` takes `healTarget?: 'main' | 'partner'`:
First Aid Spray (`healToFull`) and Green Herb (`healFixed20OrTrashWithSecondFor60`) heal
exactly the named character; the Red Herb (`healSelfAndPartnerToFull`) still heals BOTH and
ignores the target. When a partner is alive and the action names no target, the engine asks
first (`healTarget` prompt with ['Heal Main','Heal Partner'] for the spray; the Green Herb's
existing `healGreenHerb` prompt grows target-qualified options — `Heal Main 20`,
`Heal Partner 20`, … — decoded back into (target, amount) from the option index; with no
partner the labels stay the plain "Heal 20"/"Heal 60" they have always been). Naming the
target also applies the heal immediately instead of raising a prompt, which is what lets the
BOT aim a heal. `enumerate` emits both targets for the bot when a partner is alive.
`characterCannotBeHealed` now checks the TARGET character, so Chris as the Main can still
heal his Partner (and a partner who is Chris cannot be targeted). The data file's Red Herb
text ("+20 max HP") contradicted its own effect; fixed to "Trash with a Green Herb: heal
yourself and your Partner to full Health."
**Bots:** the First Aid Spray has no prompt, so the 1-ply evaluation sees the restored
Health and the bot plays it at the Partner; `evaluate.ts` already scores `partnerHp`.
**Tests:** game-core **838** (was 837; 17 in `engine/partnerLevel.test.ts` — union,
restriction exclusion, turn-start partner heal, partner manual ability usable + enumerated,
First Aid Spray target selection + prompt, Green Herb target selection, Red Herb heals both,
no-partner unchanged, bot aims a heal at the Partner), client **183**, server **102**.
Gates: typecheck clean, vite build OK.

**Partner leveling + bots leading with the Partner (2026-11-09):** Manny asked two
questions, both answered "no" and both now fixed.
(1) *"Is the partner leveling up as the main character collects enough decorations?"*
It was not. The Alliance rulebook says the Partner's level follows the **Main
character's Decorations**, but `PlayerState` had no partner level at all, nothing
in `engine/` ever resolved the partner's own card def, and `CharacterCards.tsx`
hard-coded `decorations={0}` on the partner card. Now `partnerAbilities(state, seat)`
(`engine/abilities.ts`) derives the partner's level on the fly via
`levelForDecorations(def.level1At, def.level2At, player.decorations)` — no stored
field to go stale, because a Partner never holds Decorations of its own. The
client feeds `player.decorations` to the partner `CardView`, so its level badge and
skill gating advance with the Main's trophies.
(2) *"Do the bots ever have their partners lead explores?"* They did not:
`enumerate.ts` emitted explores with no `leader` and the file said "bots should not
pick manually", so `exploreLeader` always fell back to `'main'`. `enumerate.ts` now
emits BOTH leaders whenever the seat has a partner (`leader: 'partner'` on the
second), and the comment now says bots express the choice on the explore action.
**The leader is the one fighting, so its abilities apply.** `leaderAbilities(state,
seat, leader)` is the new resolver; the explore path (actions.ts `abilities`,
`requiredAmmoForExplore`, `exploreAmmoReq`, `davidAbilities`, `ricardoReduction`,
the Luis/Carlos/Mask/Leon defeat prompts, `damageRedirectToPartner`) and
`validateExplore` (`cannotUseWeapons`, `singleWeaponLimiter`, `weaponCostCap`,
ammo) all resolve the leader. `exploreDamage` / `requiredAmmoForWeapons` /
`requiredAmmoForExplore` / `exploreAmmoReq` gained optional ability/leader params
(defaults keep every pre-partner call site unchanged), and the client's explore
picker (`explorePicker.ts` + `ActionBar.tsx`) passes the selected leader so the
preview prices the leading character and legality is checked per leader.
**Known boundary (not fixed, deliberately):** the Partner's abilities fire when it
LEADS an explore; abilities that act outside the explore (Steve's turn-start heal,
Josh's attach cap, manual abilities) still read the Main's, and `useCharacterAbility`
still indexes the Main's ability list so a Partner's manual ability cannot be
triggered. Say the word if you want the Partner as a full second character.
**Tests:** game-core **828** (was 821; +7 in `engine/partnerLevel.test.ts`), client
**182** (was 181; +1 leader-priced preview), server **102**. Gates: typecheck clean,
vite build OK, soak unchanged at ~235s.

**UNOFFICIAL EXPANSION 1 — EX-001..EX-009 (2026-11-09):** Manny supplied a 3x3
sheet of nine fan cards ("UNOFFICIAL EXPANSION - 1"). Transcribed with the LOCAL
Ollama vision model (`SetneufPT/Gemma4-12B-IT-QAT_Q4_64K_16GB-GPU`, vision-capable)
because `vision_analyze` was 429-rate-limited all session; the printed codes were
read from per-card bottom-right corner crops (EX-004..009 read in one montage,
EX-001..003 from a top-row strip — the full-card reads pattern-completed the
numbers). **Rulings (Manny, 2026-11-09):**
- **[STORAGE] and [BOX] cards are MANSION TOKENS** (like ma-012/ma-013).
- **EX-002 Special Rocket Launcher**: the printed text is WRONG. Corrected to
  "when gained attach it to your character. the next time an infected with 80 or
  more health is revealed while exploring, defeat it immediately and remove this
  card from the game" — the 80 threshold is the **INFECTED's** Health, not the
  Character's.
- **EX-005 Ammo x50** grants **+50 Ammo AND +50 Gold** (two bonus icons).
- **EX-007 Blue Herb** returns to its OWN market pile and can be bought again.
- **EX-009 Poison** is a **new 'counter' card type kept in a shared supply by the
  board**; it returns there when the attached Character dies.
- **Copies: 2 each for the two Infected (EX-006/008), 1 each for everything else**
  (the copies question was skipped; this is the implemented default — change
  `copies` in `data/custom.ts` if Manny wants otherwise).
- "Conditions" on EX-006/008 maps to the engine's **Decorations**.

**What was built:** `CardType 'counter'` + `CardZone 'supply'` + `PlayerState.counters`
+ `GameState.supply` + `CardDef.counterEffects`; `engine/counters.ts`
(`poisonDamageAtTurnStart` / `attachCounterToSeat` / `returnCountersToSupply`);
new effect kinds `gainCardAndRemoveToken`, `gainAnyWeaponAndRemoveToken` (token),
`attachOnGainDefeatInfectedAtOrAboveHp` (weapon), `onNotDefeatedAttachCounter`
(infected), `returnToMarketAndRemoveCounters` (item), `damageAtTurnStart` (counter).
**Custom MARKET cards are new plumbing**: `pilesForScenario(id, { customCards })`
gives every selected custom card that prints a cost its own `custom-<id>` pile
(EX-002/005/007); counters and mansion cards are excluded. `cardsForScenario`
pulls in a counter that a selected card references (EX-006/008 -> EX-009) even if
the room did not tick it. `setup()` seeds the shared supply from every `counter`
card in the list.
- **EX-002** attaches in `gainCard` (the single gain choke point) and fires from
  BOTH explore paths — the single explore overrides the outcome, the multi-explore
  filters the auto-defeated Infected out of the batch (`autoDefeatedEntries`) and
  still awards its Decorations/trophy. It does NOT fire from the ally-explore path.
- **EX-006/008** attach the counter in the single-explore, multi-explore AND both
  AC-042/Las-Plagas deferred (`pendingExplore`) resolvers. Max one per Character.
- **EX-009** deals its damage at the very top of `startTurnInternal`, BEFORE the
  downed check; a lethal hit downs the Character and ENDS the turn (revive is next
  turn via the normal downed path). Death returns the counter to the supply.
- **EX-007** returns to its home pile. **PITFALL FOUND BY THE SOAK**: a
  single-card pile is EMPTY once bought, so scanning the piles for a surviving
  copy of the card found nothing and the herb was orphaned in NO zone — the lookup
  now falls back to the `custom-<id>` convention (and removes the card if there is
  no home pile at all, so it can never orphan).
- **BONUS FIX**: the action log said `bought (custom-ex-007)` for single-card
  piles. `Action.buy` now carries an optional `instanceId`; the buy handler writes
  the physical card onto the log entry and `turnHistory.ts` prefers it.
- **UI**: `typeLabel`/`typeClass` gained counter/event/skill; PlayerPanel renders
  a `data-player-counters` row; Board renders a `Counter supply` pile; the lobby
  hint explains where each custom card goes.
- **Art**: `CARD-ART/EX-001..EX-009.png` sliced from the sheet (3x3 grid, even
  division + 3px inset, quantized to 256 colours) — verified in the browser.
- **Gates**: typecheck clean (3 workspaces), game-core **821**, server **102**,
  client **171**, vite build OK. `engine/unofficialExpansion.test.ts` (**20**
  tests) covers every card + a 3-seed full bot game asserting conservation and
  counter cycling. Browser-verified on the prod server: the picker lists all 9,
  the 3 new piles render with art, the Counter supply renders, a buy logs the card
  name, and an explore resolves.
- **Still open:** the ally-explore path (`engine/allyExplore.ts`) does not apply
  EX-002/EX-006/EX-008 effects; the counters are only on the MAIN Character (a
  leading partner cannot receive Poison, and Blue Herb clears only the seat's main
  Character); EX-002 is buyable at 130 as well as granted by EX-001.
**OWN PANEL REMOVED, FULL ABILITY TEXT, HOVER CARD ON TOP (2026-11-09, commit pending):** three changes.
1. **The viewing player's `PlayerPanel` is gone from `.board-players`.** `Board.tsx` now renders panels
   only for `player.seat !== mySeat`. Their character/partner cards, HP, decorations, resources, deck
   and discard already live in the action bar, so the board copy was pure duplication (and the tallest
   block on the board). `PlayerPanel`'s `isMe` prop stays for compatibility but is now always `false`
   from the board. Board height at 1280x900 went 597 → 697 (more room for everything else).
2. **The character hover panel is no longer clamped.** It had `-webkit-line-clamp: 3` per level and
   `max-height: 100%` of the card, so long abilities were truncated. Measured content heights at 7px in
   an 80px card: Leon/Claire/Barry/Ada/Krauser fit (102-111px), but **Wesker 166, Chris promo 157,
   Jill promo 140, Rebecca Nurse 229, HUNK 239** on a 114px card. The clamp and the card-height cap are
   removed, `.skill-text` is a plain block, and the art-only card gets `overflow: visible` on hover so
   the panel can extend past the card's top edge. A safety cap remains:
   `max-height: calc((100vh - 40px) / var(--cc-scale, 2.5))` — the division is REQUIRED because
   max-height applies in pre-transform units, so without it the rendered cap would be 2.5x the viewport.
   The mobile block's 2-line clamp is gone too (the text is unclamped everywhere now).
3. **Hover scale 2 → 2.5**, and the hover card now paints above EVERY other UI element. `.cc-fan`
   scales by `var(--cc-scale)` (new custom property on `.player-character-card`, default 2.5).
   **Stacking:** `.player-character-card:hover` z-index 40 → **60**, and a new
   `.app-action-dock:has(.player-character-card:hover) { z-index: 80 }` lifts the whole dock above the
   log slide-over (60) and its scrim (55). Raising only the card's z-index is NOT enough — the dock
   creates a stacking context, so a child can never escape its siblings' z-indexes. The panel's
   background also went 0.78 → **0.92** alpha: at 0.78 the covered buttons bled through and read as if
   they were on top.
- **Verified:** Wesker (the current seat's character) renders both rows with
  `scrollHeight == clientHeight` (166px, `clipped: false`); a synthetic HUNK worst case renders 239px
  of text at 2.5x with `scrollHeight == clientHeight`. `elementFromPoint` at a point inside both the
  panel and the EXPLORE button returns `.skill-text` (panel on top); same against the open log
  (dock 80 > log 60 > scrim 55). Mobile 390x844: card 110x157, panel 110x577 fully inside the viewport;
  desktop 1280x900: card 200x285, panel 200x415, top at y=477.
- **Test:** the Board test now expects 1 panel (not 2), no `data-me="true"`, and `data-seat="1"`.
- Gates: typecheck clean, client 178, game-core 801, server 102, `vite build` OK.

**TURN / TOTAL-DECORATION / ROOM / STATUS CHIPS IN THE STATS BAR (2026-11-09, commit 9444be2):**
asked to "add the turn count and total player decoration count to the action-stats bar, move the room
number and status to the action-stats bar as well".
- `ActionBarStats` gained four **optional** props — `turn`, `decorations`, `roomCode`, `status` — and
  renders four more `.action-stat` chips after Buys: `Turn N`, `★ N`, `Room CODE`, and the status
  word. Optional so the component's existing five-chip call sites and tests still work.
- **"Total player decoration count" = the sum across every seat**
  (`state.seats.reduce((sum, s) => sum + s.decorations, 0)`), matching the game-level turn counter
  rather than the viewing player's per-turn numbers. A test builds a 6 + 4 state and asserts the
  chip reads **10**, not 6.
- The `.dock-status` corner group is **gone** from `ActionBar` (and its CSS, plus the
  `.app-board .dock-status` / `.app-room` / `.app-status` mobile leftovers). The chips keep the
  `app-room` / `app-status app-status-<s>` classes and `data-app-status`, so the existing test hooks
  still work; it now also asserts they appear **after** `action-stats` in the markup and that
  `dock-status` is absent.
- **CSS specificity gotcha:** `.app-board .action-stat` (two classes, later in the file) paints every
  chip neutral grey `#7f8896`. A two-class `.action-stat-status.app-status-connected` **ties** with it
  and loses on source order, so the connection colour silently never applied. The status colour rules
  are now **three** classes (`.action-stat.action-stat-status.app-status-connected`) to win
  outright. The status chip's `<strong>` is `{ color: inherit }` so it takes the chip colour.
- The status chip carries only a value, so without a `<strong>` its line box was 14px against the
  other chips' 19px — wrapping the value in `<strong>` makes all chips the same height.
- Measured: desktop 8 chips in one row, all **22px** tall, status green `rgb(123,216,143)`; mobile
  8 chips wrapping to two rows, all **19px** tall, dock 234px, no dock scroll, no page overflow.
- Gates: typecheck clean, client 178, game-core 801, server 102, `vite build` OK.

**EVERY CHARACTER CARD IS 80x114 (2026-11-09, commit 3eed5ff):** Manny asked to "increase the size of
the player character card to be 80x114 to match the partner character card". Root cause: promo
characters (`set: 'promo'` — pr-001 Chris, pr-002 Jill, pr-009 Rebecca, pr-010 HUNK) have a shorter
art window, and `.card.card-character.card-promo.card-art-only { aspect-ratio: 320/292 }` made their
cards **80x73** while base characters were **80x114**. In partner mode the main and partner are
drawn independently, so a seat could easily end up promo-main / base-partner (confirmed live: seat 1
had Jill Valentine (Promo) / Chris Redfield (premier)).
- **Removed the promo aspect override** — every character card is now the full `320/456`, i.e.
  **80x114** at `--cc-w: 80px`.
- **Promo art is letterboxed, not stretched or cropped.** Cropping (`object-fit: cover`) would cut
  off the printed Health badge near the right edge, and the live HP ring's `--cc-badge-x/y`
  percentages resolve against `.card-portrait` — so the portrait keeps `aspect-ratio: 320/292` and is
  **centred vertically** in the taller card (`top: 50%; transform: translateY(-50%)`), with the
  card's own gradient filling the letterbox. That keeps the ring exactly on the printed badge.
- The promo-specific 2-line skill clamp was dropped: the card is full height now, so promos use the
  same three-line clamp as every other character card.
- **Verified live in a real 2-player Partner Mode room** (hosted via a throwaway `ws` probe, browser
  joined as the second player and started the game): every seat's main and partner card measured
  **80x114**, the promo portrait measured 80x73 centred with 20px above and 21px below, and the HP
  ring sat on the art's top-right badge. Hovering the promo card scaled it to 160x228 with the
  portrait at 146px and the rules panel fitting (scrollHeight == clientHeight, 93px), boxes reading
  `Lv1:☆` / `Lv2:☆`.
- Gates: typecheck clean, client 174, game-core 801, server 102, `vite build` OK.

**BIGGER ABILITY TEXT, "Lv1:★" STAT BOXES, FLOATING CONTROLS BAND (2026-11-09, commit 4ccb375):**
Manny asked for three more UI changes on top of the character hover work.

1. **Scale the ability text.** The overlay was 6px; it is now **7px** (desktop) / **6px** (mobile).
   7px is the largest size whose two clamped rows still fit inside the 114px base card — the
   content needs 91px and **8px needs 121px**, so 8px clips. Promo cards are the short 320x292 art
   window (73px tall), so they get a **2-line clamp** instead of 3 (7px x 3 lines = 91px > 73px;
   measured 74 vs 73 with the clamp). Mobile keeps the smaller font because its card is 63-79px.
2. **Stat box now reads "Lv1:★" / "Lv1:☆".** Replaced the pixel `SkillIcon` glyph, the separate
   `.skill-level` span and the `.skill-gate` number with one string:
   `Lv{entry.level}:{unlocked ? '★' : '☆'}`. The component's `SkillIcon` function is **deleted**
   and its CSS (plus the `.card-character .skill-level` / `.skill-gate` rules) is gone.
   **The absolute decoration gate is no longer displayed** — it moved into the box's `title`
   tooltip and stays on the panel as `data-level1-at` / `data-level2-at`. Locked rows keep
   `opacity: 0.55` (the grey-out Manny asked to leave in place).
   **Test churn:** 7 assertion blocks asserted the gate NUMBER (`>0<`, `>4<`, …); they now assert
   the star text and the `data-levelN-at` attributes, so the gate thresholds are still covered.
3. **The controls band floats above the action bar.** `.app-action-dock .action-row-controls` is now
   `position: fixed; left: 0; right: 0; bottom: var(--dock-h, 0px); background: transparent` with
   no border and its own padding. It is still a DOM child of the dock (so the existing
   `.app-action-dock …` overrides keep applying) but out of flow, anchored to the dock's measured
   height that App.tsx publishes as `--dock-h`. Measured at 1280x800: the band is y=590..629
   (39px) and the dock starts at y=629 — **they touch exactly**, and the band overlaps the board's
   bottom 23px as asked. Mobile gets its own `padding: 0 8px 6px` because it is no longer inside
   the dock's padding.
   **Note:** the dock shrank from 213px to 171px at 1280x800 (the controls are no longer in it), so
   the board gained height. The board itself still scrolls on desktop (its content is 1438px in a
   597px box, mostly the 531px `.market-piles` block wrapping into rows) — **pre-existing**, not
   caused by these changes.
- Gates: typecheck clean, client 174, game-core 801, server 102, `vite build` OK.

**ATTACHED TROPHY FAN ON CHARACTER HOVER (2026-11-09, commit 8993c39):** Manny asked that a
hovered character card also **display its attached (defeated Infected) cards to the right**, laid out
like the hand, with **the overlap growing with the number of attached cards**.
- `CharacterCards` resolves `player.attached` / `player.partnerAttached` to defs and renders them as
  art-only `CardView`s inside **`.cc-attached-fan`** (one fan per character; the partner gets
  `data-partner-attached-fan`).
- **The transform moved from `.card` to a new `.cc-fan` wrapper** so the trophies enlarge together
  with the character card. `.cc-fan` is `position: relative` and the fan is
  `position: absolute; left: 100%` — so revealing it never reflows the action bar, and it starts
  flush at the character card's right edge.
- **The overlap is a FRACTION of the card width, `--cc-overlap`**, computed from the trophy count by
  the exported `attachedOverlap(count)`: `0.25` at one trophy (matching the hand's own overlap),
  `+0.08` per extra trophy, capped at `0.85` so cards never stack backwards. The CSS is
  `margin-left: calc(var(--cc-overlap) * var(--cc-w) * -1)` on every fan card except the first.
- **The card width moved to `--cc-w` on `.player-character-card`** (80px, 56px at <=820px, 44px at
  <=400px) instead of being set directly on `.card`, so the fan can size itself identically. Three
  existing rules had to change: `.player-character-card .card`, `.app-action-dock
  .player-character-card .card`, and the two mobile `--cc-w` overrides.
- **Measured live with 5 trophies injected** (via a temporary `window.__store` probe in store.ts,
  removed afterwards — `git checkout client/src/store.ts` restored it): desktop character 160x228
  with a **448px** fan starting flush at its right edge; mobile 88x125 with a **247px** fan ending
  **47px inside the dock**. No page overflow, the board does not scroll, and the rules panel still
  fits. `--cc-overlap` read 0.55 for 5 trophies (0.15 + 0.08*5) as designed.
- **Test lesson:** the older assertions `html.match(/card-character/g).length === 2` and
  `/cc-attached/g === 2` broke because the fan adds `card-art-only` and `cc-attached-fan`
  elements. They now match the full class (`/card card-character/g`) and `class="cc-attached"`
  instead of a bare substring. +2 tests (fan markup; overlap grows with the count and is capped).
- Gates: typecheck clean, client 174, game-core 801, server 102, `vite build` OK.

**CHARACTER CARD HOVER = IN-PLACE ENLARGEMENT (2026-11-09, commit 8801a9f):** Manny asked to
**"remove all current hover card implementations on character cards"** and instead have the card
itself get larger on hover with its card text overlaid on the art, "like the resource cards
behave". So character cards are **no longer wrapped in `HoverCard`** at all, and the old
`.hover-card-pop .card-character*` sizing rules are gone.
- **Hover scales the card 2x** (`.player-character-card:hover .card { transform: scale(2) }`) —
  a transform, so the action bar never reflows. **`transform-origin: bottom left`** is
  load-bearing: the card is the leftmost control in the bar, and `center bottom` pushed the
  enlarged card off the left edge of the screen (measured x = -24 at 1600x1000).
- **The rules panel fades in OVER the art** on a `rgba(8,9,12,0.78)` scrim.
  `CharacterCard` now renders the panel whenever the art-only face is on (`artOnlyMode || !compact`),
  and CSS absolutely positions it (`left/right/bottom: 0`, `max-height: 100%`) so it never
  changes the card's size. It is **`pointer-events: none` while invisible** — while hidden it
  overflows the card and would otherwise swallow clicks on the deck/hand control above it.
- **Two sizing facts that took measurement to find:**
  1. The skill rows must **stack the stat box above the text** (`flex-direction: column`).
     Side-by-side leaves ~38px of text width = one or two words per line.
  2. Each level's text must be **clamped to 3 lines** (`-webkit-line-clamp`), exactly how
     `.card-has-art .card-text` clamps a resource card. Unclamped, the panel needs **161px** for
     Barry on a 114px card and **175px** for Rebecca on a **73px promo card** — it can never fit.
     At the inherited 8px font it clips the second level entirely; 6px fits.
- **The dock must stop clipping while a character card is hovered:**
  `.app-action-dock:has(.player-character-card:hover) { overflow: visible }`. The enlarged card
  deliberately grows up over the board, and the dock's `overflow-y: auto` was cutting it off at
  the dock's top edge.
- **Phone (≤820px):** the card is only 44-56px wide / 63-79px tall, so the overlay is smaller
  (5px, 2-line clamp) and `max-height: none` — the panel runs ~8px past the card, which lands on
  the hand row below it inside the dock rather than off-screen.
- **Measured after (live board, transitions disabled because headless Chrome never advances
  CSS transitions — they stay `running` at their start value):** desktop card 160x228 / panel
  160x182, tablet 112x160 / 112x142, phone 88x125 / 88x142 — `panel.scrollHeight ==
  clientHeight` at every size (no clipping), panel opacity 1, `dockOverflow: visible`, no page
  overflow, no board regression.
- **Pitfall for verifying this:** `getComputedStyle` during a hover reports the transition's
  START value in a headless browser, so the card looks un-scaled and the panel invisible unless
  you inject `transition: none` first. Check `el.matches(':hover')` and
  `document.querySelector('.player-character-card:hover .card')` to confirm the selector fires.
- Tests unchanged (172) — the `CharacterCards` describe already asserts both cards render the
  same; the popup removal needed no test change because no test asserted the character popup.
- Gates: typecheck clean, client 172, game-core 801, server 102, `vite build` OK.

**ACTION-BAR DECLUTTER (2026-11-09, commit 8d19f20):** Manny asked for four tweaks.
1. **`.action-col-label` removed** — the CHARACTER / DECK / DISCARD captions are gone.
   Nothing is lost: the character card needs no caption and the deck/discard
   `ZonePile`s already carry their own `.zone-pile-label`.
2. **Character cards now use the art-only face**, exactly like the resource piles
   (`CardView` forwards `artOnly` to `CharacterCard`, which adds `card-art-only`).
   `.card.card-character.card-art-only` drops the 3px frame, the corner ticks and the
   4px inset, and the art fills the card edge to edge. The card needs an **explicit
   aspect ratio** because the portrait becomes `position: absolute` and no longer
   gives the card height — `320/456` for base characters, `320/292` for promos. The
   live HP ring still lands on the Health badge printed in the art. Measured at
   1600x1000: 80x114, `border: 0px`, `padding: 0px`, transparent background, no
   shadow — versus a hand card at 80x112, `border: 0px`, `padding: 0px`. (The
   "frame" still visible in a screenshot is the printed border INSIDE the art, which
   is what a resource card shows too.) **Pitfall:** `.card.card-character` is defined
   AFTER the art-only block and also carries two classes, so the override must be
   `.card.card-character.card-art-only` (three classes) or `border`/`padding` silently
   lose to source order.
3. **The partner card renders identically to the player card.** The `HP x/y` and
   `Attached N` spans under it are gone; the attached count is a **`.cc-attached`
   badge** in the visual language of a `.zone-pile-count` (gold disc, `right/bottom:
   -5px`, bottom-right corner), on BOTH cards so the pair stays identical. Verified
   in a real partner-mode server room: both cards 80x114, same class list, same single
   `.card-portrait` child, no `player-partner-*` spans.
4. **Stat pills 25% smaller and borderless.** Base: `font-size 11 -> 8.25px`,
   `strong 14 -> 10.5px`, `padding 4px 10px -> 3px 7.5px`, `gap 4 -> 3px`,
   `border: none`. The `.app-board` theme override: `font-size 10 -> 7.5px`,
   `strong 15 -> 11.25px`, `padding 4px 12px -> 3px 9px`, `border: none`. The mobile
   tiers now only tighten padding (they no longer set a font-size, so they inherit the
   already-shrunk values).
- Tests: +3 in `ui.test.tsx` (172 total) — a character card with `artOnly` gets
  `card-art-only`/`data-art-only`, and a new `CharacterCards` describe asserts both
  cards render the same with no text underneath and that the badge carries the right
  counts. The partner fixture has to register the partner CHARACTER instance in
  `state.cards` as well as `partnerInstanceId`, or `defForInstance` returns null and
  only the main card renders.
- Gates: typecheck clean, client 172, game-core 801, server 102, `vite build` OK.

**M6 MOBILE LAYOUT (2026-11-09, commit 5226b7a):** Manny asked for **"specific UI tweaks —
I'm trying to maximize board space on mobile screens"**. Measured the real board in the
browser at five viewports *before* changing anything, and it was broken, not just untidy:
**at 390x844 the board was 2px wide** and the log sidebar took 87% of the screen; at 360x640
it was **0px**. Two root causes, both in `client/src/styles.css`, which had **zero `@media`
rules**: `.app-side { width: 340px; flex-shrink: 0 }` could not shrink while
`.board { flex: 1 1 auto; min-width: auto }` could not go below its min-content width, so the
board was crushed instead of the sidebar; and `.action-identity { flex-wrap: nowrap }` with
`.action-col-hand { min-width: 160px }` made the dock **456px wide and scrollable** on a
390px phone. Manny's choices: Resource Area = **one swipeable row**, log = **slide-over from
the right, closed by default**, opponents = **slim chips (name / HP / ★ / Attached)**, hand
cards = **64px**.
- **All fixes are in a new `@media (max-width: 820px)` block appended to styles.css**, plus
  a `@media (max-width: 400px)` tier. **Every rule is scoped to `.app-board`**, so the
  desktop layout is untouched — re-measured at 1600x1000: board 1212x730, dock 238px,
  sidebar 340px, identical to before.
- **Resource Area → one swipeable row.** 18 piles wrapped into a column was **1072px tall**
  at 768px and **3276px** at 390px. Now 159px with `scroll-snap-type: x proximity`.
- **Log → off-canvas slide-over.** `.app-side` becomes `position: fixed` (which also removes
  it from the flex row, letting the board take the full width), translated 105% off-screen
  until the shell carries **`.app-log-open`**, with a scrim (`.app-log-backdrop`, tap to
  close) below it at z-index 55. `App.tsx` now owns that class, initialises `logOpen` from
  `matchMedia('(min-width: 821px)')`, and **closes it on a `change` event when the window is
  narrowed across the breakpoint** — otherwise a desktop user shrinking the window would be
  left staring at a scrim covering the board.
- **Opponent panels → slim chips in a swipeable row.** A full panel was ~1050px wide once the
  public play-area/discard rows and the skill list were in it, which wrapped `.board-players`
  into a 400px-tall slab. On mobile `.player-pools`, `.player-deck-stats`,
  `.player-public-zones`, `.character-skills` and `.player-character-row` are hidden, and the
  character name truncates with an ellipsis. **`Attached` moved out of `.player-deck-stats`
  into the HP/★ row** (`PlayerPanel.tsx`) — it is a score, not a deck statistic, and it is
  the one count the chip still shows. That also made the desktop panel 48px shorter.
- **Action dock compacted** (it is a fixed overlay, so every pixel of its height is a pixel
  of board lost): 329px → **271px** at 390x844. The identity band wraps, the hand gets its
  own full-width row at 64px, and `.action-buttons` wraps instead of overflowing.
- **`HoverCard` clamps its popup to the viewport** (`half = 92`) — at 150-180px wide and
  centred on the trigger, it hung off the edge of a phone.
- **`.lobby-form` wraps** (found while checking the lobby at 390px): the join form was
  **532px in a 358px container**, which forced the phone to widen the layout viewport to
  **548px**. `flex-wrap: wrap` + `input { flex: 0 1 220px; min-width: 0 }` fixed it.
- **Latent bug this exposed:** `.board` is a flex COLUMN with `overflow: auto`, so its
  sections defaulted to `flex-shrink: 1` and were squeezed instead of the board scrolling —
  at 360x640 the players block collapsed to **4px**. Fixed with
  `.app-board .board > * { flex: 0 0 auto }`.
- **Measured after:** 390x844 board **374x557** (was 2x483), dock **271px / 32%** (was
  329px / 39%), market **159px** (was 3276px), **no board scroll, no page overflow**.
  360x800, 414x896, 430x932 and 768x1024 all fit with no scrolling either. 360x640 (a 2014-era
  screen) still scrolls ~160px — the dock alone is 48% of that viewport.
- Tests are `renderToStaticMarkup` in a **node** env, so none of this is covered by the suite;
  every number above is from the live browser. Gates: typecheck clean, client 169,
  game-core 801, server 102, `vite build` OK.

**M6 UI — SURVIVAL-HORROR BOARD THEME (2026-11-08, commit c911adf):** Manny asked to
tweak the client UI and picked **board/in-game screen only**, direction **"more RE
atmosphere — darker, grittier, stronger horror mood"**. Done as an **override layer
appended to `client/src/styles.css`** (base rules untouched) scoped to **`.app-board`** —
a class `App.tsx` adds to the shell *only* in the in-game branch, so the lobby is
byte-identical. Contents: near-black room with cold teal + blood radial glows, a heavy
vignette and a tiled SVG `feTurbulence` film grain at 5%; brushed-steel header/dock with
a 3px desaturated hazard-stripe edge; dossier section titles (blood tick + hairline);
darker steel panels; machined-steel buttons via `.app-board :where(button)` (zero
specificity so component classes win — `.market-pile`/`.hand-card` are explicitly reset
or the card-shaped buttons break); desaturated stat-pill accents; darker card frames and
card backs; themed scrollbars; **fixed SkillPanel's undefined `--card`/`--accent`/
`--muted-foreground`**; stronger card-art scrims (0.72 → 0.82) for legibility. Gates:
client 163 tests, typecheck clean, vite build OK. **Next:** Manny's call on whether to
push the atmosphere further (active-player glow, dimmed-card affordance, player-stat
dividers were all flagged in review and left out deliberately).

**Current state (2026-11-07 ~15:00):** M1 ✅ 16/16, M2 ✅ 5/5 + bot-logic v2, M3 ✅ 5/5 (T01–T05), M4 ✅ client complete. **M5 ✅ T01–T05 (COMPLETE).** All 47 characters have engine behaviour. **Mercenaries (52 cards) ✅, Nightmare (50 cards) ✅.** **Duplicate card ids RESOLVED — `ALL_CARDS` is now 304 cards with 0 duplicate ids.** **Downed/revive wired into the damage path.** **Every rules-text-only card now has engine behaviour (WE-001/018/018g/019/021/025/030, MA-045/047/048/049/054o/055o/056o/057o).** **No effect kind is dead any more (MA-025/030/036, WE-028, IN-002/004 done; AC-049/035/038 were always prompt/id-handled).** **MULTI-EXPLORE (exploreCount) + PARTNER EXPLORE FIX ✅** (see below). Suites: **game-core 710, server 97, client 141** — all green, typecheck clean (3 workspaces), client build OK, soak green (22/30 natural). **M5-T05 DONE (commit 0083419):** FAQ checklist at `docs/rules/FAQ-VERIFICATION.md` — FAQ-1/FAQ-2/partial-draw PASS; **FAQ-3 Gatling Gun Majini was a real gap, FIXED per Manny's ruling** (the +5 per full 10 total Ammo boosts the Infected's OWN attack, not the player's damage). **M5 COMPLETE — release-ready; next step is Manny's call (deploy / M6 scope).**

**CUSTOM CARD LINE (2026-11-08):** the first fan-designed card, **MX-001 Mr. X**
(60 Health / 30 Damage / 5 Decorations, 2 copies), is in. Manny's ruling: "If this
infected is not defeated, place it on top of the mansion as the 5th upcoming card"
means **insert into the mansion deck 5th from the top** (index 4) — NOT the bottom,
and NOT "on top". New `set: 'custom'` + `data/custom.ts` (`CUSTOM_CARDS`, deliberately
NOT in `ALL_CARDS`) + `InfectedEffect` kind `onNotDefeatedInsertIntoMansionAt` +
`mansion.insertAt`. Reachability is a room toggle: the lobby has an expandable
**Custom Cards** picker (create-room form, host room controls, pass & play), the
selection rides `createRoom.customCards` / `setCustomCards`, and
`cardsForScenario(id, { customCards })` appends them; `setup()` always shuffles every
custom mansion card it finds in that list into the Mansion (kitchen-sink scenarios
exclude them from the fallback pass and append them uniformly, so both paths agree).
Consumed in the single-explore, multi-explore and AC-042 deferred-explore
disposition paths. Art: `CARD-ART/MX-001.png` (from Manny's scan). Tests:
`engine/customCards.test.ts` (13) + protocol/rooms/hotseat/Lobby cases. Gates:
typecheck clean, game-core 735, server 102, client 146, build OK.
**Reveal overlay for re-inserted cards (2026-11-08):** `detectReveal` now also reports
`outcomeZone: 'mansion'` — a revealed card found back in `next.mansionDeck` was
re-inserted (revealing REMOVES it from the deck, so being back means re-inserted; the
revealed set is the top `exploreCount` of the PRE-explore deck). Do NOT compare deck
indices: every card behind the reveal shifts up, so index drift flags cards that were
never revealed. `App.tsx` renders "was returned to the Mansion deck." Browser-verified
on a forced Mr. X reveal (overlay shows his art + that line). Tests: +4 in
`anims.test.ts` (client 150). Also: MA-025 was already Alliance's Duvalia, so the
custom card uses the `mx-` prefix to keep the official numbering intact.

**CUSTOM CHARACTER LINE (2026-11-08): CU-001 Ricardo Irving** (80 Health, 1 copy,
`level1At: 3` / `level2At: 8`) is the second fan card and the first custom CHARACTER.
L1 `revealInventoryTopForAction`: during your turn, reveal the top of your Inventory;
an Action there moves to your hand (once per turn, needs a non-empty Inventory).
L2 `damageReductionAndGiveDamage` (threshold 30, reduction 10, give 10): a hit ABOVE 30
is provisionally lowered by 10 and a `ricardoL2` prompt asks which Character takes 10
(options = every other seat + `Decline`). Accepting deals 10 to the chosen Character;
declining re-applies the reduction (the full hit lands). Implemented as ONE choke point,
`applyRicardoDamage(state, seat, hp, amount)` in `abilities.ts`, called from EVERY
`applyHpLoss` site (actions.ts, mercenaries.ts, nightmare.ts, outbreak.ts, skill.ts) —
the engine resolves damage atomically through `applyHpLoss`, so a helper at that seam
covers explore, traps, AoE, MA-031/037/038, Kevlar and skill damage. The two
`applyHpLoss` calls inside the `ricardoL2` prompt handler are the effect itself, not
damage intake. Art: `CARD-ART/CU-001.png` (from Manny's scan, cropped to the character
art window). The lobby's Custom Cards picker now lists characters too (the hint says
Infected go to the Mansion deck and Characters enter the deal pool), and
`selectableCharacters(room)` only offers custom characters when the room enabled them.
Tests: `engine/customCharacters.test.ts` (11), +2 ActionBar cases, +1 Lobby case,
+1 portrait case, +1 gate case. Gates: typecheck clean, game-core 746, server 102,
client 155, build OK.

**FAN CHARACTER LINE (2026-11-08): LK-001 Leon, CR-001 Claire, CC-001 Claire** —
three more custom characters (all toggle-gated like MX-001/CU-001).
- **LK-001 Leon S. Kennedy** (90 Health, L1 at 1 / L2 at 8): L1 DUAL WIELD
  (`plusDamagePerPistolUsed`, amount 5, threshold 2) = +5 damage per pistol when
  using 2+ pistols; L2 RAPID FIRE (`playAreaCardsArePistols`) = every card in the
  play area is also labeled as a pistol.
- **CR-001 Claire Redfield** (70 Health, L1 at 0 / L2 at 7): L1 TACTICIAN
  (`plusBuyPassive`) = +1 Buy; L2 SPECIALIST (`turnStartActionsForBuy`) = at turn
  start, may get +2 Actions and -2 Buy (Yes/No prompt).
- **CC-001 Claire Redfield** (90 Health, L1 at 2 / L2 at 5): L1 uses the existing
  `ammoReqReduction` with tag `shotgun` (-10 Ammo); L2 (`healOnDefeatWithWeaponTag`)
  = heal 5 when defeating an Infected with a Shotgun weapon.
New ability kinds live in `types.ts` beside the CU-001 ones. RAPID FIRE is
implemented as ONE tag choke point — `effectiveWeaponTags(state, seat, instanceId)`
in `abilities.ts` — and every "is this a pistol" check now reads it
(`exploreAmmoReq`, `mercenaries.weaponAmmoReq`, `skill.exploreSkillDamageBonus`,
SK-029's reveal, `weaponReuse.maxWeaponUses`, `ammoReqForWeapon`'s extraTags
param). Healing is capped at max Health at each of the four defeat sites, and
`pendingExplore` now carries `weaponIds` so the deferred (Las Plagas / AC-042)
resolution can still apply the heal. Art: `CARD-ART/LK-001.png`, `CR-001.png`,
`CC-001.png` from Manny's scans. Tests: `engine/fanCharacters.test.ts` (28),
+4 portrait/gate cases and a Lobby case client-side. Gates: typecheck clean,
game-core 774, server 102, client 159, build OK.

**FAN CARD LINE 2 (2026-11-08): CI-002 Infected Crow + FCH-008 Sherry Birkin** —
- **CI-002 Infected Crow** (20 Health / 10 Damage / 2 Decorations, 2 copies) has
  the new `InfectedEffect` kind `onRevealRevealNextMansionCard`: when revealed,
  reveal the next Mansion card; an Infected joins the SAME battle, anything else
  is shuffled back into the Mansion. Implemented by adding an infected branch to
  the explore handler's event-expansion loop and letting a single explore that
  reveals a Crow fall into that loop (`exploreCount > 1 || crowChainPending`), so
  the chained Infected is resolved by the existing `resolveMultiExplore` batch.
  Crows chain through each other; the loop marks expanded Crows so a re-scan
  cannot expand the same one twice.
- **FCH-008 Sherry Birkin** (50 Health, `level1At: 0`, NO `level2At` — a
  single-level character) has two abilities: `cannotUseWeapons` (a passive
  restriction enforced in explore validation and in `enumerateLegalActions`) and
  `forceAllyExploreWithSupport` (manual, once per turn). The manual ability opens
  a seat prompt; choosing a player immediately resolves an explore FOR them out
  of `engine/allyExplore.ts` — the weapon pool is the target's hand weapons plus
  Sherry's, Sherry pays the Ammo (it is her turn), each weapon ends up in its
  OWNER's play area, defeated Infected and their Decorations go to SHERRY, the
  damage the Infected deals is split evenly (target rounds up, Sherry rounds
  down), and the exploring player then redraws a fresh hand. Validation requires
  Sherry to afford the combined arsenal for at least one candidate target.
  NOTE `applyRicardoDamage` only COMPUTES the new Health — the caller must write
  it back into the seat (that bug made the first Sherry test pass silently).
  Tests: `engine/customCrow.test.ts` (8) + `engine/fanSherry.test.ts` (9), +3
  client cases. Art: `CARD-ART/CI-002.png` (whole card, like every infected PNG)
  and `CARD-ART/FCH-008.png` (character art window).

**FAN CARD LINE 3 (2026-11-08): EV-001 Zombie Grab + a Sherry correction** —
- **EV-001 Zombie Grab** (event, 1 copy): "Trash a weapon from your hand or
  discard pile; otherwise, take 20 damage, then shuffle this card into the
  mansion." Per Manny's ruling the card is ALWAYS shuffled back into the Mansion
  (a recurring hazard). Revealing it opens a `zombieGrab` prompt whose options
  are every weapon in `handAfter` + `discardAfterExplosives` (NOT `player.hand` —
  the explore has already moved the used weapon to the play area) plus
  "Take 20 damage"; the handler trashes the chosen weapon or applies
  `applyHpLoss`, then `shuffleBack`s the event. Custom EVENT cards needed a
  `isCustomMansionCard` predicate in `setup` — `isMansionCard` only covers the
  official set's types, so a custom event would otherwise never reach the deck.
- **Sherry correction:** the forced explore may spend BOTH the exploring
  player's and Sherry's Ammo. `resolveAllyExplore` passes the combined pool to
  `resolveExplore`, then deducts Sherry's share first and the target's second;
  validation accepts the ability when ANY candidate target is affordable from the
  combined pools.
Tests: `engine/customZombieGrab.test.ts` (6), +1 Sherry case, +1 client case.
Art: `CARD-ART/EV-001.png` (whole card).

**BOT LOW-HP FREEZE FIXED (2026-11-08):** Manny reported that once the bots' Health
got low they stopped exploring and stopped progressing. Measured on
partnersInEscape / 4 hard bots: **0 heals over 4000-action games that never ended**,
explores 7-38 (a healthy rate is 60-130), and seats parked at 10 HP for 600+ turns.
Three coupled causes in `ai/evaluate.ts`, all fixed together:
1. **Healing items were scored at the generic 5 points**, so a 20g Green Herb lost
   to Ammo x10 every time. `healItemValue` now scores them at the Health they
   restore (20 for `healFixed20OrTrashWithSecondFor60`, 40 for
   `healToFull`/`healSelfAndPartnerToFull`). IMPORTANT: the Alliance "herb" pile is
   the RED herb `it-004` (`healSelfAndPartnerToFull`), so any heal-item detection
   that names only the two Premier kinds silently misses every Alliance scenario —
   `HEAL_ITEM_KINDS` + `isHealingItem` is the shared predicate, and `marketPull`
   reads it too.
2. **HP is linear, so a heal's +Health exactly cancels the gold it costs.** New
   `LOW_HP_FRACTION = 0.3` / `LOW_HP_PENALTY = 3`: below 30% of max, each missing
   Health point is extra-costly, so recovering is worth paying for.
3. **The flat -400 downed penalty made every low-HP explore look fatal** (at 10 hp
   a down is a +40 hp swing, because `revive` sets `hp = maxHp - 20`). Downed now
   scores `maxHp - 20` minus `DOWNED_TURN_PENALTY = 200`, plus a
   `MAX_HP_WEIGHT = 0.5` term on max Health (every down costs 20 max permanently).
   A down at `maxHp <= 20` is permanent defeat (`revive`) and scores -10000.
   NOTE: crediting the revive Health with NO counterweight makes a down a HEAL —
   the probe then had all four seats dead within 1125 actions.
Result: heals 1-3 per game, herb buys 2, explores 70-131 (was 7-38), and the
2-seat firstTimer sim metrics still pass. `evaluate.test.ts`'s 24 hardcoded score
expectations were re-pinned from the runner's `expected X to be Y` (all shifted by
the +50 max-HP term, plus the heal item's 5 -> 20).
**Still open (BALANCE, not AI):** partnersInEscape ends only when Uroboros Aheri
(hp 90, attack 70) is defeated — at <=70 hp every explore into it is an automatic
down, and the only healing is 2 copies of a 20g Red Herb across 4 seats. The bots
now explore at a healthy rate and heal when they can; if they still cap out, the
fix is scenario balance, not more weight tuning.

**CARD DESTRUCTION THE MORE AGGRESSIVE BOTS EXPOSED (2026-11-08):** with the bots
exploring (and therefore being downed) far more often, the soak's conservation
audit failed on alliance/2 — `we-023#1` and `we-003#2` were registered instances
in NO zone. Traced to a2552: the AC-050 Resuscitate "Decline" branch. Three
MID-TURN down handlers set `playArea: []` on the down, destroying every card in
it: `actions.ts` (resuscitate decline), `mercenaries.ts` (`dealDamageToCharacter`)
and `skill.ts` (`damageCharacter`). The normal down path (`applyDownedHooks`)
correctly KEEPS the play area and `endTurn` discards it into the discard pile, so
those three now keep it too. Regression test in `engine/downed.test.ts` ("a
mid-turn down keeps the Play Area; endTurn discards it"). Soak back to green at
22/30 natural (firstTimer/classicHorror/spyGames/whaddyaBuyin/battleHardenedVeteran/
nightmare 3/3 each; the expansion scenarios still cap — see the balance note above).

**CI-002 CROW COPIES = 5 (Manny ruling, 2026-11-08):** enabling the Crow custom card
adds **5** copies to the Mansion deck (`copies: 5` in `data/custom.ts`). While doing
this, a DUPLICATE `ci-002` entry was found in `CUSTOM_CARDS` (two identical blocks,
an earlier bad merge) — `cardsForScenario` uses `find` so only the first was ever
appended, but the duplicate is removed. Test: `customCrow.test.ts` now asserts the
data shape (5 copies) and that a game enabled with `ci-002` has exactly 5 Crows in
`mansionDeck + mansionBottom`.

**GREEDY PLAYOUT FOR THE HARD BOTS (2026-11-08):** `choosePlayoutAction` (`ai/policy.ts`) replaces
`chooseGreedyAction` for `hard` difficulty (`bot.ts`); easy/normal keep the 1-ply policy + noise.
The 1-ply policy scores each candidate by the state ONE action ahead, so it cannot see a line like
"play Ammo, then Explore, then Buy" — the payoff lands two actions away. The playout 1-ply scores
every candidate (cheap), keeps the best of each `candidateKind` (all buys share ONE kind, or 8+
market piles fill the shortlist and crowd out the explore/play lines), then ROLLS OUT the rest of
the turn with the same 1-ply greedy policy and compares the END-OF-TURN positions. Bounds:
`ROLLOUT_MAX_STEPS = 5`, `ROLLOUT_CANDIDATE_CAP = 6`. A line that wins the game scores
`WIN_BONUS - steps` (so the FASTEST win wins), and a won line is judged by speed alone — leftover
turn pools are worthless once the game is over, and scoring them ranked a slower win higher.
Measured on First Timer (2 hard bots, seeds 1-8): the playout agrees with the 1-ply greedy on 89%
of decisions, explores LESS per turn (~0.24 -> ~0.14) because it declines the losing fights the
1-ply EXPLORE_BIAS accepted, and roughly DOUBLES the Decorations the bots win (~14 -> ~30-40 per
game, the metric the game is decided on). `sim.test.ts` therefore pins a Decorations floor as well
as the explore-rate floor. Cost: ~30x the 1-ply policy per decision, so the soak went from
~11s to ~127s (it now carries a 240s timeout).

**ENGINE BUGS THE PLAYOUT EXPOSED (all pre-existing, all fixed with regression tests):** the
stronger AI reaches states the 1-ply bot never did.
1. **Kevlar Jacket (`ma-054o`) duplicate placement.** `applyDamageWithKevlar` removes the jacket
   from `attached` and puts it on the Mansion bottom, but FOUR call sites then rebuilt the seat
   from the PRE-kevlar `player`/`target` object (restoring it into `attached` while it was also in
   `mansionBottom`) or rebuilt the pile from a stale local (dropping it into no zone). Fixed in the
   single-explore infected-damage, single-explore trap, multi-explore infected-damage and attack
   paths (the multi-explore trap path already synced its local). Reading `state.mansionBottom` back
   into the local is WRONG — the reveal
   lives only in the local `rev.mansion`, so `state` still holds the revealed card.
2. **WE-019 bottom reveal duplicated the card.** Same root cause: the single-explore path's local
   `mansionBottom` was re-read from `state` (pre-reveal) and `sendToBottom` appended the revealed
   card a second time. Fixed by appending ONLY `kevlar.movedIds` to the local.
3. **Stale prompt options duplicated moved cards.** Prompts built during one action can be answered
   after a second prompt from the same action already moved the chosen card; the handlers appended
   it to the destination without checking the source. Added source-membership guards to
   `we044ChooseTarget`, `ma098ChooseTarget`, `ac043ChooseWeapon`, `we036Discard`/`we037Discard`,
   `luisDiscardOne`, `chooseActionCardCostAtMost` (Mind Control) and the Rebecca L1 trash-target
   handler (`weskerDiscardOneCard` and `ac044Discard` already had them).
**ACTIONBAR PROMPT UI + FALLBACK (2026-11-07, commit c035cab):** the ActionBar is the single
prompt renderer. It now renders EVERY queued prompt for the seat (not just the first), labels
options by kind (XP amounts → "N XP", seats → player names, card ids → card names), and has
an "Other actions" fallback that renders any legal action the rest of the UI does not expose —
currently Outbreak `attack` and Alliance `attachToPartner`, which were legal with NO UI.
Browser-verified: an Outbreak attack deals its damage and spends the Explore. Client 141.

**SKILL SYSTEM DRAFT FIX (2026-11-07, commit 3abcefc):** starting a game with skills on a base
scenario used to lock the game (the draft dealt empty hands → no prompt → deadlock). Now
`cardsForScenario(id, { skillSystem })` adds the 30 Skill cards on ANY scenario, `setup()` falls
back to the main phase if they are absent, the new `seatAwaitingAction()` drives the server bot
loop + `stepBot` + the pass-and-play hand-off during the draft, and pass-and-play gained a Skill
System toggle. Browser-verified: a server room (1 human + 3 bots) drafts 5 rounds + keeps 3 with
the human participating, and a 2-player pass-and-play hands the device between picks.

**CARD ART = PNG-ONLY (2026-11-07):** `game-core/src/data/CARD-ART/` now holds **69 card-face
PNGs** — the 18 premier mansion cards (MA-001..MA-017 + IT-002) and all 51 character cards
(CH-001..CH-051) — quantized to 256 colours at <=320 px wide (~100 KB each, 8 MB total,
replacing 25 SVGs at 76 MB / ~68 MB dist). `client/src/ui/cardArt.ts` globs `*.png`; the smoke
test checks a `.png` asset. The PNGs were sliced from two Tabletop Simulator sheet images:
grid auto-detected from edge peaks (mansion 10x4 @ 297x418, characters 10x5 + one extra card
below the grid @ 490x695), one PNG per card id, 3 px inset to drop the grid lines. Card ids were
read off the printed names + HP and cross-checked against the engine's `maxHp`; every match was
exact. Browser-verified: character art fills the portrait window from the PNG files.

**CARD ART ROUND 2 (2026-11-07):** a third sheet (the Mercenaries expansion subset) added **25 more
PNGs** — AC-042..AC-051 (all 10 Mercenaries actions), SK-001..SK-012 (Extension/Medic/Luck/Toughness
LV.1-3), AM-005..AM-007 (Ammo x10/x20/x30). The sheet is 4060x4214 but the cards only fill the top
1805 px (3 rows: 10 + 10 + 5, the last 5 slots of row 3 empty), 400x592 per card. Total CARD-ART is
now **94 PNGs / 11 MB**; dist 13 MB with 94 PNG assets. Gates: typecheck clean, client 141, build OK.

**CARD ART ROUND 3 (2026-11-07):** a fourth sheet (premier + alliance **resource** cards) added **54
more PNGs** — AM-001..AM-004, IT-001/003/004, WE-001..WE-025 (all premier + alliance weapons),
AC-001..AC-022 (all premier + alliance actions) — plus `CARD-BACK.png` (the generic card back, slot
r7c10 of the sheet). The sheet is 4900x4865, 10x7 grid @ 490x695, but only 63 slots are filled
(rows 1-6 full, row 7 has 3 cards + the card back); several cards appear twice, so the 63 cells
collapse to 54 unique ids. Card ids were read straight off the printed bottom-right card numbers.
Total CARD-ART is now **149 PNGs / 18 MB**; dist 19 MB with 149 PNG assets. Gates: typecheck clean,
client 141 (the "no art" test case moved from `it-001` to `we-043`, since IT-001 now has art),
build OK. Browser-verified on the prod server: every resource card renders its PNG.

**CARD ART CSS RESTORED + CHARACTER ART CROPPED (2026-11-07):** the art CSS (`.card-art-img`
absolute-fill, `.card-has-art` scrim rows, `.card-portrait-img`) had been dropped in an earlier
mansion-reveal refactor, so the PNGs rendered unstyled — resource cards showed a small image with
the app's text below instead of the art filling the card, and the character cards crammed the whole
card scan into the portrait window. Restored the block (from commit 9c67613) and:
- cropped every `CH-*.png` to the character art window (below the `[CHARACTER]` banner, above the
  name bar → 320x260), so the portrait window shows art only;
- gave `.card-character .card-portrait` an `aspect-ratio: 320 / 260` so the art is never cropped or
  letterboxed, and fixed the `::after` "Art" placeholder specificity (`.card-character
  .card-portrait.card-portrait-has-art::after`);
- dropped the character name bar to 9px / 0.5px tracking so long names ("REBECCA CHAMBERS") fit.
Browser-verified: the character art fills the window with no watermark, no leftover printed text and
no truncation; the resource cards fill their frames.

**CARD ART ROUND 4 (2026-11-07):** a fifth sheet (Outbreak + Nightmare + Mercenaries **resource**
cards) added **52 more PNGs** — IN-001..IN-007 (the Outbreak infection cards), AC-023..AC-041
(Outbreak + Nightmare actions), WE-026..WE-050 (Outbreak + Nightmare + Mercenaries weapons) and
IT-005 (First Aid Spray). The sheet is 4900x4865, a 10x7 grid @ 490x695 with 66 filled slots
(row 7 holds 5 cards plus the generic card back at r7c10); ids were read off the printed card
numbers, and the Mercenaries ammo/actions that also appear here were left as the round-2 files.
Total CARD-ART is now **201 PNGs / 27 MB**; dist 28 MB with 201 PNG assets. Gates: typecheck clean,
client 141 (the "no art" test case moved again, `we-043` → `ma-073`), build OK, smoke 12/12.
Browser-verified: an Outbreak pass-and-play renders the new action/weapon art.

**CARD ART ROUND 5 (2026-11-07):** a sixth sheet — the **promo characters** — added **10 PNGs**,
`PR-001..PR-010` (Chris Redfield, Jill Valentine, George Hamilton, Jim Chapman, Albert Wesker,
Yoko Suzuki, Alyssa Ashcroft, Cindy Lennox, Rebecca Chambers, HUNK). The sheet is 5500x5390 but the
cards fill only the top 1539 px: 10 cards in row 1 (550x770 each) plus `CH-022` (Kevin Ryman) alone
in row 2, which was already covered by round 1 and left alone. The promo cards have a much thinner
header than the base character cards, so the art crop runs from just under the `[CHARACTER]` banner
to the torn edge above the name panel (320x292, art only — the printed "NN Health" badge stays in
the top-right corner of the crop). Ids were read off the printed bottom-right codes one cell at a
time. Total CARD-ART is now **211 PNGs / 28 MB**; dist 30 MB with 211 PNG assets. Gates: typecheck
clean, client 141, build OK. Browser-verified: a pass-and-play that drew `pr-010`/`pr-009` renders
the promo art.

**MULTI-EXPLORE + PARTNER EXPLORE (2026-11-07 ~15:00, commit pending):**
- **Rulebook "Extra Explore" is implemented.** `Action.explore.exploreCount` is now a real choice: the player
  picks how many of their remaining Explores one action spends (1..`exploresLeft`, capped by
  `deckCount(mansionDeck+mansionBottom)`). The engine reveals N cards one at a time and battles ALL revealed
  Infected as ONE combined engagement — total Damage vs combined Health; on failure the player takes the combined
  Damage and every undefeated Infected goes to the bottom (or shuffles back per its own effect). All defeated
  Infected attach and their Decorations sum.
- `resolveMultiExplore` (`engine/explore.ts`) now applies every per-card on-reveal combat effect and returns
  `blockedByCannotDefeat` + `effectiveDamage`. The multi path in `engine/actions.ts` loops the reveal/defeat/
  not-defeated hooks per card (MA-037/031 AoE, Mercenaries/Nightmare/Outbreak reveal + defeat + not-defeated,
  Toughness/Luck/redirect consumption, Outbreak infection increases, Barry chain, MA-036 Reaper, on-defeat "may"
  prompts, decorations/level/XP, partner HP/death). MA-038/040/056o/057o resolve; MA-039/072 expand the batch;
  non-Infected reveals get take/bottom prompts.
- **Partner Modification explore fixed.** Partner-attached weapons now join the explore (`explorableWeapons` +
  new `isPartnerWeapon`, validation allows them). They are NOT moved to the play area, trashed, or removed, and are
  once-per-turn (`remainingWeaponUses`). The leader is chosen on the explore action (`action.leader ?:
  partnerLeading`) and the leading character takes the damage. Also fixed a PRE-EXISTING single-explore bug: a
  leading partner never actually lost Health (`baseLeadingHp` was assigned unchanged); it is now
  `max(baseLeadingHp - damage, 0)`.
- **AI**: `enumerateLegalActions` offers `exploreCount` 1 and all-in for every weapon combo (intermediate counts are
  human-only via the picker). **Client**: `explorePicker.exploreCountOptions`, partner flags on weapon options, an
  explore-count selector + Main/Partner leader toggle in `ActionBar`, and `PlayerPanel` shows the partner's own HP.
- **Known limitation**: the off-turn reactive windows (Jill's Flash Grenade vs a Las Plagas reveal, AC-018 Uroboros
  Injection, AC-042 Fight or Flight) are single-explore only; a multi-explore does not offer them.
- Tests: `game-core/src/engine/multiExplore.test.ts` (12) + 4 client tests. Gates: typecheck 0 (3 workspaces),
  game-core 706, server 96, client 135, vite build OK, soak green.

**M5-T03/T04 found and fixed 7 real defects** (all with regression tests):
1. reconnect replaced the `byClient` routing entry but left the old socket alive — a stale socket could act as the player and mark them disconnected on close.
2. Starting-deck instance ids collided across seats (all four players held `am-001#1..#7`), so `state.cards` could name only one of four physical cards.
3. Revive used a plain `draw`, so a downed character with a short inventory returned with <5 cards (rulebook: draw 5, reshuffle) and the redraw destroyed cards an effect had given a downed player.
4. A card listed by two piles (alliance `we-004`) registered the same instances twice — one card in two piles.
5. Prompts built from an empty zone had ZERO options, gating every action behind "resolve pending prompt first" → deadlock. New `engine/prompts.ts` `dropEmptyPrompts` choke point.
6. Outbreak reanimation dropped the Play Area, destroying every card played that turn.
7. The greedy bot skipped every turn forever on PR-002 Jill (held→owned revaluation + phantom turn pools) — games never ended.

**User pushed 3 UI commits mid-session** (8e812d9..72b00bc: radial health gauge on revealed mansion cards) — rebased cleanly on top of.

## OLLAMA MODELS PATH (do not skip)
Models live at `F:\ollama\models` (moved off C: when it hit 233G/233G). Start serve with:
`export OLLAMA_MODELS="F:\ollama\models" && ollama serve`
Symptom of wrong path: `curl :11434/api/tags` shows nothing. `curl :11434/api/ps` shows loaded models. A wedged `ollama serve` hangs coder calls forever — kill all ollama.exe/"ollama app.exe" via taskkill and restart clean.
Model inventory: gemma4:e4b (active coder), qwen2.5-coder:14b, qwen3.8:27b, qwen3.5:4b.

## Milestone status
- **M1 COMPLETE 16/16** (255/255 at close): types/rng/deck/resources/turn/market/mansion/explore/characters/cards/validate/actions/game/replay/data/rules-faq.
- **M2 COMPLETE 5/5** (307/307 at close) + **bot-logic v2** (commit `cea4754`, 323/323): character-aware ranking (granular WeaponTag + weaponTagBonus/ammunitionBonus/exploreGoldBonus/actionBonus/trashEffectBonus abilities; Ada + Rebecca encoded from `generic`), action-text value (held 0.5× / owned full), ammo-yield fallback buys, deck-bloat thinning; **ENGINE BUG FIXED** (`drawWithReshuffle`, games stalled after ~3 turns). Explores remain low (~12/game) — known 1-ply depth limit, next tuning frontier.
- **M3 COMPLETE 5/5** — `server/` workspace (own package.json/tsconfig/vitest.config.ts, deps ws+tsx):
  - **T01** `server/src/protocol.ts` (37 tests): ClientMessage/ServerMessage discriminated-union WS schema (create/join/reconnect/leave/seat/bots/start/action/chat/ping/spectate ↔ welcome/roomState/gameStarted/stateSync/actionRejected/player events/chat/gameOver/error/pong) + encode/decode/validate.
  - **T02** `server/src/rooms.ts` (14 tests): factory `createRoomStore(rand)` — 6-char invite codes (32-char alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), seats max 4, bot slots, host controls, `setConnected`. Hermes-written (coder exhausted its 3 attempts).
  - **T03** `server/src/host.ts` (17 tests): `createHost(room)`, `start(seed)`, authoritative engine wrapper + per-seat `sanitize(state, viewerSeat)` views (hidden ids `hidden-N`, lengths preserved); spectator `viewerSeat -1` = all-hidden.
  - **T04** `server/src/ws.ts` (11 tests): `createGameServer({port, heartbeatMs, tokenFn, seedFn, rand})` — welcome+clientId+reconnectToken on connect, create/join/reconnect/spectate sessions, rooms↔hosts wiring, **bot auto-step loop after human actions**, heartbeat prune (0 disables), disconnect → `connected:false` + rebroadcast.
  - **T05** `server/src/integration.test.ts` (1 test): scripted 2-client real-WS game — lobby→seats→bot→start→multi-turn with sanitized per-seat views→out-of-turn rejection→reconnect→spectator all-hidden. Server suite **80 tests** (37+14+17+11+1); monorepo 25 test files green.
- **M4 COMPLETE** — `client/` (Vite + React + TS): ws client w/ auto-reconnect, zustand store, CardView/Hand/Zones/Board/PlayerPanel/ActionBar/Lobby/GameLog, hotseat mode, animations, HealthRing, CharacterSkills. 126 client tests.
- **Expansion sets COMPLETE** — Nightmare / Alliance / Outbreak card data + engine behaviour for all 47 characters (see ABILITY_AUDIT.md; 16 effect kinds still have zero engine refs).
- **gainCard refactor COMPLETE** — `engine/gainCard.ts` is the single writer of gained instances; buy/token/ability/explore gains all route through it; AC-021 Gathering Forces implemented; `gainedCardsGoToHand` typed on PlayerState.
- **M5 COMPLETE (T01–T05)**: README + run scripts, production build + deploy smoke test, reconnect torture test, full-game bot soak + engine fixes, official FAQ verification checklist (FAQ-3 fixed per ruling). Release-ready.

## Harness facts baked into tools/
- orchestrate.py gate: coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER. coder.py: DEFAULT_MODEL = "gemma4:e4b", timeout 1800s, num_predict 16384, num_ctx 32768.
- **The coder model cannot write server modules** (rooms.ts/host.ts/ws.ts all Hermes-written; only the M3-T02 spec file was coder-launched): factory-pattern object literals with `readonly` + defaults break esbuild/TS parsing; tests hit type-error storms. Treat server tasks as Hermes-direct unless the task is data/pure-logic (M4 client work may be the same).
- Enrich stale feedback with the corrected algorithm spelled out in code (`.coder-cache/feedback-MXX-TXX.txt`) — proven pattern.
- Small models drop `===END===` sometimes -> coder.py splits on `===FILE:` only (fine).
- Never `git add -A` while probe_*.ts files exist in the repo (they have before — `git reset -q HEAD^` + `git rm --cached` + re-commit).
- Git identity is repo-local (Orchestrator <dev@local>) — commit failure exit 128 means it was lost; re-set with `git config user.name "Orchestrator"` / `user.email "dev@local"`.
- **Background `npm start -w server` orphan trap:** killing the npm background process (process_manage kill) kills the npm/cmd wrapper but ORPHANS the actual node child, which keeps holding port 1724 → next `npm start` dies with EADDRINUSE. Cleanup: `netstat -ano | grep 1724` → `powershell Stop-Process -Id <pid> -Force`. `.gitignore` node_modules; never `git add -A` with stray smoke/probe files.

## Test-helper lesson (integration tests)
`nextWithTimeout` racing `next()` leaves a stale waiter that EATS the next real message — any timeout-based ws test helper needs a cancellable waiter that unregisters on cancel (see `nextCancel` in server/src/testHelpers.ts, shared by integration.test.ts and reconnect.test.ts). Also: waitFor predicates over queued broadcasts must include the discriminator you actually care about (e.g. `activeSeat === 0 && turnNumber >= 2`, else stale turn-1 views match).

## Soak lessons (M5-T04)
- The soak's conservation invariant is `zones ∪ removed ∪ characterInstances == keys(state.cards)`; CHARACTER instances are registered by setup but intentionally live outside every zone, so they must be accounted for separately (filter by `cardDefs[cardId].type === 'character'`, NOT by an id prefix — promo `pr-002#1` is a character).
- Instance-id collisions are invisible to gameplay (nothing reads `cards[id].location` yet) but poison every conservation audit. When a soak goes red on conservation, check for a shared id across seats/piles before touching the engine logic.
- Audit EVERY zone transition for scoring arbitrage (see the local-llm-coder skill's `ai-evaluator-tuning.md`): hand cards score at held value, discard/inventory at owned value, so any effect that SHIPS cards manufactures points. `clampDiscardToHeld` is the remedy, and it must be applied to any simulation whose action ends the turn (endTurn AND a skip option) — otherwise the bot loops on the free transition forever.
- A stall seed is not automatically a regression: bisect by reverting ONE change and re-measuring (the RNG stream shifts with any reshuffle change, so pinned seeds move). `git stash` + re-run the probe is the fastest attribution.

## Mercenaries Skill System (2026-11-06, commit edb87fd)

**Done:** the Skill System add-on is implemented, tested, committed and pushed.
- `game-core/src/engine/skill.ts` — queries (activation/XP), the opening draft
  state machine (`draftPrompt` / `advanceDraft` / `finishDraft`), `moveXp`,
  turn-start effects, and the manual ("can") skills (`applyUseSkill`).
- `game-core/src/data/mercenaries.ts` — SK-001..SK-030 (verbatim text from the
  official card scans; ids lowercase `sk-NNN`).
- `docs/rules/mercenaries/RE5_Rulebook.pdf` + `.txt` — the official manual.
  Spec + rulings: `docs/rules/MERCENARIES-ENGINE-SPEC.md`.
- Server: `skillSystem` flag (createRoom/setSkillSystem), draft-hand
  sanitization in `engine/view.ts`.
- Client: lobby toggle, draft prompts (ActionBar), `ui/SkillPanel.tsx`.
- Tests: `game-core/src/engine/skill.test.ts` (6). Gates: 539 / 96 / 128 green.

**Rulings (Manny):** XP movement is a free action, any amount, during your turn
while not Exploring; faithful pass-left draft (deal 5, pick 1/pass left x5, keep
3 of 5); the toggle applies to any scenario.

**Pending:**
1. **Mercenaries card EFFECTS — DONE** (commit `974540a`). All 52 data-only
   cards (8 characters, 8 weapons, 10 actions, 26 infected) are now encoded +
   implemented. `engine/mercenaries.ts` holds the effect entry points
   (reveal / defeat / not-defeated / on-defeat abilities) and `engine/ammo.ts`
   centralises the Ammo Requirement math. New tests:
   `engine/mercenaries.test.ts` (49, one per card). Known limitation: the
   Mercenary Mode team/combo/timer rules are out of scope, so MA-077's
   "worth 0 Decorations while in a Combo Pile by itself" is applied to the
   base engine's attached-Infected list via `decorationDelta` (a lone MA-077
   adds 0; attaching another Infected restores its 3).
1b. **Nightmare expansion — DONE** (this session). All 50 cards (10 characters
   CH-034..043, 11 weapons WE-032..042, 16 infected MA-054..069, 2 items
   MA-070/071, 1 event MA-072, 10 actions AC-032..041) are encoded with
   machine-readable effects and implemented. Sources: `docs/rules/nightmare/
   RE4_Rulebook.pdf` (official manual) + wiki card scans + the Master Card
   List xls. New `engine/nightmare.ts` (reveal / defeat / not-defeated /
   weapon-gain / weapon-prompt / Mind-Control copy entry points), a
   `nightmare` scenario (23 piles, Nightmare mansion, win = MA-054 Osmund
   Saddler), and `engine/nightmare.test.ts` (55 tests). Engine fixes found by
   the new tests/soak: `resolveExplore` was missing the params the Nightmare
   reveal effects read (`characterAbilities`, `actionsInPlayArea`,
   `inventoryCount`, `characterDamage`, `ammoCardsInPlayArea`,
   `infectedBattledThisTurn`); the explore branches overwrote the exploring
   seat's post-reveal HP/max-HP (MA-061/MA-068); `grantedExplores` was only
   applied on the non-infected branch (WE-040 Flashbang); MA-057 Jack Krauser
   gained the pile's top card WITHOUT popping it (duplicate instance); the
   P.R.L. 412 tied-defeat attached one Infected to every tied player
   (duplicate) — now broken by most Health then lowest seat; the MA-080
   resolver moved cards that a down had already swept into the Inventory
   (duplicate); the Luis/Wesker/Sergei turn-start prompts had no resolvers
   (silently dropped); Josh Stone's heal gold only fired on the turn-start
   herb heal, not on playing a herb.
2. **Skill System — remaining known limitations** (gaps 2-4 closed):
   the reactive Skills (SK-008/010/012) are armed *before* the triggering event
   rather than reacted to at the moment of it, and SK-010/012 cover the
   infection-increase / turn-penalty / AoE effects applied in `actions.ts` —
   combat-modifying infected effects resolved inside the pure `resolveExplore()`
   (`onRevealWeaponDamagePenalty`, `onRevealHealthPenaltyIfMultipleWeapons`,
   `cannotBeDefeatedIf*`) are not yet interceptable. All 30 Skill kinds now
   have an engine consumer.
3. Hotseat (pass-and-play) does not yet expose the Skill System toggle.
4. `sim.ts` / the soak do not drive the draft (skillSystem is off there).
5. **Outbreak Infected Characters done** (CH-031/032/033, verbatim text + abilities).
   The Nightmare set is now DONE (see 1b). Still open from the audit: the
   unreachable Alliance infected (`ma-025/030/036` — no Alliance mansion exists),
   and the reachable unconsumed effects `we-028 Stun Rod`
   (`moveLowHpInfectedToMansionTop`), `in-002 Virulent Frenzy`, `in-004 Slough Armor`.

## Duplicate card-id resolution (2026-11-07)

**Done:** every card id in the database is now unique — `ALL_CARDS` is 304 cards,
0 duplicates (was 345 records / 41 duplicate ids).

- `data/alliance.ts` carried 41 transcriptions that are not Alliance cards:
  the Premier-only weapons (we-001..we-016 minus the Alliance's own re-prints
  we-004/005/009/010), the Outbreak/Nightmare/Mercenaries weapons
  (we-027..we-048), and it-005/006/007/009/050. All removed. The file now holds
  only canonical Alliance cards (CH-011..020, WE-017..025, AC-013..022,
  MA-022..040, IT-004, AM-004); the shared basic-resource ids resolve to the
  Premier definitions.
- Verified against the wiki's Alliance box layout + the RE DBG Master Card List
  (Scribd 667052640): Alliance weapons = WE-004/005/009/010 (re-prints) +
  WE-017..025; items = IT-001 (re-print) + IT-004.
- **Outbreak MA-054..057 vs Nightmare MA-054..057 is a genuine official numbering
  collision** (the master list prints both). The Outbreak items/events (Kevlar
  Jacket, Antivirus, Laser Trap, Rock Trap) are now `ma-054o`..`ma-057o`; the
  Nightmare infected keep the bare numbers. Before this, last-wins meant the
  Outbreak mansion served Osmund Saddler / Bitores Mendez / Regenerator /
  Jack Krauser instead.
- The shadowing this removed had been silently dropping real effects: Alliance
  `we-015` Bolt-Action Rifle lost its "+30 damage" gate and `we-008` Rocket
  Launcher lost "trash after use" in every expansion scenario.

**Three real defects the rename exposed (all fixed, with tests):**
1. AC-026 Injection's `injectionTrash` prompt carried no `instanceId`, and the
   follow-up `injectionDiscard` prompt dropped it — the card was never trashed,
   `''` was pushed onto `removed`, and the infection card leaving the face-up
   pile vanished from every zone.
2. Attack / counter-damage HP was subtracted unclamped (`hp: target.hp - damage`),
   so HP went negative; all three sites now go through `applyHpLoss`.
3. The soak's conservation `zoneInstanceIds` ignored `seat.infectionCards`, and
   its infection-level bound was an arbitrary 0..3 (the pre-dedup HEAD already
   reached 7 on seed 16); both corrected to the rulebook max of 10.

**Still open (pre-existing, not caused by the dedup):** the downed/revive
mechanic is not wired into the damage path — `flipDown` is imported into
actions.ts but never called, so a character at 0 HP keeps taking turns.

## Downed / revive wiring (2026-11-07)

Closed the gap above. Rulebook: "If a Character's Health is reduced to 0 or
less ... Turn the Character face down and shuffle together all the cards in your
Hand and Discard Pile into your Inventory ... All cards currently attached to
your Character remain attached. When your turn comes around, turn your Character
face up. Reduce the maximum Health ... by 20, draw 5 new cards ... and skip this
turn. If your Character's Maximum Health is 0 or less at this point, your
Character is dead." Outbreak adds that a face-down Character is out of the game
(cannot be targeted, Infection Level cannot rise).

- `engine/actions.ts`: new `applyDownedHooks` choke point runs after EVERY action
  and downs any seat at `<= 0` Health (hand+discard shuffled into the Inventory,
  attached cards kept). The explore path still applies the down inline because
  AC-050 Resuscitate intercepts it; the hook skips already-downed seats.
- `engine/validate.ts`: a downed Character cannot start actions (only
  `endTurn` / `chooseOption`), cannot attack, and cannot be attacked.
- Out-of-game targeting: every "choose another player" prompt, the reactive
  trash windows, the end-of-turn "all characters" infection increase and the
  Wesker/Rebecca/force-explore ability targets now exclude downed seats, as do
  the bot's attack enumeration and `useCharacterAbility` validation.
- End-of-turn Infection increase skips downed Characters.
- New `engine/downed.test.ts` (8 tests): attack downs, attached cards stay,
  revive (-20 max HP / heal / draw 5 / turn skipped), permanent defeat at 20 max
  HP, cannot be attacked, no Infection rise, idempotent, out-of-game action ban.

## Rules-text-only cards implemented (2026-11-07)

Every card whose rules text had no engine encoding now behaves. New effect
kinds in `types.ts`, a new `engine/outbreak.ts`, and a Blowback Pistol discard
step in the client's explore picker.

- **WE-001 Grenade** — `trashAfterUse`; trashed after an explore (already) and
  now also after an Attack.
- **WE-018 / WE-018g Grenade Launcher** — `explosivesToDiscardInsteadOfTrash`:
  every Explosive used in that explore goes to the discard pile, not `removed`.
- **WE-019 Telescopic Sight Rifle** — `revealFromMansionBottom`: new
  `revealBottom()` in `engine/mansion.ts` (bottom pile first, else the deck's
  last card).
- **WE-021 Triple Barreled Shotgun** — `grantExplores: 2` +
  `plusDamagePerInfectedBattled: 10`.
- **WE-025 Blowback Pistol** — `discardPistolsForDamage`: the explore action
  takes `discardedPistols`; validated (must be Pistol-tagged weapons in hand,
  not one of the weapons being used) and worth +10 damage each. Client renders
  a discard-Pistols step in the explore picker.
- **WE-030 Hand Cannon** — `trashAmmoFromPlayAreaOnUse` (trashes one Ammunition
  from the play area) + `cannotAttach` on `CardDef` (the `attachToCharacter`
  effect refuses it).
- **MA-045 Wasp** — `onRevealFlatDamageToExploringCharacters`: 20 damage to the
  exploring character on reveal.
- **MA-047 Reinforced Zombie** — `reduceLevel2DecorationRequirement`: the
  Level-2 Decoration gate drops by 1 per copy attached, applied in the defeat
  path's level recomputation.
- **MA-048 Crimson Head** — `onRevealBonusIfZombieAttached`: +10 HP / +10 Damage
  when the exploring character has an attached Infected with "Zombie" in its
  name; folded into `resolveExplore`'s revealed card.
- **MA-049 Reinforced Licker** — `onRevealZeroAmmoWeaponsDealNoDamage`: 0-ammo
  weapons contribute no damage to that explore.
- **MA-054o Kevlar Jacket** — `attachAndPreventDamageByMovingToMansionBottom`:
  attaches on Take; `applyDamageWithKevlar` absorbs the next damage and moves it
  to the Mansion bottom (explore damage, attack damage, MA-045 and the traps).
  The engine auto-takes the beneficial option — the alternative (a prompt at
  every damage site) would need the damage held across the prompt, which the
  reducer does not support. The jacket leaves play either way, so it cannot
  absorb a second hit.
- **MA-055o Antivirus** — `antivirusReduceInfectionOrRemove`: resolved on reveal
  (never through Take) — optional -3 Infection at level 6+, then move to the
  Mansion bottom or remove. Cured Infection cards go to the bottom of the
  Infection Deck.
- **MA-056o Laser Trap / MA-057o Rock Trap** — 20 damage per distinct card type
  in the play area / 10 per Action card, then removed from the game.

Two pre-existing defects surfaced while soak-testing these and are fixed here:
- `startTurn`'s reanimation cleared `attached`, orphaning the character's
  cards. Per the rulebook ("Remove ... all non-Infected cards that were
  attached"), non-Infected attachments now go to `removed` and Infected ones
  stay attached to the reanimated Character.
- `playActionCard` left AC-013/014/020 in the Play Area **and** the partner's
  attachments, so the card was duplicated when the Play Area was discarded.
  The card now leaves the Play Area when it attaches.

New `engine/rulesText.test.ts` (19 tests) covers all 14 cards.

## Last dead effect kinds implemented (2026-11-07)

Every `InfectedEffect` / `WeaponEffect` kind is now read by the engine. The
remaining cards (MA-025/030/036, WE-028, IN-002/004) plus a re-check of the
three that were only ever prompt/id-handled (AC-049, AC-035, AC-038).

- **MA-025 Duvalia** — `onKillGainAmmoX10ToMostDecorated`: when its attack
  reduces the leading character to 0 Health (and no Resuscitate is pending),
  the most-decorated player (ties: most Health, then lowest seat) gains 5
  Ammo x10. Implemented in the explore not-defeated branch.
- **MA-030 Cephalo** — `mustExploreNextTurnOnDefeat`: on defeat, a
  `cephaloChoosePlayer` prompt; the chosen seat gets `mustExplore` (the same
  obligation Wesker L2 uses, so `startTurn` grants the extra Explore and
  `validateAction` blocks their `endTurn` until they explore).
- **MA-036 Reaper** — `trashHighestCostAttachedOnPartnerIfNotExactDefeat`:
  unless the Infected is defeated with damage exactly equal to its health
  (underkill **or** overkill both count as "not exact"), the highest-cost card
  attached to the exploring player's partner is trashed.
- **WE-028 Stun Rod** — `moveLowHpInfectedToMansionTop`: while battling two or
  more Infected (the Collapsing Floor Traps multi-explore), a
  `stunRodChooseInfected` prompt moves one with `<= hpThreshold` Health to the
  top of the Mansion.
- **IN-002 Virulent Frenzy** — `virulentFrenzy`: on use, the top three
  Inventory cards are looked at, non-Infection cards are trashed, and a chained
  `virulentFrenzyOrder` prompt lets the player put the Infection cards back on
  top in any order.
- **IN-004 Slough Armor** — `sloughArmor`: when the player's Infected Character
  is attacked, the armor is discarded from hand and the damage is reduced by
  its `amount`. The attack reducer is atomic, so the engine auto-takes the
  beneficial option (same documented limitation as the Kevlar Jacket).

New `engine/deadKinds.test.ts` (9 tests). The only kinds still unread by the
engine are unused union members in `types.ts`
(`plusDamagePerOtherKnifeUsedThisTurn`, `plusDamageWhenUsingMultipleWeapons`,
`gainAction`, `lookAtMansionTop`) — no card carries them.

## Resume checklist
1. Server healthy? `curl :11434/api/ps`; if empty list: `export OLLAMA_MODELS="F:\ollama\models" && ollama serve`.
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect a clean tree at the downed/revive wiring commit.
3. M5-T05 DONE (commit 0083419): FAQ checklist at `docs/rules/FAQ-VERIFICATION.md`. FAQ-3 (Gatling Gun Majini) was a gap — the engine boosted the player's damage instead of the Infected's attack; Manny ruled Infected's attack, and `resolveExplore`/`resolveMultiExplore` now add it to `boostedAttack`/`atk` (regression tests in `explore.test.ts`).
4. Verify the gate personally (tsc + vitest in the affected workspace) before reporting green.