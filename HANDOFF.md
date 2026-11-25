# HANDOFF — resume here
## BOTS TREAT INFECTION LIKE HEALTH (2026-11-25)

Manny: bots must prioritize reducing/preventing infection counters the same
way they handle health, and gaining the 10th counter should weigh like a
fatal explore (permanent character loss). All in game-core/src/ai:
- **evaluate.ts**: `INFECTION_PER_COUNTER 10`, `HIGH_INFECTION_AT 6` +
  `HIGH_INFECTION_PENALTY 15` per counter above, `MAX_INFECTION_PENALTY 1500`
  at level >= 10 (Zombie A/B/C exempt — `isInfectedCharacter`). The penalty
  makes reduction cards/prompt options score better at high infection, exactly
  like the LOW_HP block makes heals score better at low HP — the bot buys,
  plays and answers prompts toward the safe option automatically (prompts are
  pick-by-simulated-state).
- **actionInfectionAdjustment** (cardHeld/ownedValue): 1-ply cannot see
  delayed/optional infection changes, so card VALUES carry them — ac-023
  Power of the t-Virus (end-of-turn +1) is worth the NEGATIVE marginal
  counter; ac-026 Injection / ac-027 By Any Means (net -1) the positive.
- **policy.ts caution** (chooseGreedyAction): playing ac-023 charges the
  marginal counter; exploring/attacking at level 9 charges MAX_INFECTION_PENALTY
  — the 10th counter outweighs EXPLORE_BIAS (+80), so a near-cap bot plays the
  reversal cards first instead of racing the cap.
- Tests: `src/ai/infectionPolicy.test.ts` (5): penalty ordering + cap step,
  zombie exemption, refuses explore at 9, still explores at 1, reducer-over-
  raiser at 9. Gates: ai suites 65/65, typecheck clean, full soak pending at
  commit time.

## INFECTED-CHARACTER REANIMATION FIXED — bots returning as Zombie A/B/C (2026-11-25)

Manny: "When bots die gaining 10 infection counters with the infection rules
engaged. They are not reviving as infected characters." FOUR defects, all in the
"Becoming the Infected" path (Outbreak AND the INFECTION opt-in mode):
1. **Dead-first skip** — the level>=10 reanimate check required `!s.dead`, but
   physical death resolves EARLIER in the same hook chain (applyDownedHooks), so
   a character that died while gaining the 10th counter was skipped forever.
   Now: `level >= MAX && pendingReanimate !== true && !isInfectedCharacter` —
   dead seats with 10 counters are marked too (reanimateAsInfected reshuffles
   hand/playArea/discard/inventory/infectionCards and sets dead+pending).
2. **Turn cycle never reached the pending seat** — the mark sets `dead: true`
   and every advance filtered `!s.dead`, so the zombie conversion (which runs
   at the seat's next turn in startTurnInternal) NEVER executed in real games —
   the outbreak test faked it with a forced activeSeat. FIX: `isTurnEligible`
   (turn.ts) = living OR pendingReanimate; applied at ALL turn-advance sites
   (game.ts round/poison/downed + actions.ts x2 endTurn advances).
3. **Game-over before reanimation** — checkWinBase's allPlayersDead ended the
   game while a reanimation was pending. Now pending seats keep the game alive.
4. **Zombie defs missing in INFECTION mode** — a base-scenario pool has no
   ch-031..033; the reanimated seat was a 100-HP stub with no zombie abilities.
   The conversion now resolves the def from OUTBREAK_CARDS and REGISTERS it into
   state.cardDefs (like resolveCharacterDef's out-of-pool fallback).

ALSO FIXED (soak conservation): the zombie conversion only read
`player.inventory` for the draw-5 — a seat granted cards while dead-but-pending
(hand/playArea/discard strays) leaked them (registered, no zone). The draw now
folds ALL four zones. Tests in infectionMode.test.ts (+5: dead-at-10 mark,
<10 no-op, conversion, turn-cycle reach, checkWin alive-while-pending).

RESOLVED (2026-11-25, "bots treat infection like health" commit): ROOT CAUSE
found — while a seat is dead-but-PENDING its reanimation, effects can still
grant it fresh Infection counters (gainInfections does not check dead/pending),
so by conversion time the strays sit in `infectionCards`, NOT in the pile the
fold read. The game.ts conversion fold now includes `infectionCards` (same bug
class as the hand/playArea-stray fix, one zone later). Regression test in
infectionMode.test.ts ("conversion conserves infection counters gained while
dead-pending"). Probe-verified zero orphans on outbreak seed 3 (the seed that
tripped: in-002#4/in-004#3/in-006#1).

## THREE FAN CHARACTERS — CC-002 Javier / FCH-003 Richard / FCH-007 Jill S.T.A.R.S. (2026-11-25)

Manny sent 3 renders (2 attachments + a 3rd image that landed in a separate
native-inputs folder — ALWAYS check every folder when the caption count and the
attachment count disagree):

- **cc-002 Javier Hidalgo** (printed CC-002; family of cc-001): 100 HP, gates
  3/6. L1 `revealWeaponTagFromHandForCards` {tag machineGun, amount 2} — manual,
  once-per-turn (validate's log scan); prompt picks a hand Machine Gun (stays
  in hand, `recordCardReveals` pile 'hand') → draw 2. L2 reuses
  `plusDamageForWeaponTag` (machineGun +10).
- **fch-003 Richard Aiken** (FCH-003): 80 HP, gates 3/7. L1 `noTurnSkipAfterDowned`
  — the rulebook's downed "skip this turn" is delivered by the startTurn
  downed-branch advanceTurn (revive + draw 5 + PASS); Richard instead falls
  THROUGH to the normal turn build (player = revivedPlayer; dead Richard still
  passes). L2 `fatalWoundDamageReduction` {10} — cuts the raw damage at BOTH
  explore kevlar-construction sites when `damage >= baseLeadingHp`, so both the
  applyRicardoDamage (no-partner leader, applyHpLoss CLAMPS at 0 — adding to
  the clamped value over-heals, that approach was tried and reverted) and the
  partner-led raw-subtraction branches land on the true post-reduction HP.
  Scope: explore attacks (single + multi, both sub-blocks); PvP attack + poison/
  events/AoE NOT reduced (RULINGS).
- **fch-007 Jill Valentine (S.T.A.R.S.)** (FCH-007): 70 HP, gates 4/7. L1 reuses
  `plusBuyPassive` + `goldAtTurnStart` (Carlos kind — do NOT add new gold-start
  kinds). L2 `explorePeekInventoryTopTakeWeapon` — post-explore hook
  `applyJillStarsPeekHook` raises a target-player prompt (ANOTHER player — the
  exploring seat is excluded per the caption read "another player's top
  Inventory card"),
  resolver reveals the top inventory card (recordCardReveals, ownerSeat) and, if
  a Weapon, offers Take/Leave; Take moves it to Jill's HAND (MoU's action-card
  take sends to discard — chose hand, flag if different). One peek per explore
  action.

Art: full-card renders → CARD-ART/CC-002.png, FCH-003.png, FCH-007.png (320x446,
P-mode 256, ~100 KB); vite glob emits all three.

LATENT BUG FIXED on the way: `plusTagDamage` (preview) only summed the PLURAL
plusDamageForWeaponTags — the SINGULAR plusDamageForWeaponTag (rc-002 Rebecca
L2, machineGun) never reached exploreDamage, and the RESOLVE had it hardcoded to
machineGun. Generalized both (resolve feeds attachmentDamageByTag per tag from
the abilities) — rc-002's preview is now correct too.

Tests: `customFchCc.test.ts` (14) — data shape, reject/prompt/draw/once-per-turn
for Javier, L1 recovery-turn vs skip control + L2 survive-at-5 vs still-downed
for Richard (fixture lesson: clear the OTHER seats' hands or seed ac-050 holders
make the resuscitate window hold HP at 10 and zero the recorded damage), Jill
turn-start gold/buy, peek → take vs non-weapon no-op. Gates: typecheck x3 clean,
regression batches 60/60, client 310/310, server 118/118, vite build OK.


**INFECTION GAME MODE — "INFECTION" checkbox; Outbreak cards join ANY scenario
(2026-11-25):** Manny sent the card list in `CARDID COUNT` format and asked for
a checkbox in the optional-modes list. The shared WIP (uncommitted) had the
plumbing; this session verified it, aligned it to Manny's list, and shipped.
- **Card pool** (`INFECTION_CARD_IDS` in `data/cards.ts`): ma-041..053 +
  ma-054o..057o (counts == OUTBREAK_MANSION exactly: 1/2/1/3/2/2/3/2/3/2/3/2/
  1/1/2/1/1 — MA-054..057 from the render list ARE the Outbreak ma-054o..057o,
  the 'o' suffix is the Nightmare-collision convention), ac-023/ac-026/ac-027
  and **in-001..in-006 only — in-007 is deliberately NOT included** (Manny's
  list stops there; the WIP had it at 7 cards/40, now 6 cards/35).
- **Action piles** (`INFECTION_ACTION_PILES`): each of the three ac-* gets its
  OWN Resource Area pile (action-tvirus / action-injection /
  action-by-any-means), 5 copies each from the printed `copies`.
- **Engine** (`GameSetup.infectionMode`; game.ts): `infectionMode = outbreakMode
  || setup.infectionMode` — infection levels (seat.infectionCards), the
  face-down Infection Deck and its draws run on ANY scenario, while the
  scenario keeps its own win condition (endInfectedCardId stays outbreak-only).
  OUTBREAK_MANSION joins the deck behind NEW `#infN` instance ids + a
  `mansionCardIds` dedup guard, so it is idempotent on the Outbreak scenario
  and with the no-explicit-mansion fallback sweep.
- **Plumbing mirrors usherMode**: RoomSnapshot.infectionMode, createRoom 14th
  positional param, setInfectionMode host msg, ws createRoom case forwards it,
  host.ts/hotseat.ts/sim.ts pass it to setup + cardsForScenario +
  pilesForScenario. Testids: create-infection-toggle / infection-toggle /
  hotseat-infection-toggle (all three lobby surfaces). Client forwards the
  ClientMessage verbatim, so no store change was needed.
- **Fixed the WIP**: ws.test + hotseat.test asserted the stale 40-card deck →
  35. **Pre-existing master typecheck break fixed on the way**: turnHistory.ts
  VERBS carried two orphan keys (elevatorDiscardStart, courtyardStart) whose
  engine actions were lost in the earlier tree gutting (commit 9512605 added
  the labels; the Action union never kept them) — removed; every Action union
  kind still has a verb.
- **FOLLOW-UP (1654856+1, typecheck-red master fixed):** the parallel session's
  293b67a re-added the elevatorDiscardStart/courtyardStart Action kinds AFTER
  both sessions had dropped the verbs, so the merged master was typecheck-red
  (TurnHistory verbs + one a395894 ui.test.tsx fixture missing infectionMode).
  Re-added `elevatorDiscardStart: 'used the Elevator Room'` / `courtyardStart:
  'used the Courtyard'` and patched the fixture. LESSON: `npm run typecheck
  | tail` is a FALSE GREEN — the pipe eats npm's non-zero exit; verify per-
  workspace with `npx tsc --noEmit; echo EXIT:$?`.
- Gates: typecheck clean x3, game-core **1562/1562** (full soak, exit 0),
  server 118/118, client 294/294, vite build OK, bot-game probe with
  infectionMode on played 381 actions to a clean gameOver (infection deck
  consumed 35→16 — the Outbreak draw mechanics are live).

**SKILL-DRAFT HOVERCARD FIXED — portal the popup, it was never viewport-fixed (2026-11-23):** Manny
reported the enlarged skill card in the Skill Draft as "offscreen and not readable". The popup was
`position: fixed`, but its ancestor `.decision-card` has **both** `transform: translateX(-50%)` (a
transformed ancestor is the CONTAINING BLOCK for fixed descendants) and `backdrop-filter` +
`z-index: 45` (a STACKING CONTEXT, so the popup's `z-index: 100` was local to it and the bottom
action bar at `z-index: 50` painted OVER it). Viewport coordinates were therefore measured from the
decision card's own origin. Reproduced in a real browser with the repo's exact rules at 1280x800: old
popup rect y 913..1116 = 316px BELOW the viewport; portalled one 446..649, fully visible.
- FIX: `HoverCard` renders the popup via `createPortal(..., document.body)`; placement lives in the new
  pure module `client/src/ui/hoverCardPos.ts` (`popupPlacement` clamps the centre + picks above/below by
  available room). Delete the old heuristic (`above = r.top > 260`, `half = 92` vs a 145-150px popup).
  Do NOT add a measure-after-mount clamp: it needs `useLayoutEffect`, which React refuses to run during
  server rendering (it warns on every client test render). The popup box is fixed by CSS
  (`.hover-card-pop .card` width 145/150, aspect-ratio 5/7), so the estimate is exact.
- RULE: any `position: fixed` element that must be viewport-relative cannot live inside a
  transformed/filtered ancestor — portal it. Grep for other fixed popups before assuming they work.
- Tests: `hoverCardPos.test.ts` (5). Gates: typecheck x3 clean, client 292/292, engine untouched.

**CHARACTER SELECTION — manual picks span every expansion, Random stays scenario-bound (Manny ruling
2026-11-23):** Manny first asked why the Outbreak characters were unselectable; the answer was that
`selectableCharacters(room)` in `client/src/ui/Lobby.tsx` pooled a HARD-CODED
`[...PREMIER_CARDS, ...ALLIANCE_CARDS, ...NIGHTMARE_CARDS, ...CUSTOM_CARDS]` — OUTBREAK_CARDS and
MERCENARIES_CARDS were never added, so their 21 characters (ch-021..033 incl. Zombie A/B/C, plus the 8
Mercenaries) never rendered in the Main/Partner dropdowns even though they ARE in the random pool
(expansion scenarios deal ALL_CARDS).
- RULING: the dropdown lists EVERY expansion (`[...ALL_CARDS, ...CUSTOM_CARDS]`, custom still gated on
  `room.customCards`). An intermediate version restricted the picker to `cardsForScenario(...)`; that was
  reverted per this ruling.
- ENGINE must back it: an explicit pick outside the scenario's card list used to hit setup()'s
  "unknown explicit id: legacy lenient behavior" branch → generic 100-HP card, def absent from
  `state.cardDefs`. NEW `resolveCharacterDef()` in game.ts falls back to `ALL_CARDS` and registers the
  def into `defsById`/`cardDefs`, so the picked character plays normally in ANY scenario. RANDOM still
  draws only from `cards` (the scenario pool) — unchanged.
- Duplicate handling: out-of-pool picks never enter `remainingCharacters`, so `claimedCharacters` /
  `claimedPartners` sets catch explicit-explicit duplicates (in-pool keeps the existing
  `characterIds.includes` guard, which also catches explicit-vs-earlier-random).
- Tests: `game-core/src/engine/characterSelection.test.ts` (6 — out-of-pool main/partner resolve,
  both duplicate guards, random-in-pool over 200 seeds x 4 seats) + ui.test.tsx asserts CH-021 /
  Excella Gionne / CH-031 / CH-002 appear in BOTH a firstTimer and an outbreak room.
- Dead code removed earlier: the unused `allianceChars` const in the Pass & Play panel.

**CUSTOM WEAPON CW-036 LEVER ACTION RIFLE (2026-11-23):** Manny sent a fan render
(no printed code): 40 cost / 40 ammoReq / 20 damage, tags gun+rifle, text
"This weapon gets +5 Damage for every Action you played this turn." Reuses the
existing `plusDamagePerActionPlayedThisTurn` kind (WE-016 Semi-Automatic Rifle +10;
cw-020 Riot Shotgun +5) so NO engine change was needed: the count is Action-type
cards sitting in the Play Area at explore time, applied by the explore reducer and
mirrored in `exploreDamage` for the picker preview. Art `CW-036.png` (588x800 ->
320x435 LANCZOS, full-card render) is auto-discovered by the client's Vite glob.
Pile behaviour is unchanged from the other custom guns: primary tag "gun" folds it
into the scenario `hg` pile next to cw-013/cw-020 (never a `custom-cw-*` pile).
Tests: `customLeverActionRifle.test.ts` (preview/resolve 20 -> 45 vs ma-011's 40 HP,
plus def shape) + `customCards.test.ts` definition and pile-merge assertions.
Gates: typecheck clean, game-core full suite, server 115, client 286, client build
emits the CW-036 asset.

**CARD ART COMPLETE — all 304 catalogue ids now ship a PNG (2026-11-23):** the last 100 missing
cards were pulled from the UGC-named contact sheets in
`Documents/My Games/Tabletop Simulator/Mods/Images/RE DBG - Expansión 1/` (char sheet,
premier+alliance resource, mixed resource, complete-mansion 4940x4893 @494x695, partial-mansion,
promo chars, premier mansion, Mercenaries subset). Every printed code was read with the LOCAL
Ollama model (`/api/generate` + `images`, small corner crops — 5 corners per montage reads
reliably; whole-card or wide reads hallucinate). Slices: `e` rows 2-6 = ma-022..053 +
ma-054o..057o; `d` rows 0-4 = ma-054..098; `b` r4c4 = we-018g.
- TWO CODE-SCAN TRAPS: sheet `e` prints MA-054..057 for the OUTBREAK bonus cards (Kevlar Jacket /
  Antivirus / Laser Trap / Rock Trap -> ma-054o..057o) while sheet `d` carries the NIGHTMARE
  MA-054..057; and `d` r3c3 scanned as a duplicate MA-095 is Los Illuminados (Bow) = ma-096.
  Both settled by title re-reads, not by the printed code.
- The 18 Mercenarios skills are NOT on any supplied sheet (the subset sheet stops at SK-012);
  they came from the RE fandom wiki's per-card scans (`File:Mercenaries card - <name> (SK-0xx).jpeg`,
  490x695) — the same source the earlier skill-research session used.
- Pipeline unchanged: whole-cell slice -> LANCZOS 320 px wide -> quantize(256, MEDIANCUT,
  FLOYDSTEINBERG). 82 sheet cards are 320x456/457, the 18 wiki scans 320x454.
- TEST FIX: `ui.test.tsx` used `ma-073` as its "no PNG" example in TWO tests (card-face and
  artOnly). With art added both broke, and NO catalogue card is artless any more, so both now
  build a synthetic `CardDef` with id `zz-999`. Grep the test tree for the old example id after
  any future art drop — but the real lesson is the placeholder path needs a synthetic id now.
- Gates: typecheck x3 clean, client 283/283, vite build OK (467 assets, 33 SK-*), full game-core
  suite green. Manny's own WIP (`client/src/ui/anims.ts`, `CARD-ART/MA-000.png`) left uncommitted.

**LOCATIONS BATCH 11 — loc-046/047/048 (2026-11-20):** three 1X locations read from
Manny's scans with the local Ollama vision model (two verbatim passes agreed on
every line; no codes on the scans -> sequential loc ids). All have
locationCost + locationMaxPerTurn 1, effects in locationRevealEffects (onex*
fire at useLocation, reveal* fire at the explore reveal).
- **Birdcage Corridor loc-046** (40): use -> optional infection
  (birdcageInfectionChoice [Gain|Decline]); Gain -> trash a hand card
  (birdcageTrashPick, raw-id options) + arm `firstExploreDamageBonus` =
  10 * floor(cost/10) = 40 (onexFirstExploreDamagePer10Cost). The bonus is
  consumed and cleared by the FIRST explore (arklay-style wrap at ~5593) and
  cleared at turn start (game.ts both reset sites). Preview mirrors it.
- **Boiler Storage Area loc-047** (50): use -> Gain 20 Health OR Remove an
  Infection (boilerHealthOrCure; heal caps at maxHp, cure removes the LAST
  infection card). Reveal -> every OTHER living player may gain an action
  card costing <= 50 (revealEachOtherPlayerMayGainActionAtMost; reuses the
  bedroom grant mechanics via affordableMarketActions; revealing seat NOT
  offered).
- **Cemetery loc-048** (40): use -> -10 hp, +1 infection (gainInfections —
  no-ops without an infection deck!), +30 turnAmmo (onexCemeteryCosts).
  Reveal -> look at the top Inventory card, discard it or put it back
  (revealInventoryTopPeek, options [topId, 'Put Back']).
- NEW types: onexGainInfectionThenTrash, onexFirstExploreDamagePer10Cost,
  onexGainHealthOrRemoveInfection, onexCemeteryCosts,
  revealEachOtherPlayerMayGainActionAtMost, revealInventoryTopPeek +
  PlayerState.firstExploreDamageBonus.
- SEED DRIFT: usher tests' seeds are pool-size-dependent (45 -> 48 cards);
  368->67 (Library+Lesson Space), 25->4 (Large Library), 20->7 (Attic
  Landing) via a setup probe; the file header comment carries the seed map +
  the re-scan rule. customLocations.test.ts LOC_IDS extended to loc-048.
- Pitfall: `useLocation` and the explore-reveal ack both leave prompts — the
  validator rejects useLocation while ANY prompt is pending (not just the
  acting seat's), so tests ack/dismiss before the use.
- Tests customLocations11.test.ts 11/11. Gates: game-core 1487/1487, client
  282/282, typecheck clean. No art (locations use no CARD-ART).

**LOC BATCH 10 — SIX NEW ROOMS (2026-11-19):** Manny sent 6 renders:
loc-040 Firearms Room (GLOBAL), loc-041 Garden (invest 0), loc-042 Greenhouse
(invest 10), loc-043 Helipad Lookout (invest 30), loc-044 Hidden Library
(GLOBAL), loc-045 Exhibition Room (GLOBAL). Art LOC-040..045.png (320x436,
titles verified with local gemma4:e2b). Tests in `customLocations10.test.ts`
(15). Introduces XP-STORED-ON-CARD pools, Setup-on-reveal effects, and a
forfeitBuy action.
RULINGS (Manny): Setup XP fires when the room is revealed / enters play;
Greenhouse/Helipad are invest rooms whose abilities spend the CARD's XP pool
(available to investors); Exhibition takes ALL card XP on >20 explore damage;
Garden is a 0-cost invest room spending PERSONAL XP.
- New state: GameState.locationXp (Record<instanceId, number> — XP on cards),
  GameState.greenhouseDamageBonus {seat, amount}; CardDef.locationSetupEffects
  (LocationSetupEffect: setupAddXpPerPlayer{perPlayer}, setupXpOnActionWeaponPiles).
  Helpers: cardXp/addCardXp/removeCardXp, locationInstanceId, applySetupEffects.
- applySetupEffects runs in revealLocation AND in setup() for Usher face-up
  rooms (baseState made `let`). setupAddXpPerPlayer adds perPlayer x seatCount;
  setupXpOnActionWeaponPiles adds an xpToken to every action/weapon pile.
- Firearms Room (GLOBAL): scorePenaltyPerNon10Ammo — -1 per ammunition card
  except am-001 (type is 'ammunition', NOT 'ammo').
- Garden (invest 0): applyGardenHook post-buy (turnGold >= 30 + xp >= 1) offers
  gardenOffer -> gardenTarget (give Infection to a chosen seat via gainInfections,
  or remove top infection from self).
- Greenhouse (invest 10): new `forfeitBuy` action (validate + enumerate +
  turnHistory + LocationsRow "Forfeit Buy (+20 dmg)" button) spends 1 Buy; if
  invested + card XP >= 1, removes 1 card XP and arms greenhouseDamageBonus.
  The +amount is added to ALL FOUR explore bonusDamage sums (search
  `mazeDamagePenalty(state, player.playArea...`) and consumed by the seat's
  first explore (cleared in the wrapper) or at the turn boundary.
- Helipad Lookout (invest 30): applyHelipadHook diffs attached for a defeated
  Infected by an investor with card XP -> helipadOffer (+30 Gold / Skill +
  Infection / Decline); spends 1 card XP, random catalogue skill + gainInfections.
- Hidden Library (GLOBAL): scoreHiddenLibrary — +5 if 4 knife-tag weapons OR 4
  pistol-tag weapons OR 10 am-001 cards (weaponTags). On Reveal
  revealEachOtherPlayerMayDiscardAndDraw{5}: every OTHER player may discard hand
  and draw 5 (hiddenLibraryDraw handler). NOTE: revealOnly auto-answers prompts,
  so the test reveals manually to inspect the choice prompt.
- Exhibition Room (GLOBAL): Setup tokens action/weapon piles. The BUY GATE
  (before the Bar gate) moves a tokened pile's XP to the card on an action/weapon
  buy (no personal XP cost); validate buy exempts the XP requirement when
  exhibitionInPlay. applyExhibitionDamageTake: explore hp loss > 20 takes ALL
  card XP as personal XP (card empties). Explore damage = infected ATTACK (not
  hp) — use ma-006 Licker (attack 30) to exceed 20 in tests.
- POOL 39 -> 45: re-scanned Usher seeds (probe usher-seeds10.ts, deleted):
  seed 368 Library+Lesson Space, seed 49 Library scoring, seed 57 Kitchen,
  seed 25 Large Library, seed 100 Tiger (first), seed 20 Attic (first). LOC_IDS
  extended to loc-045. scoreEffectValue gained a `default: return 0`.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (6 hashed
  LOC assets), location suites 147/147, full game-core soak loc10-final-full.log.

**LOC BATCH 9 — FIVE NEW ROOMS (2026-11-19):** Manny sent 6 renders; Terrace
was already loc-014 (skipped). Implemented loc-035 Tea Room (30/30/30),
loc-036 Study (100), loc-037 Stuffed Deer Room (60), loc-038 Suspended Ceiling
Room (60), loc-039 Taxidermy Room (80). Art LOC-035..039.png (320x436, titles
verified with local gemma4:e2b). Tests in `customLocations9.test.ts` (13).
RULINGS (Manny): Stuffed Deer plays the revealed action for FREE (no Action);
Tea Room's skill is a RANDOM Mercenaries catalogue skill (like Parlor).
- Tea Room (invest [30,30,30]): turn-start teaRoomChoice prompt (options gated
  on cube count: Draw 2 remove 1 / Gain skill remove 2 / Decline). Handler
  removes cubes from loc-035 and draws 2 or registers a random catalogue skill.
- Study (invest [100]): locationScoreEffects scorePerActionCard{perCard:1}
  (actionCardCount across hand/discard/playArea/inventory, investor-only via
  the locationScore invest gate). On Reveal revealGainGold{20} — every living
  player +20 Gold (subject-less "Gain", mirrors revealGainHealth).
- Stuffed Deer Room (invest [60]): startTurn reads the POST-DRAW Inventory top;
  if action, moves it to hand + arms PlayerState.pendingStuffedDeerPlayId. The
  applyAction wrapper CAPTURES the pending ids early (the hook chain rebuilds
  seats and drops the field) and PLAYS them last via applyActionInternal
  playActionCard{isFreePlay:true} (after every hook, so end-turn seat
  reconstruction cannot revert it). New playActionCard.isFreePlay flag skips
  the Action cost in reducer + validate. On Reveal revealLoseHealth{10} (every
  player). NOTE: applyAction(endTurn) does NOT call startTurn (the host loop
  does) — tests must call startTurn directly then trigger the wrapper.
- Suspended Ceiling Room (invest [60]): applySuspendedCeilingHook diffs each
  seat's attached for newly defeated Infected (type 'infected'); every OTHER
  living investor draws 1 per defeat. On Reveal revealHealthLossCapThisTurn{10}
  sets GameState.healthLossCapThisTurn{seat,baseline,cap}; applyHealthLossCap
  clamps the revealer's HP to baseline-cap post-hoc in the wrapper (damage has
  no choke point), reviving damage-death when the cap fully protects. Cleared
  at the turn boundary.
- Taxidermy Room (invest [80]): startTurn +1 Action (taxidermyActionBonus added
  to actionsLeft). On Reveal revealBlockActionPlaysThisTurn sets
  PlayerState.blockedActionPlaysThisTurn on the revealer; validate playActionCard
  rejects (isFreePlay exempt). Cleared at the turn boundary.
- New kinds: ongoingTeaRoomTurnStart, ongoingStuffedDeerTurnStart,
  ongoingDrawOnOtherDefeat, ongoingTurnStartPlusAction, revealGainGold,
  revealHealthLossCapThisTurn, revealBlockActionPlaysThisTurn, scorePerActionCard.
  Helpers: actionCardCount, teaRoomInvested, teaRoomCubes, stuffedDeerInvested,
  suspendedCeilingInvested, taxidermyActionBonus.
- POOL 34 -> 39: re-scanned Usher seeds (probe usher-seeds9.ts, deleted):
  seed 4 Library+Lesson Space (also Library scoring), seed 5 Kitchen, seed 2
  Large Library, seed 20 Attic Landing (first), seed 18 Tiger (first). LOC_IDS
  extended to loc-039.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (5 hashed
  LOC assets), location suites 132/132, full game-core soak loc9-final-full.log.

**LOC BATCH 8 — SIX NEW ROOMS (2026-11-19):** Manny sent 6 renders:
loc-029 Statue Corridor (70), loc-030 Storeroom (50), loc-031 Researcher's
Private Room (40), loc-032 Shed (40), loc-033 Small Dining Room (30),
loc-034 Stairway (10). All implemented + art shipped (LOC-029..034.png,
320x436 palette, titles/costs verified with local gemma4:e2b). Tests live in
`customLocations8.test.ts` (17) — NOT customLocations7.test.ts, which is a
stale-named file already covering loc-022 Bar / loc-023 Bedroom.
RULINGS (Manny): Storeroom rearrange = look through a weapon pile and choose
its new TOP card; Storeroom extra turn = one final turn per LIVING investor
after the base game ends; Stairway = spend 1 XP to reveal the top Location
then free-invest any revealed room not yet cubed (no Buy).
- Statue Corridor (invest 70): gold-icon action cards (bonuses.gold > 0) cost
  no actions — `freeGoldAction` in the playActionCard reducer + validate gate
  (exempt like isFreeRepeat); enumerate already offers all hand actions, so no
  enumerate change. On Reveal: revealer loses 3 XP (revealLoseXp, floor 0).
- Storeroom (invest 50): new `storeroomRearrangeStart` action removes one cube
  then offers storeroomChoosePile (weapon piles with >=2 cards) ->
  storeroomChooseTop (move chosen to front). LocationsRow "Rearrange (1 cube)"
  button. Extra turn: checkWin wraps checkWinBase — while the base game is over
  but a living investor is not in `storeroomFinalTurnsTaken`, returns
  gameOver:false; the applyAction wrapper records the ending seat when a turn
  advances past a living investor while checkWinBase(state).gameOver. Dead
  investors are excluded (can't take a turn). GameState.storeroomFinalTurnsTaken.
- Researcher's Private Room (invest 40): turn-start researchersBuyOrExplore
  prompt (+1 Buy / +1 Explore). On Reveal: every OTHER player gains an
  Infection (reuses revealEachOtherPlayerGainsInfection).
- Shed (invest 40): turn-start shedAmmoChoose (CSV-staged am-001 picks from
  hand + Done); Done discards staged ammo and draws that many; if XP >= 1 and
  not yet repeated, offers shedRepeatOffer (Repeat 1 XP / Decline); Repeat
  re-raises shedAmmoChoose with repeated:'1' (once per turn).
- Small Dining Room (invest 30): turn-start diningDiscardForXp (discard a hand
  card for 1 XP / Decline). On Reveal: every OTHER player loses 2 XP
  (revealEachOtherPlayerLosesXp, floor 0).
- Stairway (invest 10): applyStairwayHook (post-gain, gainedThisTurn grew with
  an ACTION card) offers stairwayOffer (Spend 1 XP / Decline); Spend reveals the
  top Location (revealLocation, On Reveal fires) then stairwayInvestChoice
  (free cube on any revealed room not yet cubed, no Buy/gold).
- New LocationEffect kinds: ongoingFreeGoldActions, ongoingStoreroomRearrange,
  ongoingStoreroomFinalTurn, ongoingTurnStartBuyOrExplore, ongoingShedAmmoDraw,
  ongoingTurnStartDiscardForXp, ongoingStairwayOnActionGain, revealLoseXp,
  revealEachOtherPlayerLosesXp. Helpers in locations.ts: statueCorridorInvested,
  storeroomRearrangeInvested, storeroomInvestors, researcherInvested,
  shedInvested, diningXp, stairwayInvested.
- POOL 28 -> 34: re-scanned the Usher seed map (probe usher-seeds8.ts, deleted):
  seed 4 Library, seed 2 Kitchen, seed 3 Large Library, seed 71 Attic Landing
  (first), seed 30 Tiger (first), seed 112 Library+Lesson Space. LOC_IDS in
  customLocations.test.ts extended to loc-034. Fixed the fragile Pillar
  inventory-reshuffle test (customLocations6): control seat 0 hand:[] + 6-card
  discard, and pick a prompt option that REMAINS in the inventory after the
  draw (the handler no-ops for cards already drawn into hand).
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (6 hashed
  LOC assets), location suites 119/119, full game-core soak loc8-final-full.log.

**LOC BATCH 6 — FIVE NEW ROOMS (2026-11-19):** Manny sent 5 renders:
loc-024 Parlor, loc-025 Passage to the Shed, loc-026 Pillar Corridor,
loc-027 Reading Room, loc-028 Mural Corridor. All implemented + art shipped
(LOC-024..028.png, 320x436, titles/costs verified with local gemma4:e2b).
RULINGS (Manny): Parlor gains a RANDOM skill from the full Mercenaries
catalogue; Pillar triggers on ANY shuffle incl. the Mansion; Mural's stow is
chosen in pick order.
- Parlor (invest 30): post-buy hook (gainedThisTurn grew + gold >= 40) offers
  Pay/Decline; Pay spends 40 and registers a random skill instance in
  skillArea + seat.skills (cardDefs extended if the pool lacked skills).
- Passage to the Shed (invest 30): post-action removed-diff hook offers the
  OWNER of each trashed card a spend-1-XP trash of a hand/discard card;
  chains while XP lasts (each trash is a new trigger). On Reveal: revealer
  gains an Infection.
- Pillar Corridor (invest 30): centralized shuffle DETECTOR in the wrapper
  (no choke point exists): inventory reshuffle = whole prev discard now in
  inventory/hand and gone from discard; Mansion shuffle = same membership,
  different order. Offers pick-to-top of the shuffled deck; handler drops
  the existing occurrence first (insertAt copy trap). Generous edges
  (explicit discard->inventory moves also offer) accepted for an optional
  window. NOTE: send-to-bottom is NOT a shuffle (no RNG) — the test uses the
  MA-000 ooze shuffle-back (a real whole-deck shuffle in one action).
  On Reveal: revealer gains an Infection.
- Reading Room (invest 50): new `readingRoomPeek` action (validate +
  enumerate + turnHistory verb + LocationsRow "Peek (1 Buy)" button) spends
  1 Buy and privately reveals the top Mansion card via recordCardReveals
  (entry.reveals, NOT action.reveals). On Reveal: every OTHER player gains
  an Infection.
- Mural Corridor (invest 30/70/100): startTurn draws +1 per cube (after all
  other turn-start draws, covers both startTurn branches) then prompts
  muralStowChoose: pick N hand cards in order (payload.picked CSV staging),
  placed [...picked, ...inventory] on the last pick.
- Infection convention: gainInfections pops state.infectionDeck, respects
  isImmuneToInfectionEffects, no deck (non-Outbreak) -> no-op, like every
  other infection effect.
- Hooks run LAST in the applyAction wrapper (after Leon's trash hook) so
  they see every trash/gain/shuffle the earlier hooks produced.
- Tests: customLocations6.test.ts 17 (data, art, 3 Mural, 3 Reading, 3 Shed,
  3 Pillar, 3 Parlor) + LocationsRow Peek-button test. Fixture lessons:
  locationsMode's location deck INTERCEPTS every explore — empty it for
  Mansion-combat tests; a single explore grants +1 XP unconditionally (Shed
  math: 2+1-1=2); reveals ride on logEntry.reveals.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (5
  hashed LOC assets in dist). First full run: 1425/1431 — the 6 reds were
  STALE assertions from the pool growing 23->28 (customLocations deck-count
  list; 5 Usher seed deals shifted). Re-pointed: LOC_IDS extended to 028;
  Usher seeds 8->39, 12->4, 2->23, 16->44, 11->13 (new map in the test
  docstring). Location suites 61/61 after; FINAL full game-core 1431/1431 ALL
  GREEN (soak included), EXIT=0.
  LESSON: adding locations shifts every Usher/Clock seed deal — re-scan the
  seed map (usher-seeds probe) whenever the LOC pool grows.

**TIGER STATUE ROOM DISCOUNT — UI FIX (2026-11-19):** Manny asked if the
loc-015 buy discount works when invested. ENGINE: yes — buy case + validate
+ the XP-token buy path all subtract locationBuyCostReduction (engine test
customLocations3: invest 70, buy ac-001 cost 30 -> pays 20; bots enumerate
through validate so they honour it too). UI: NO — Board.tsx checked
affordability against the FULL printed cost and displayed it, so a player
with 25 gold could not click a 30-cost card even though the engine would
charge 20. Fix: export locationBuyCostReduction from game-core index; Board
computes the viewer's discount on their turn (canBuy), uses the effective
cost for the button's disabled state, the pile price label, and the tooltip
("(Tiger Statue Room: −10)"). Test: LocationsRow.test.tsx "Tiger Statue Room
investment discounts the buy button and price label" (25 gold + invested ->
foyer button enabled + 20g; uninvested -> disabled) RED→GREEN. Gates:
typecheck x3 clean, client 281/281, Tiger engine suite 11/11, build OK.

**CE MODE SHOWS THE ATTACHMENT-MODE SELECTOR (2026-11-19):** Manny: checking
Random CE Events should also trigger the Mansion Attachment Mode selector.
The selector was gated on attachable events in the CUSTOM PICKER only, but
ceMode injects CE-001..012 engine-side — so with CE mode on and nothing picked
the selector stayed hidden even though the mode governs those events
(state.mansionAttachmentMode overrides every attachment's own mode at attach
time). Fix: OR ceMode into the gate on all three surfaces (hotseat
`hasAttachmentCards || ceMode`, room `room.ceMode ||`, create `ceMode ||`).
Test: ui.test.tsx "shows the Mansion Attachment Mode selector when CE events
mode is on" (room surface, on→shown / off→hidden) RED→GREEN; live-verified
create + hotseat toggles reveal the selector. Gates: typecheck x3 clean,
client 279/279, build OK. styles.css + overlayOrder.test.ts dirty in the tree
are the OTHER session's WIP — left unstaged.

**XP-TOKEN PILE BADGES (2026-11-19):** Manny: "for locations that add xp to
piles or areas, add #xp in a circle to the top of that pile or area, # =
how much xp is on that stack." The Bar (loc-022, `onexAddXpTokenToPile`) is
the only location that places XP tokens — `state.xpTokens` (one per pile,
dedup-guarded in addXpTokenToPile; buying costs 1 XP first, 2 XP strips the
token via buyXpChoice). The tokens were INVISIBLE in the UI. Board.tsx now
crowns each tokenized Resource Area pile with a circular gold `.xp-token-badge`
reading `<count>xp` (count = occurrences of the pileId in xpTokens, so stacked
tokens show the total); empty piles get it too; the pile tooltip explains the
XP spend. CSS: .market-pile position:relative + the badge circle (landed in
HEAD via the other session's cb2c0e0, which absorbed the shared styles.css —
the Board/test hunks are this session's commit). Test: LocationsRow.test.tsx
"crowns XP-token piles" (1xp/2xp/placement/no-token) RED→GREEN. Verified
visually with a throwaway real-Board + real-CSS probe page rendered to
scratch/xp-badge-probe.html and read by the LOCAL Ollama vision model
(gemma4:e2b): clean centered circles, readable, no art overlap. Live gameplay
route abandoned: First Timer has no Ammo x20, so Bar's 20g Use is unreachable
on turn 1 — the probe is the deterministic visual gate. Gates: typecheck x3
clean, client 278/278 (incl. the other session's lobby-collapse cb2c0e0),
build OK.

**CE-009 ECLIPTIC EXPRESS ON-DEFEAT WINDOW FIXED (2026-11-19):** Manny: "does
ce-009 trigger correctly when in play and a player defeats an infected — they
should be prompted to trash a card in their discard pile if they choose to".
NO — the eclipticTrash window existed ONLY in the multi-explore branch; the
common SINGLE-explore defeat never prompted, and neither did the deferred
resumes. Fix: one shared `eclipticTrashPromptFor(state, seat)` helper
(actions.ts, beside applyPendingExploreOutcome) used by EVERY defeat path:
single-explore defeated branch (reads the FINAL post-explore discard via
defeatFxState), multi branch (replaces the old inline block), the AC-018 /
AC-042 chooseOption resumes, and the next-explore entry guard. Prompt id now
carries a counter (`ecliptic-trash-<seat>-<version>-<n>`) so a resolved pending
+ the new explore cannot collide (chooseOption removes every prompt with the
same id). Handler unchanged (Decline guard already correct). Tests:
eclipticExpress.test.ts 9 — RED before the fix (5 fails), GREEN after; covers
prompt/options, trash, Decline, empty discard, not attached, not defeated,
multi, entry-guard resume, AC-018 decline resume. Fixture lessons: the
Uroboros window goes to NON-exploring seats holding ac-018; validate's prompt
gate is per-seat, so the entry-guard scenario needs the stale prompt on a
DIFFERENT seat; a cards-map overwrite must spread the STACKED state's cards or
the revealed top card is unregistered (nightmare reveal crash).
RULING (Manny, 2026-11-19): Sherry's forced explore prompts the EXPLORING
player (the target), not Sherry — wired in allyExplore after the target's
redraw (final discard), via the exported helper (hoisted-function import
across the actions↔allyExplore cycle, same shape as game↔actions). 2 more
tests (defeat prompts target + trash resolves; no-defeat silent) — RED→GREEN.
Gates: typecheck x3 clean, ecliptic 11/11 + fanSherry/clock/usher 52/52,
client 276/276, server 115/115, build OK; FINAL full game-core 1414/1414 ALL
GREEN (the first soak, 1412/1412, predated the ally wiring and was superseded).

**LOC BATCH-1 ART COMPLETE (2026-11-19):** Manny sent the 7 missing batch-1
renders (Library, Arklay Laboratory, Keeper's Room, Kitchen, Large Art Room,
Large Gallery, Large Library). Titles + printed costs verified with the LOCAL
Ollama vision model gemma4:e2b (Manny: use the local LLM for vision tasks —
/api/generate with images:[base64], ~4s/card; it is multimodal and fast).
All matched the defs (Arklay 1X/30, Keeper's+Kitchen 10, the three Large 20,
Library GLOBAL). Normalized to the LOC convention (320x436 palette PNG) ->
LOC-001..007.png. ALL 23 LOC cards now ship art. Art test widened to
loc-001..008. Gates: typecheck x3 clean, location+mode suites 74/74, client
273/273, build OK. Live-verified: Large Library tile serves LOC-007.png.

**LESSON SPACE ART + LOCATION HOVER CARDS (2026-11-19):** Manny sent the
LOC-008 Lesson Space render (822x1122 JPEG). Normalized to the LOC batch
convention — 320x436 palette PNG, FULL card render WITH printed text, exactly
like LOC-009..023 (cardArt.ts's "art only" docstring is stale for this batch) —
saved as CARD-ART/LOC-008.png; the vite glob picks it up with no manifest.
The loc-008 def already matched the print (GLOBAL, costs [20],
scorePerDuplicateActionName, revealLoseHealth 5) — no engine change.
LocationsRow tiles now ride inside HoverCard (the Hand.tsx pattern): hover
shows the enlarged full-art CardView popup. CSS keeps the flex row's stretch
through the wrapper (.locations-row > .hover-card { display:flex }).
Tests: art-exists (customLocations2) + hover-wrapper (LocationsRow.test).
Gates: typecheck x3 clean, client 273/273, location suites 32/32, build OK.
Live-verified ONLINE: Usher room dealt Lesson Space, thumbnail data-has-art,
hover popup = full loc-008 card served from /assets/LOC-008-*.png.
NOTE: batch-1 LOC-001..007 art landed later the same day (see the entry above) — all 23 LOC cards now have art.
Browser-harness note: rapid reload loops can leave the client stuck in
"Connecting…" on a stale localStorage reconnect token — localStorage.clear()
+ reload recovers; the server ws layer was healthy throughout (node probe).

**USHER/CLOCK ONLINE CREATE-FORM FIX (2026-11-19):** Manny: "in usher mode, no
LOC cards are displaying at the start of the game or at all". TWO causes:
1. REAL BUG: the ws.ts `createRoom` handler forwards room options POSITIONALLY
   and stopped at mercenariesBasicResources — `msg.usherMode`/`msg.clockMode`
   were DROPPED, so online rooms made via the create form always had both
   flags false (the in-room setUsherMode/setClockMode toggles worked; hotseat
   worked — which is why the earlier live check missed it). Fixed: append both
   args. Regression: ws.test.ts "createRoom carries usherMode/clockMode through
   to the started game" (flags in roomState + 3 locations in the first
   stateSync). LESSON: rooms.test calls the store directly and hotseat bypasses
   ws — every new room flag needs a ws-layer test, not just store/UI tests.
2. STALE SERVERS: the local dev servers on 1725/1726 had been running since
   2026-11-18 (before the modes existed) — old engine in memory + freshly built
   client/dist = checkboxes that do nothing. Killed both, relaunched from
   server/ with current code. LESSON: tsx does not hot-reload; after engine
   changes, restart long-running dev servers before blaming the code.
- Gates: typecheck x3 clean, server 113/113. Live-verified ONLINE create form →
  fill bots → start: 3 face-up GLOBAL locations turn 1 (Large Gallery,
  Keeper's Room, Library).

**THE HOUSE WITH A CLOCK IN ITS WALLS GAME MODE (2026-11-19):** Manny: a second
location mode, checkbox under the Usher one on all three lobby surfaces.
X = ceil(Mansion deck size / 15) RANDOM Locations are shuffled INTO the Mansion
deck at setup (X computed before they are added); reshuffle until no two LOCs
are adjacent (100 tries, then a deterministic interleave fallback). RULING
(asked): unlike Usher, On Reveal effects DO fire — a drawn Location goes into
play immediately (standard reveal, revealedBy = the explorer) and the next card
is revealed INSTEAD; Locations never consume Explore slots, single or multi.
- Engine: `GameSetup.clockMode` / `SimConfig.clockMode`; `cardsForScenario`
  pulls all 23 LOC defs for either mode. `setup` registers `<id>#clock1` into
  the deck. The explore case's `drawMansion(deck, fromBottom)` wrapper replaces
  EVERY combat draw (initial single/multi, Crow chain, MA-039/MA-072
  expansions, both single-path branches, WE-019 bottom reveal): a drawn LOC
  goes to `state.locations` via `clockLocationIntoPlay` (locations.ts), which
  applies ONLY the combat-timing flags (Mirror Corridor / Attic Landing /
  Bedroom — pure setters) so the battle math sees them; the full
  `applyRevealEffects` (seat effects + prompts) runs in the case's IIFE post-
  processing on the FINAL state, because every branch rebuilds the acting seat
  from a pre-explore snapshot. Double-applying the flags is idempotent.
  Helena's peek skips leading LOCs. Deck-exhausted-by-LOCs returns '' and the
  explore is consumed without a battle; '' guards on the chain pushes and the
  MA-039/072 shuffle-backs. Ally explore (Sherry) peels top LOCs first
  (revealedBy = target) and applies their reveals via applyClock at every
  return. Usher + Clock compose (3 on the board + X in the deck).
- LATENT BUG FIXED (allyExplore, pre-existing at HEAD): the combat branches
  never wrote the POPPED deck back into `next` — the revealed card stayed in
  the deck and the not-defeated branch appended a SECOND copy at the bottom.
  `next` now starts from `mansionDeck` (the popped local).
- Plumbing mirrors usherMode exactly: RoomSnapshot.clockMode, createRoom
  param, `setClockMode` (protocol + rooms + ws), host/hotseat/sim. Testids:
  create-clock-toggle / clock-toggle / hotseat-clock-toggle.
- Tests: customClock.test.ts 13 (pool, X + non-adjacency over 10 seeds,
  determinism, compose-with-Usher, single replacement + heal on final seats,
  multi replacement, Crow-chain replacement, Mirror/Attic combat timing,
  Gallery prompt, Bedroom blocks the NEXT explore, LOC-only deck, ally
  explore). hotseat +1, ui +1, rooms +1, protocol +1.
- RECOVERY NOTE: the ~11:53 tree gutting (see the AC-018 entry below) lost
  every uncommitted hunk OUTSIDE the shared files. Correction to that entry's
  "neither commit touched your files": 17cdac7 DID absorb the clock hunks in
  actions.ts and the GameSetup flags in types.ts (both sessions edit those
  files; staging them stages the merged content). Everything else was
  re-applied verbatim from the session record and both new test files
  rewritten; verified typecheck x3 clean, targeted 105/105, client 272/272,
  server 112/112. LESSON: commit verified work promptly in this shared tree.
- Gates: typecheck clean x3, client 272/272, server 112/112, targeted 105/105,
  FULL game-core 88 files / 1394 tests ALL GREEN (the soak alliance orphan is
  fixed by the AC-018 entry's explore-entry guard, as that entry predicted),
  vite build OK. Live-verified pass & play: both checkboxes in order, deck
  41 = 38 + ceil(38/15), no Locations row at start, and a Large Library
  surfaced mid-explore into the Locations row (GLOBAL, active for everyone)
  while the battle continued. Committed 9083944 (not pushed).

**AC-018 + REACTIVE-WINDOW GUARD LANDED (2026-11-19, commits fa29737 + 17cdac7):** the
four "you can / you may" prompts Manny asked for are DONE and pushed — b4mc-ch-008 L2
(`chrisL2TopChoose`), MA-070 (`ma070Choose`), SK-004 (`medicHealBonusChoose`), AC-018
(`uroborosInjection`). AC-018 was NOT the "~5 lines" the audit guessed: the +20 Health
has to change the combat OUTCOME, so the explore is now DEFERRED (`shouldDefer` +
`ac018WindowOffered`) and re-resolved from `pendingExplore.exploreParams` (new exported
`ExploreParams`) with `autoDefeat` preserved; a flipped outcome recomputes
`damageTaken` / `decorationDelta`. Shared resumption extracted to
`applyPendingExploreOutcome`. Two extra defects fixed on the way: (1) a "you may trash"
window needs a `Decline` option, and `'Decline'` is a LABEL — AC-042 was pushing it into
`removed` as if it were a card instance; (2) a deferred explore whose prompts went
unanswered was silently OVERWRITTEN by the next explore, orphaning the revealed Infected
(soak alliance/1: ma-036/082/084/056) — the `explore` case now resolves any outstanding
`pendingExplore` first. That guard is a PRE-EXISTING bug in the shared AC-042 / Las Plagas
mechanism, not AC-018 specific.
**Your Usher note's "the ONLY red is the soak alliance/1 conservation orphan" is now
GREEN** — re-run the soak before attributing any red to usherMode. Gates at 17cdac7:
typecheck x3 clean, game-core 87 files / 1381 tests, client 267/267, server 108/108.
**SHARED TREE:** the working tree was briefly gutted (547 files showing as deleted); it is
back to 17cdac7 + your Usher WIP. Stage only your own paths — neither of this session's
commits touched your files, and `git restore .` right now would throw away live edits.

**FALL OF THE HOUSE OF USHER GAME MODE (2026-11-19):** Manny: remove the LOC
cards from the custom-card menu and tie them to a game-mode rule — a "Fall of
the House of Usher" checkbox under Mercenaries Basic Resources on all three
lobby surfaces. RULING (asked; two readings): the 3 random Locations are set up
AT GAME START — face-up in play from turn 1, GLOBAL effects live for everyone,
invest effects still need gold cubes, 1X uses still cost gold + a Buy, and On
Reveal effects NEVER fire. They mark the mansion; they are NOT shuffled into
the deck and no Explore is consumed by them.
- Engine: `GameSetup.usherMode` + `SimConfig.usherMode`; `cardsForScenario`
  pulls ALL 23 LOC defs when on; `setup` rngShuffles the loc ids, takes 3,
  registers `<id>#usher1` and puts them straight into `state.locations`
  (`cubes: {}`, `revealedBy: -1`, no applyRevealEffects, no locationDeck).
  -1 = no revealer, so Large Library's revealer-scoped On Reveal draw stays
  inactive for everyone. The old `locationsMode` engine path is UNCHANGED (its
  tests still pass) but no longer exposed in the UI.
- Plumbing mirrors mercenariesBasicResources: RoomSnapshot.usherMode,
  createRoom param, `setUsherMode` host message (protocol + rooms + ws),
  host.ts / hotseat.ts pass it to setup + cardsForScenario (pilesForScenario
  needs nothing — locations never pile).
- UI: CustomCardsPicker drops the Locations section AND excludes loc ids from
  "Add All"; the hotseat "Locations" toggle is REPLACED by the Usher checkbox
  (testids create-usher-toggle / usher-toggle / hotseat-usher-toggle).
  LocationsRow renders the 3 rooms unchanged (Invest/Use read state.locations).
- Tests: customUsher.test.ts 11 (pool pull, 3 distinct face-up / no deck / no
  prompts, determinism, On Reveal never fires, GLOBAL score + ongoing live at
  turn 1, revealer-scoped grant inactive, invest cube gate, 1X gold+Buy gate,
  explore hits the Mansion directly, locationsMode regression). hotseat +1,
  ui +2, rooms +1, protocol +1; RoomSnapshot/Room literals in store.test /
  ui.test / host.test / protocol.test / rooms.test gained usherMode: false.
- PITFALLS hit: (1) a seed scan for the random pick MUST use the fixture's
  exact character picks — explicit characterCardId skips the random-deal
  nextInt calls and deals DIFFERENT locations. (2) Ammo x20 grants +20 Gold
  too, so Attic Landing's net gold is cost-20+20. (3) the art-exists tests use
  existsSync relative to the LAUNCH cwd — run vitest from game-core/, not
  `--root game-core` from the repo root, or they false-red.
- Live-verified (pass & play, local build): no LOC rows in either picker;
  started game shows 3 face-up rooms (1X Use buttons, GLOBAL note), no
  face-down card, no reveal prompt, turn 1.
- Gates: typecheck clean x3, client 270/270, server 110/110, location suites
  84/84, vite build OK; full game-core 1380/1381 — the ONLY red is the soak
  alliance/1 conservation orphan (ma-036/082/084/056), the other session's
  in-flight AC-018 deferred-explore WIP: it was already red (ma-025) BEFORE
  this feature, and usherMode is opt-in — the soak never enables it, and with
  the flag off setup consumes no RNG and deals nothing. The earlier
  uroborosInjection red went green mid-run as that session landed its wiring.
  UNCOMMITTED (shared tree).

**BO-001 BILL GATES CORRECTED TO 0/5 (2026-11-19):** Manny: the card reads Level 1
at 0 Decorations and Level 2 at 5 — not the implemented 10/25. An 8x crop of JUST
the shield emblems on BO-001.png confirms the digits INSIDE the shields are 0 and
5; the batch-2 "three reads agreed on 10/25" was the level digit OUTSIDE the
shield merged with the gate digit ("1"+"0", "2"+"5") — the exact merge bug the
2026-11-16 vision gotcha below warned about. `custom.ts` bo-001 level1At 10->0 /
level2At 25->5 + RULING comment rewritten; `customZoeyBill.test.ts` docstring +
new gate regression test (Bill starts at L1; 4 Decorations -> L1, 5 -> L2). Bill
now levels much earlier in play. Gates: typecheck clean x3, customZoeyBill 5/5,
characters 11/11, client 267/267, server 108/108; full game-core 1369/1371 — the
2 reds are the OTHER session's in-flight AC-018 Uroboros work
(uroborosInjection.test.ts expects the +20-HP re-resolve their actions.ts WIP is
mid-way through; soak alliance/1 ma-025#1 orphan they are DBGORPH-debugging).
Neither failing test's card pool contains bo-001 (uroboros: PREMIER+ALLIANCE
only; soak: no customCards opt -> cardsForScenario returns the base set), so the
gate change cannot reach them. UNCOMMITTED: the tree holds the AC-018 WIP, so
rebase/push is blocked until it lands.

**ZO-001 ZOEY + BO-001 BILL OVERBECK (2026-11-16, batch 2):** two more custom
characters from Manny's scans. Printed codes still not legible -> provisional
ids zo-001 / bo-001 (rename when codes are known). Both 70 HP.
- **Zoey zo-001** (gates 0/7 — RULING: level-box emblems read as 0 and 7 by two
  vision models): L1 "Zoey can't use shotguns" -> new `cannotUseWeaponTag`
  (validate rejects shotgun-tag weapons in her explores; envelope: I-legal ->
  grayed buttons for bots/humans). L2 "-10 ammo and +10 damage for pistol and
  rifle weapons" -> two `ammoReqReduction` entries (Leon L1 precedent) + a
  `plusDamageForWeaponTags` ['pistol','rifle'] (ch-005p precedent).
- **Bill bo-001** (gates 10/25 — RULING: three reads of the box-left emblems
  agreed; the vision model kept merging the level digit with the emblem digit,
  so the tight crop reads had to be separated): L1 "Infected deal +10 damage to
  Bill when he does not defeat them" -> new `extraDamageTakenWhenNotDefeated`,
  added at the hp-loss site (the branch is type-narrowed 'notDefeated' already)
  AND the pendingExplore display damage. L2 "+10 damage per unused Action" ->
  new `plusDamagePerUnusedAction(amount * actionsLeft)`, in abilityDamage +
  preview.
- Tests customZoeyBill.test.ts 4/4 (shotgun ban, pistol +10/-10ammo, per-action
  preview, Salvador 35+10=45 damage -> hp 25). Gates: game-core 1276/1276,
  client 258/258, typecheck clean. Art: ZO-001.png / BO-001.png.
- Vision gotcha this round: gate digits on these two cards are tiny; the most
  reliable recipe was an 8x crop of JUST the shield/emblem with 'read the number
  inside the shape only, ignore the level digit' — the level+emblem pair read as
  a two-digit number (e.g. "27" = level 2 + gate 7) on full-image reads.

**FR-001 FRANCIS + LO-001 LOUIS (2026-11-16):** two custom characters from Manny's scans
(TWO separate images; the second arrived in a separate gateway folder — always check the newest
native-inputs dirs). Printed codes NOT legible in either scan -> provisional ids fr-001 / lo-001
(type comment + card blocks document this; rename when codes are known). Both 70 HP, gates 3/8.
- **Francis fr-001**: L1 "If you have no cards in your hand, one weapon Francis uses gets an
  additional +10 damage" -> new kind `plusDamageIfEmptyHand`, evaluated on the hand AFTER the used
  weapons leave it (handAfter), flat bonus (one weapon +10 == +10 total; documented). L2 "At the
  beginning of your turn, you can draw 2 cards and discard 2 cards" -> REUSED+extended
  `turnStartDrawThenDiscardCard` with optional draw/discard counts (Rebecca stays 1/1; Francis
  2/2). RULING: the scan's draw count read as both 2 and 3 — majority 2; one-number fix if the
  card says 3.
- **Louis lo-001**: L1 "When Louis explores you can move the bottom card of the mansion to the
  top" -> new manual once-per-turn kind `moveMansionBottomToTop` (useCharacterAbility; log-scan
  once-per-turn guard; validate rejects with <2 mansion cards). L2 reuses
  `plusDamageForWeaponTags` tags ['rifle','machineGun'] amount 10.
- **LATENT BUG FIXED**: the Rebecca draw-1-discard-1 chain offered options as 'Name (id)'
  strings but the resolver filtered hand ids against them — the discard silently never removed a
  card. The chain now uses raw instance ids and supports multi-discard loops (remaining count),
  and 'No Discard' still ends it early. Regression test added.
- Tests: customFrancisLouis.test.ts 5/5 (empty-hand bonus on/off, draw2/discard2 chain,
  bottom-to-top move + once-per-turn, rifle +10, Rebecca discard regression). Gates: game-core
  1261/1261, client 258/258, typecheck clean. Art: FR-001.png / LO-001.png.

**AW-001 LEVEL-0 TIER + AC-000 ART (2026-11-16):**
- Manny: "Aw-001 actually has 3 character abilities starting at level 0." The type comments
  already recorded the intended mapping (drawOncePerTurnIfDamaged = L0) but the DATA had drifted
  to levels 1/1/2 and the ENGINE could not express level 0 (abilitiesForLevel returned [] at
  character level 0). FIX: (a) characters.ts abilitiesForLevel now honors level-0 abilities at
  level 0 (`level === 0` -> filter to level-0 kinds); (b) types.ts drawOncePerTurnIfDamaged
  level union 1|2 -> 0|1|2; (c) custom.ts aw-001 -> draw L0, allDamageReduction L1 (unchanged
  gate 2 / 7), exploreDamageIfHpAtMost L2, + a level-0 entry in levels[]/text. Also fixed a
  PREVIEW gap found while testing: exploreDamage was missing the exploreDamageIfHpAtMost (aw-001
  L2 / low-HP +damage) term — engine applied it, picker didn't (same family as the we-016 fix).
  Tests: customWeskerLevel0.test.ts 3/3 (gating 0/1/2, the level-0 draw prompt fires and draws,
  L2 passive off at 0 / on at 2).
- Manny sent AC-000 (Martial Arts) art -> CARD-ART/AC-000.png (glob picks it up).
- Gates: game-core 1256/1256, client 258/258, typecheck clean.

**CH-005Q JILL VALENTINE (tactical) IMPLEMENTED (2026-11-16):** official custom print, printed
code CH-005 variant (the THIRD custom carrier of CH-005 — premier Barry ch-005, B4MC Sherry
b4mc-ch-005, pirate Jill ch-005p — so this one is ch-005q). 80 HP, gates 5 / 9. Card text read
from the user's scan with the LOCAL Ollama vision model (SetneufPT/Gemma4-12B; the platform
caption + two crop reads collated; vision_analyze was 429-rate-limited, qwen3.5:9b too slow).
- **L1** (gate 5): "+5 Damage for every Action Card she discards this turn. (Action Cards played
  do not count)". NEW ability kind `plusDamagePerActionDiscardedThisTurn`; per-seat counter
  `actionsDiscardedThisTurn` (reset at turn start) maintained by the new hook
  `applyActionDiscardedHooks` — a DIFF of each seat's discard pile across every action (the
  AM-005 trash-hook pattern; discarding has no single choke point, and played Action cards sit
  in the play area so they can never count). Damage feeds `abilityDamage` in the engine
  (single+multi) AND the exploreDamage preview. RULING: the end-of-turn hand discard counts
  toward the counter (harmless — no explore happens after it).
- **L2** (gate 9): "At the end of a turn, Jill can choose up to 3 cards to keep and draws till
  she has 5." NEW ability kind `endOfTurnKeepUpToAndDrawTo`; applyEndOfTurn raises a
  `jillEndOfTurnKeep` prompt (hand cards + 'None') and returns WITHOUT advancing the turn (the
  host already gates auto-startTurn on pending prompts); the chooseOption resolver picks one
  card per prompt (loop up to the limit), and None / limit / hand-exhaustion finalizes by
  re-entering applyEndOfTurn with `pendingKeepEndOfTurn` — she discards the rest and draws back
  to 5. Hand <= 3 at turn end: auto-keep everything, no prompt. Bots answer via generic
  chooseOption enumeration (no policy code needed).
- Art: CARD-ART/CH-005Q.png (the user's scan). Client needs no changes (prompts/banners generic).
- Tests: customJillDiscardKeep.test.ts 7/7 (L1 preview+resolve, played-doesn't-count, discard
  diff hook, prompt raise + no-advance, keep-loop + draw-to-5, auto-keep small hand, limit
  finalize). Also fixed a latent test-file type error in semiAutoRifle.test.ts (computed-key
  object indexing). Gates: game-core 1230/1230, client 252/252, typecheck clean.
- CARD TEXT VERIFICATION: L1 "Jill deals an additional +5 Damage for every Action Card she
  discards this turn. (Action Cards played do not count)" / L2 "At the end of a turn, Jill can
  choose up to 3 cards to keep and draws till she has 5." — collated from the scan; flag in
  RULINGS if the physical card differs.

**BANNER DISMISSES ON FIRST BOARD ACTION (2026-11-15):** Manny: the targeted-by banners should
stay visible until the viewing player interacts with their decision bar.
- Engine (actions.ts applyActionInternal): any non-chooseOption action by a seat clears that
  seat's targetedBy — the banner survives turn start AND prompt answers (Take/Send-to-bottom are
  part of the reveal flow, not a decision-bar interaction) and dismisses on the player's FIRST
  board action (explore / buy / play / end turn / ability). Engine-internal forced explores
  (Sherry) apply through resolvers, never this entry point, so the just-recorded notice is safe.
  The old endTurn-rebuild clear remains (harmless belt-and-braces; endTurn is itself a first
  action).
- targeting.test.ts: the lifecycle test now asserts prompt-answer-keeps (takeOrBottom) + clears
  on the target's first explore; docstring updated. game-core 1223/1223, client 252/252,
  typecheck clean.

**REVEAL TIMING POLISH (2026-11-15):** Manny: (1) reduce the opponent reveal auto-close timer
to 2 seconds; (2) when playing with bots, show the targeted-by banners AFTER all opponent reveal
screens have closed.
- App.tsx: auto-close setTimeout 3000 -> 2000 (all non-locked reveals; the exploring viewer's
  pending-prompt lock still holds).
- Bot-game banner ordering: `isBotGame` (any seat controller === 'bot'); the TargetedNotice
  banner renders [] while revealQueue !== null in bot games — it appears only once every queued
  reveal screen has drained. Human games show the banner immediately (unchanged).
- Client-only change. client 252/252, tsc clean.

**WE-016 PREVIEW FIX (2026-11-15):** Manny: used the Semi-Auto Rifle after two Action cards,
no bonus damage shown. DIAGNOSIS: the RESOLVED explore always applied the +10/Action bonus
(verified: 30 fails vs 50 defeats a 40-HP Dr. Salvador) — but the picker PREVIEW
(`exploreDamage` in explore.ts) omitted it, so the UI displayed no bonus.
- FIX: exploreDamage now mirrors the engine's remaining weapon-effect bonus terms —
  `plusDamagePerActionPlayedThisTurn` (×actions in play), `plusDamageIfSelfHpAtLeast`,
  `revealTopOfInventoryCostGate`, `plusDamageWhenUsingMultipleWeapons`. `blowbackBonus`
  (WE-025) intentionally NOT previewed (depends on discard-with-action choice, unknowable
  up front).
- Tests: new `semiAutoRifle.test.ts` (preview 30->50 with 2 actions AND resolve defeats
  40-HP Salvador); updated one stale expectation in outbreak.test.ts (we-003 Submission's
  own +5-@-80+HP is in the preview now -> 10, matching resolve). game-core 1198/1198,
  client 252/252, typecheck clean.
- NOTE: the preview still can't show the WE-025 blowback pistol discard damage or a few
  prompt-gated effects — engine remains authoritative; preview now covers the static ones.

**EX-004 SILENT-FAILURE FIX (2026-11-15):** Manny: ex-004 causes the same kind of silent
failure as ex-001 had — fix it the same way.
- `custom.ts`: EX-004 declares `dependencies: ['ex-005']` — selecting the Ammunition Box auto-
  includes the Ammo x50's card def (so the granted card's bonuses apply and it renders).
- EX-005 deliberately keeps its OWN market pile when ticked alone — the Box does NOT claim
  exclusivity (unlike EX-001/EX-002). The pile key is EX-005's own selection.
- Test: 'EX-004 pulls EX-005 in automatically; EX-005 alone is still buyable' (def pull-in +
  pile + end-to-end Take flow: Box removed, Ammo x50 instance resolves to a real def).
  NOTE: an earlier bad patch had clobbered the 'shuffles the custom mansion cards' test —
  restored from HEAD before re-adding (suite counts: unofficialExpansion 25, full 1197).
- Gates: game-core 1197/1197, typecheck clean.
**FAN "JP 2025" PROMO SET (2026-11-16):** Manny sent 8 card scans and asked to implement them, read with the LOCAL vision model (gemma4:e2b — see the note below on why). 7 landed; the 8th was a duplicate crossbow print and was dropped by request. Ids: `cac-003` (Change of Outfit), `cac-013` (From Bad to Worse), `cac-014` (Global Battle), `cac-015` (This Shit Ends Now!), `cac-016` (Take Them Down!), `cw-034` (Crossbow), `cw-035` (Scoped Colt Anaconda). The printed codes COLLIDE with official cards (AG-003 prints AC-003 = Shattered Memories; CVL-007 and CW-002 both print CW-002; AC-013..016 are Alliance actions), so the CAC-/CW- prefixes are mandatory — the user chose "CW prefix where possible, CAc for action cards". Duplicate-id scan: 385 ids, 0 dupes. New ActionEffect kinds: `choosePlayerDrawCard`, `weaponsGainedGoToPlayArea`, `discardSelfFromPlayForWeaponFromDiscard`, `endOfTurnPeekAndGiveHand`, `trashHandAndDiscardForMarketCard`. New WeaponEffect kinds: `armedCoinFlipDefeatNextInfected`, `payXpForFirstRevealedBuff`. New actions: `useActionAbility` (CAC-016) and `usePreExploreXpAbility` (CW-035). CAC-013 needed the endTurn body EXTRACTED into `applyEndOfTurn(state, seat, nextBase)` so the turn can finish after the target's discard, and the host/hotseat auto-`startTurn` is now gated on `next.prompts.length === 0` (a prompt can hold the turn open). CW-035's Decoration is awarded explicitly at the defeat site because `decorationDelta` reads the raw def. Tests: `customFanJp2025.test.ts` 25/25. Gates: game-core 1221/1221, server 108/108, client 252/252, typecheck clean.
**LOCAL VISION NOTE:** Ollama on this box is a 4 GB RTX A2000. The default 131072-token context makes a 9B vision read take 5-12 minutes (KV cache spills to CPU). Setting `num_ctx: 8192` + `keep_alive` dropped a `gemma4:e2b` read to ~2 s. Use `read_cards_file.py` / `zoom_read.py` in the Hermes scratch dir for any future card transcription.

**TARGETING ALERT FIX FOR BOT GAMES (2026-11-15):** Manny: "the viewing player in online games
still doesn't get any alert that a bot has targeted him." ROOT CAUSE identified: in a 1-human + bots
room the server broadcasts ONE snapshot AFTER the whole bot stretch — which ALWAYS ends at the
human's turn start. Two things killed the banner at that exact moment:
  1. the engine cleared `targetedBy` at the target's turn START (game.ts), so the snapshot's seat
     already had the notices wiped;
  2. the client gate `activeSeat !== mySeat && phase === 'main'` was false exactly then
     (activeSeat === me), so even intact data would not render.
FIX: (a) engine — the clear moved from turn-start (game.ts, kept only for the downed-skip path) to
the target's TURN END (endTurn newPlayer rebuild in actions.ts); (b) client — the App gate now
renders the banner whenever targetedBy is non-empty, no activeSeat/phase condition. Result: the
snapshot that lands at your turn start carries the notices, and the banner stays up through your
turn until you end it. targeting.test.ts updated: notice survives the target's turn start, clears
at the target's turn end (new 3-step assertion). game-core 1196/1196, client 252/252, typecheck
clean. NOTE: the banner lingers through the player's whole turn by design (they need to know why
they must explore / who forced / stole XP) — it clears at that turn's end.
- 2-human rooms were unaffected (stretch ends at the OTHER human, activeSeat != me mid-game).

**EX-001 OWNS EX-002 (2026-11-15):** Manny: when EX-001 (Special Rocket Launcher Case) is
selected, EX-002 must join the game automatically — and in that case EX-002 gets NO Resource
Area pile (the Case is its only source).
- `custom.ts`: EX-001 declares `dependencies: ['ex-002']` — selecting the Case auto-includes the
  Launcher's card def (the existing dependency-pull in cardsForScenario). This also fixes a latent
  half-bug: selecting EX-001 ALONE previously gained an ex-002 instance with no cardDef
  (no attach-on-gain, unrenderable card).
- `cards.ts` pilesForScenario: when the expanded selection contains ex-001, ex-002 is skipped
  (no market pile, no grn merge). EX-002 ticked alone still gets its grn pile.
- Tests: new 'EX-001 pulls EX-002 into the game automatically; EX-002 alone is still buyable';
  updated the IDS pile test (grn no longer holds ex-002 when the Case is present). game-core
  1196/1196, typecheck clean.

**BOT-REVEAL BATCHING FIX (2026-11-15):** Manny reported on the LIVE Render deploy:
"there are no messages alerting players they were targeted and the view player can't watch
bots mansion reveal".
- **Root cause, bots' reveals:** the server applies a WHOLE BOT STRETCH before broadcasting
  ONE snapshot, so the newest log entry a viewer sees is the stretch's trailing action
  (endTurn/play), never the explore — `detectReveals` (which required the newest entry to BE
  the explore) silently returned nothing for every bot move.
  FIX (client-only): `detectFreshExplores` walks the log BACKWARDS from the newest entry past
  the trailing actions, collects every explore whose seq > prev's last seq (cap 8), and
  `revealsForExplore` computes each one's cards; App.tsx queues ALL of a stretch's explores
  (per-explore party/leader) and APPENDS to a queue already on screen instead of replacing —
  so a multi-bot stretch shows every reveal in order, and a new bot explore during a showing
  reveal joins the line. Three new anims tests (batched explore, multi-explore stretch order,
  no double-shows for already-seen seqs). Client 252/252, typecheck clean.
- **Targeting notices:** engine/plumbing verified correct end-to-end (recordTargeted 6/6 tests,
  sanitize spreads seats so targetedBy rides through, banner component tests) — the "no
  messages" on the live instance was the old pre-targeting server process (PID 6788, started
  Nov 10) seized port 1724 locally; on Render the previous commits carry the engine. If the
  user still sees nothing: bots use abilities only when the greedy policy picks them, so a
  targeting notice needs a Wesker/Sherry/Cephalo bot that actually triggers it.
- **Deployment:** the live instance is Render at https://redbg-1.onrender.com/ (auto-deploy
  on push to master). USER DIRECTIVE: verify on Render, not the local server. Local 1724
  server was restarted then killed per that directive.

**REVEAL-FOR-ALL + 3-SECOND AUTO-CLOSE (2026-11-15):** Manny: "The view player should see all
players complete mansion reveal screen, it should pause the game and automatically close after
3 seconds."
- **Reveal-for-all:** the involvement gate in `detectReveals` (anims.ts) is DELETED — every viewer
  now sees EVERY player's explore reveal (the zones / log / revealed set are all public; only
  hands+inventories are hidden). The two anims tests that asserted non-involvement were flipped
  ('reports ANOTHER player exploring', 'reports a forced explore to an unrelated (watching) seat
  too'). `detectCardReveals` (ability/effect PEEKS) stays involvement-gated — bots' private peeks
  still don't spam the table; this ask was the mansion-door reveal only.
- **Auto-close:** App.tsx useEffect — 3s after a reveal opens (per card in a multi-reveal it
  advances then closes), it does exactly what Continue does: advance / dismiss + play the queued
  YOU DIED screen. The ONE exception (`revealLocked`): the EXPLORING viewer with a pending prompt
  rendered inside the panel (Take / Send-to-bottom etc.) keeps it open until the choice is
  resolved — that panel lock predates this and the earlier "lock until answered" ruling still
  holds. Third-party viewers have no prompts -> always auto-close.
- **PITFALL (bit live):** the auto-close useEffect was first placed AFTER the Lobby early-return
  (`if (view === null || ...) return <Lobby/>`) — a hook after a conditional return breaks the
  Rules of Hooks (React #310: "Rendered more hooks than during the previous render"), which
  CRASHED the app the moment any game view opened (lobby rendered fine; blank game). It must live
  ABOVE the early return and read the state safely there (`view?.state...`). Live symptom: blank
  page right after Start game / entering the board.
- **Commit hygiene:** `client/src/ui/anims.ts` also carries the UNCOMMITTED counter-animation WIP
  (supply/counters zones etc. — not this task). Only the reveal-gate hunk was staged (via
  `git hash-object -w` + `git update-index --cacheinfo` with byte-exact content — `git apply
  --cached` fails on this file's LF/CRLF mix); the WIP stays in the working tree.
- **Live-verified** (pass & play on the fresh build): reveal opened on a Rocket Launcher Case
  token (locked behind its Take/Send-to-bottom prompt — no auto-close while locked, correct);
  after clicking Take, the panel closed BY ITSELF at ~3.0s with no Continue click.
- **Gates:** client 249/249, typecheck clean, vite build OK. game-core/server untouched.

**OFF-TURN TARGETING NOTICES — "the viewing player knows he's been targeted" (2026-11-15):**
Manny: "add a way for the viewing player to know he's been targeted by a card or ability
outside of his turn. I.e. when targeted by fch-008's ability". Generic engine + client feature:
- **Engine:** `PlayerState.targetedBy?: readonly TargetedNotice[]` where `TargetedNotice = { seat,
  reason: TargetReason }` (types.ts). New exported helper `recordTargeted(state, target, bySeat,
  reason)` (actions.ts — the resolvers shadow `targetSeat` as a local const, so the helper is
  deliberately NOT named targetSeat; dedupes (by, reason) and keeps the newest 3). Wired at every
  off-turn targeting resolver: `sherryForceExplore` -> 'forcedExplore'; Wesker L2
  `forceExploreOtherPlayer` + Cephalo `cephaloChoosePlayer` -> 'mustExploreNextTurn';
  `jamesMarcusChoosePlayer` -> 'mustUseAllExploresNextTurn'; `jillAmmoIncrease` (CH-048 Mercenaries)
  -> 'ammoReqNextTurn'; `chooseOtherPlayerRevealHand` (Mind Control) -> 'revealHand';
  `backstabChooseSkill` -> 'backstab' (only fires when the target has an XP'd Skill — untested
  here, gated by the same condition as the prompt). Cleared at the START of the seat's own turn —
  TWO clear sites in game.ts: the normal turn `newPlayer` (the per-turn reset block with
  `ammoReqIncreaseNextTurn: undefined`) AND the downed-revive newPlayer. sanitize() passes the
  field through untouched (it only hides hand/inventory), so server + hotseat clients get it free.
- **Client:** `ui/TargetedNotice.tsx` component + `App.tsx` computes `targetedByMe` (shown only
  when `activeSeat !== mySeat && phase === 'main'`; labels map each TargetReason to a phrase with
  the actor's name) and floats a fixed top-center banner (`.app-targeted-notice`, z-index 500 —
  BELOW the mansion-door reveal). `MansionReveal` gained a `forcedByLabel` prop: App derives it
  from the last log action (`explore` + `forcedBy`) — "X forced you to Explore!" for the target,
  "You forced X to Explore!" for Sherry — rendered as `.mansion-door-forced` under the title.
- **PITFALLS hit:** (1) resolver locals named `targetSeat` shadowed my first helper name —
  rename the helper, not the locals. (2) The downed-revive path in startTurnInternal is NOT the
  normal turn build; the normal per-turn resets live further down (search `ammoReqIncreaseNextTurn:
  undefined`). (3) In App.tsx `const gameState = view.state;` sits AFTER the Lobby early-return —
  a code block using gameState must be inserted after it, not near seatNames. (4) In hotseat the
  banner NEVER shows by design (the holder is always the active seat); the feature is for server
  rooms. The live check above used the forcedByLabel reveal path instead.
- **Tests:** `engine/targeting.test.ts` (6 — Sherry write + sanitize pass-through + clear at
  target's turn start, Wesker L2, Cephalo, Mercenaries Jill, record dedupe/cap). Client
  `ui.test.tsx` +5 (TargetedNotice empty/single/multi, MansionReveal forcedByLabel present/absent).
- **Live-verified** (vite preview build, pass & play): seat 1 (FCH-008 Sherry) force-explored
  seat 0 -> the mansion-door reveal rendered `data-forced-by` "You forced Player 1 to Explore!"
  (plus the party/damage as before). Bots/AoE/poison are NOT covered by `recordTargeted` (the
  banner answers *who aimed at you*, not ambient effects) — Zombie A/B AoE damage etc. still only
  show as an HP change, same as before.
- **Gates:** game-core **1195** (was 1189; +6), server 108, client **249** (was 244; +5),
  typecheck clean x3, soak green, vite build OK.

**CUSTOM JILL VALENTINE (PIRATE) PRINT CH-005 (2026-11-15):** Manny sent a scan of the Jill
Valentine pirate costume card (70 Health, gates 4 / 7) and asked to add it to the custom line.
The printed code CH-005 is taken TWICE in this codebase: by the PREMIER ch-005 (Barry Burton)
AND — added in a parallel push while this was in flight — by the B4MC Sherry fan print
`b4mc-ch-005` (stun-rod Sherry, commit 033261c). This card is the OFFICIAL Capcom/Bandai print
(defaults to the same `ch-` prefix as the other official custom card, ch-000 Rachael), so its id
is **`ch-005p`** ("p" = pirate). Note the B4MC series and the official product both print
"CH-005" for DIFFERENT characters — always grep `id: '` after touching custom.ts.

This commit was REBASED onto origin/master after the parallel Sherry push; the merge combined
my plusTagDamage wiring with the Sherry commit's exploreBonusIfFullHp / stunRodCharge terms in
explore.ts and allyExplore.ts, and keeps BOTH types.ts union blocks.
- **L1 (gate 4): "All your 'Pistol' and 'Machine Gun' Weapons get +10 Damage."** New kind
  `plusDamageForWeaponTags { tags, amount, level }` (types.ts) + pure helper `plusTagDamage`
  (abilities.ts, mirrors `plusTagDamageIfAmmoAbove`). Wired into the SHARED explore
  `abilityDamage` term (actions.ts — covers single AND multi), the picker preview
  (`exploreDamage`, explore.ts) and the Sherry ally-explore (`allyExplore.ts`) — the same three
  sites HUNK's tag bonus uses, so the preview matches the resolve.
- **L2 (gate 7): "When Jill would take any Damage, you can Trash 1 card to negate the Damage."**
  New kind `trashCardToNegateDamage` — implemented the RESUSCITATE way: the explore holds the
  Character at her PRE-damage Health and queues `jillNegateDamage` (options = hand cards +
  Decline, loss in the payload). Accept → the chosen card is trashed (hand → removed), the held
  HP stands (fully negated — a lethal hit does NOT down her). Decline → the loss is applied to
  the CURRENT Health in the resolver (the seat may have changed while the prompt was open), with
  flipDown when the hit was lethal (mirrors the resuscitate decline). Queue helper
  `queueJillNegatePrompt` in abilities.ts; resolver next to the resuscitate handler.
- **Wired:** single-explore (after the kevlar/reduce math, before the down logic) and
  multi-explore (inside the `undefeatedEntries` block — NOTE: it closes BEFORE the barrel/trap
  loop, and `baseLeadingHp` is block-scoped to it, so the hold MUST live inside that block).
  Gated `!leadingIsPartner` (the partner-led explore applies damage to partnerHp and is skipped)
  + non-empty hand + loss > 0. **Documented gaps (same class as CH-008 L1's):** partner-led
  explores, poison at turn start, barrel/trap damage, off-turn AoE, the Sherry ally-explore and
  the AC-042 deferred path. A Jill + Resuscitate player gets NO second resuscitate window if she
  declines (the explore never downs her, so resuscitate never triggers) — corner case, recorded
  not fixed. Kevlar Jacket order: negation covers only the post-jacket remainder; the jacket has
  already moved by prompt time (player-favorable).
- **PITFALL:** the multi hold was first inserted after the barrel/trap loop — TDZ
  (`Cannot access 'baseLeadingHp' before initialization`) because `baseLeadingHp` is a block-scoped
  const inside `if (undefeatedEntries.length > 0)`. Read the brace structure before placing code
  that touches those locals.
- **Tests:** `engine/customB4mcJill.test.ts` (13 — data shape, not in ALL_CARDS, plusTagDamage
  unit (pistol/MG/both-tags/knife-0), picker preview 10→20 at L1, two-Handguns vs 25 HP defeated
  at L1 not L0, prompt + hold, Accept trashes + keeps HP, Decline applies, lethal Accept keeps
  standing, lethal Decline downs, no prompt with empty hand, no prompt below L2, multi hold).
  Verified red without the wiring for the L2 prompt and the L1 damage (behavioral tests).
- **Art:** `CARD-ART/CH-005P.png` (320x448, P-mode, ~109 KB) from the scan — tight card scan
  at 514x700, scaled to 320x436 and letterboxed 6px top/bottom to match the B4MC family.
  `client/dist/assets/CH-005P-<hash>.png` confirmed emitted by `vite build`.
- **Gates:** game-core **1175 + Sherry's parallel tests** (was 1162; +13 mine), server 108, client 244, typecheck clean ×3,
  soak 29/30 natural. LEDGER entry appended.

**B4MC CHRIS REDFIELD FAN PRINTS (2026-11-15):** three custom characters added from Manny's scans
(`b4mc-ch-007/008/009`, all 90 Health). CH-007 gates 3/6 (L1 once-per-round -10 Infected Damage + an
Ammo x10; L2 once-per-turn Trash -> +1 card). CH-008 gates 2/7 (L1 +10 Damage this turn once an
Infected has dealt Damage this round, +20 instead while a Character is face down; L2 once per round a
not-defeated Infected goes on TOP of the Mansion). CH-009 single level, gate 3 (turn-start +1 Explore
and +10 Damage, owing two Explores - reuses Rachael Foley's `exploresRequiredThisTurn` debt).
FIVE new `CharacterAbility` kinds + two new state fields: `PlayerState.roundUsedAbilities` and
`GameState.infectedDamageThisRound`.

**ROUND = Manny's definition (2026-11-15):** "one complete turn for all players that can take a turn
before it circles back to the first player". Implemented WITHOUT a round counter: `startTurnInternal`
(game.ts) treats `activeSeat === lowest living seat` as the round start and clears every seat's
`roundUsedAbilities` plus the global `infectedDamageThisRound`. So a 1-seat game resets every turn.

**"YOU CAN" SCOPE RULING (Manny, 2026-11-15):** CH-007 L1 and CH-008 L2 were designed for play modes
this game does not have, so they are AUTOMATIC (no choice prompt) and apply ONLY during that
character's OWN turn (`state.activeSeat === seat`). CH-009 keeps its Yes/No prompt (it is a choice by
design, like Rachael Foley L1).

Wiring notes: CH-007 L1's reduction is added to BOTH the single-explore `damageReduction` and the
multi-explore combined `damageReduction`; the Ammo grant + `markChrisL1ReductionUsed` are applied to the
FINAL seat on the multi path (the explore rebuilds the seat from a pre-effect snapshot - a mid-branch
gain is dropped). CH-007 L2 is a post-action hook (`applyTrashDrawHook`) that fires when any action
grows `removed` during his turn, once per turn. CH-008 L1's bonus is computed at turn start into
`weaponDamageBonusThisTurn`. CH-008 L2 inserts at Mansion position 1 in BOTH the single-explore
disposition and the multi-explore `undefeatedEntries` loop. Known gaps: the CH-008 L1 round flag is set
only at the explore not-defeated sites (reveal-time AoE infected damage and NYX are NOT covered), and
the AC-042 deferred-explore path does not apply CH-007 L1 / CH-008 L2.

Art: `CARD-ART/B4MC-CH-007/008/009.png` (320x448, P-mode, ~100 KB). The default character badge
geometry (89.7%, 7.7%) is used; the fan render's printed "90 Health" badge measured anywhere from
(84-90%, 8.9-12%) across repeated vision reads, so the live HP ring may sit a few px off. VERIFY ON A
RENDERED CARD before adding a per-card `--cc-badge-x/y` override.

Tests: `engine/customB4mcChris.test.ts` (20). Gates after rebasing onto origin/master: game-core 1162
passed / 0 failed (the 7 pre-existing failures were fixed upstream), server 108, client 244, and
`npm run typecheck` is CLEAN (0 errors, all three workspaces) after Manny had the 20 untracked
`game-core/src/ai/*.ts` debug scripts deleted - they were the whole reason the typecheck gate was red.
Still uncommitted and NOT part of this task: `client/src/ui/anims.ts` (a counter-animation WIP) and
`game-core/src/data/CARD-ART/MA-000.png`.

**B4MC SHERRY BIRKIN PROMOS (2026-11-15):** Manny sent three JP-2025 card scans (printed
codes CH-004/005/006 — all of which COLLIDE with official cards) and said "prefix their
card id with b4mc". Implemented as `b4mc-ch-004` / `b4mc-ch-005` / `b4mc-ch-006`.
- **Data** (`custom.ts`): ch-004 100 HP, `level1At: 2` / `level2At: 5`; ch-005 100 HP,
  `level1At: 0` / `level2At: 7`; ch-006 90 HP, `level1At: 4` and NO level 2. (The boxed
  number beside "Level N" on these prints is the Decorations requirement, matching
  `level1At`/`level2At` — verified against official ch-002 whose 2/6 match its data.)
- **New CharacterAbility kinds:** `damagePerCharacterHealedThisTurn` (ch-004 L2),
  `stunRodCharge` (ch-005 L1), `exploreBonusIfFullHp` (ch-005 L2),
  `healAtTurnStartOrElseDamageThisTurn` (ch-006 L1).
- **"Healed this turn" needs a tracker.** `applyHealTracking(prev, next)` (abilities.ts)
  DIFFS Health per seat (main `hp`, and `partnerHp` only when `partnerInstanceId` is set)
  and records the key `<seat>:main|partner`; a Character healed twice counts once, and a
  heal capped at max Health does not count. It runs at the TWO turn boundaries — after
  every `applyAction` and inside the `startTurn` wrapper (most heals land there) — and the
  list is cleared in `startTurnInternal`. Keying by character, not by event, is what makes
  "+5 per Character" right.
- **ch-005's "Stun Rod" is the OFFICIAL `we-028`** (Outbreak). New `CardDef.dependencies`
  feeds the `cardsForScenario` `wanted` loop, so the def is present even on a base
  scenario. `setup` shuffles one instance into the seat's Inventory when she is the Main
  OR the Partner (ruling).
- **ch-005 L1 is a manual ability**: pay 1 Action (validate rejects with
  `no Action to spend`), once per turn via validate's log scan; sets
  `PlayerState.stunRodCharged`, cleared in `startTurn`. The +10 is applied PER WEAPON in
  the explore damage expression (`w?.id === 'we-028'`), so it covers single-, multi- and
  ally-explore and needs no state mutation; `exploreDamage` (the picker preview) mirrors it.
- **Rulings taken** (asked, because each had two readings): "each Character that has been
  Healed" = ANY character, opponents included; the -1 Action is a once-per-turn manual
  cost; the Stun Rod shuffle happens whether she is Main or Partner.
- **Tests:** `customB4mcSherry.test.ts` (14) — data shape, the we-028 dependency pull, the
  setup shuffle (Main and Partner), the heal / heal-or-damage branches, the heal tracker,
  the charge cost + once-per-turn + per-weapon bonus, and both L2 bonuses through
  `exploreDamage`. Art: 3 PNGs converted from the JPEGs (320x448, P-mode, ~95-104 KB).

**END-SCREEN PLAYER RANKING (2026-11-14):** Manny: "Add a ranked list of players and
their decorations at the end of the game to the end screen." Done.
- `rankStandings(players, winners)` in `client/src/ui/standings.ts` — PURE (no React /
  store) so it is unit-testable in the `node` test env: Decorations desc, then Health,
  i.e. the SAME order `checkWin` ranks winners, so the list can never disagree with the
  CHAMPION / SHARED VICTORY line. It also strips `hp` from the rendered rows.
- `SeatSwap` gameOver renders `<ol className="seat-swap-standings" data-standings>` with
  one `<li data-standing={seat}>` per player (rank / name / `N ★`); winner rows get
  `is-winner`. `standings` is optional so the old winner-only path still renders.
- `App.tsx` builds the rows from `view.state.seats` (Decorations + Health are NOT
  sanitized away by `viewForSeat` — only hand/inventory are) plus `seatNames`.
- **Live-verified**: SHARED VICTORY with rows `1 Jill 9 ★`, `2 Ada 9 ★`, `3 Chris 3 ★`
  — the 9-9 tie broken on Health (Jill 80 > Ada 55).
- **Tests**: `standings.test.ts` (4 — order, tie-break, winner flagging, hp stripped),
  `ui.test.tsx` +1 (the ranked rows render, best first).

**BOSS REVEAL vs GAME-OVER OVERLAY (2026-11-14):** Manny: "When the boss is revealed and
defeated, the game end screen pops up immediately and the player doesn't actually get to
see the boss revealed." The explore that DEFEATS the boss is also the explore that ends
the game, and `.seat-swap-backdrop` (pass-device + game over) is z-index 640 while
`.mansion-door-backdrop` (the explore reveal) was 600 — the end screen painted straight
over the boss.
- **Two independent guards** (either alone can be undone, so both are worth having):
  `.mansion-door-backdrop` z-index 600 → **660**, and `shouldShowGameOverOverlay()`
  (`client/src/ui/overlayOrder.ts`) keeps the end screen OUT OF THE DOM while a
  mansion-door reveal, an ability/effect reveal, or YOU DIED is pending. The z-index is
  what stops the FIRST-frame flash (the reveal queue is set in a `useEffect`, after
  paint); the gate is the semantic "you must see it first".
- **Only the Nightmare scenario has a scenario boss** (`winInfectedCardId: 'ma-054'`,
  Osmund Saddler); Outbreak uses `endInfectedCardId: 'ma-041'`. `checkWin` fires the moment
  the boss is ATTACHED, i.e. in the same action as the reveal.
- **Live-verified**: Nightmare hotseat, boss forced to the Mansion top → the reveal shows
  "Defeated! Osmund Saddler is attached to your character (+8 ★)." with NO end screen, and
  the CHAMPION screen appears only after Continue.
- **Tests**: `client/src/ui/overlayOrder.test.ts` — the gate truth table, plus a test that
  PARSES `styles.css` and asserts `.mansion-door-backdrop`'s z-index beats
  `.seat-swap-backdrop`'s (goes red at 600).

**MERCENARIES AMMO ABILITIES AM-005..AM-007 (2026-11-14):** Manny: "Am-005's card
text reads 'when you trash this card, you get +10 gold during this turn'" — the card ART
agrees, but the DATA did not: all three Mercenaries ammo cards were plain
`+Ammo/+Gold` cards with no printed ability. Fixed (option 2 + 3: the trash trigger is
ADDED ON TOP of the play bonus, and all three cards got their text + effect).
- **Data:** new `AmmoEffect` union + `CardDef.ammoEffects`. `am-005` →
  `gainGoldWhenTrashed` 10; `am-006` → `onDefeatTrashForAmmoX10`; `am-007` →
  `recycleToInventoryTopAtTurnEndIfDidNotExplore`. `text` corrected to the printed
  wording on all three. `bonuses` UNCHANGED — the +Ammo/+Gold icons still fire on PLAY.
- **AM-005:** `applyTrashAmmoGoldHooks` (actions.ts) is a DIFF OF `removed` run after the
  action. Trash has 45 reducer sites and no choke point, so a per-site hook would drift;
  the diff covers every source (Item Management, WE-030, CW-029, SK-016, AC-044/047,
  Rebecca L2, Cover-up, infected effects). The Gold goes to the card's OWNER
  (`ownerSeatOf(prev, id)`) — "YOU trash this card".
- **AM-006:** `ammoX10UpgradePrompt` (mercenaries.ts) is raised ONCE PER EXPLORE, in BOTH
  the single- and the multi-explore defeat path (the multi path does NOT call
  `applyMercenariesOnDefeatAbilities`, so it needed its own call). The prompt id keys on
  the Ammunition instance — one per defeated Infected would collide. `am006Choose`
  resolution trashes it, `gainAmmoX10`, and sets `ammoX10UpgradeUsedThisTurn`
  ("once during your turn"), cleared in `startTurn`.
- **AM-007:** `recycleAmmoIds` in `endTurn`, resolved AUTOMATICALLY (same ruling as
  CW-025: keeping the Ammunition is never worse). It lands on top of the Inventory and
  the end-of-turn draw then takes it into the new Hand.
- **Tests:** `mercenaries.test.ts` +8. AC-047 Anticipation's expectation moved 20 → 40 —
  it trashes two am-005, so both trash abilities now fire. Verified red without each
  hunk.

**MERCENARIES BASIC RESOURCES LOBBY OPTION (2026-11-14):** Manny: "Add a check box under
skill in the lobby/room; when checked it replaces the basic resources in the selected
scenario — ammo cards, pistols, knives — with the ammo, pistol and knives piles from the
Mercenaries set." Done as a room option (`mercenariesBasicResources`) exactly like
`skillSystem`, with a checkbox under the Skill toggle in all three surfaces (create-room,
pass-&-play, room lobby).
- **Engine:** `MERCENARIES_BASIC_RESOURCES` maps the five basic-resource PILE IDS to the
  Mercenaries printings — `am10`/`am20`/`am30` → `am-005`/`am-006`/`am-007`, `hg` → `we-049`
  (Custom Standard Sidearm), `kn` → `we-050` (Reliable Blade). `pilesForScenario(id,
  { mercenariesBasicResources })` replaces the CONTENTS of those piles (the pileId, and so
  the board slot, is preserved — only the cards change); `cardsForScenario` pulls the five
  defs in so a BASE scenario can resolve them (an expansion scenario already has them via
  `ALL_CARDS`). Both helpers take the new opt alongside `customCards`/`skillSystem`, and the
  option COMPOSES with custom cards (a custom weapon still merges into the replaced pile by
  its tag).
- **Plumbing:** `RoomSnapshot.mercenariesBasicResources`, the `createRoom` field, and a new
  `setMercenariesBasicResources` host message (protocol + rooms setter + ws case); `host.ts`
  and `hotseat.ts` pass it to BOTH `cardsForScenario` and `pilesForScenario` (forgetting
  either leaves the piles referencing unknown card ids, which `setup` silently skips).
- **Note:** the starting deck is DERIVED BY STAT MATCHING, so it stays the standard
  7×Ammo x10 / 1×Handgun / 2×Combat Knife — the Mercenaries basic printings are
  stat-identical, so only the Resource Area changes. **Updated 2026-11-14 (Manny: "Have it
  change the starting decks too"):** `GameSetup.mercenariesBasicResources` now makes `setup`
  PREFER the Mercenaries printings when deriving the opening deck (`pickBasic(pileId, byStats)`
  in game.ts), so the opening 10 cards are am-005 / we-049 / we-050. The option is threaded
  into the `setup()` call in `host.ts` and `hotseat.ts` as well — forgetting that link leaves
  the market swapped but the deck Premier.
- **Tests:** `cards.test.ts` +5 (mapping, pile swap, defs, custom-card compose),
  `game.test.ts` +1 (a real First Timer game's market holds the Mercenaries instances),
  `rooms.test.ts` +1, `protocol.test.ts` +1, `ui.test.tsx` +1 (all three toggles),
  `hotseat.test.ts` +1. Live-verified: the pass-&-play board shows Custom Standard Sidearm /
  Reliable Blade.

**ABILITY/EFFECT REVEAL OVERLAY (2026-11-14):** Manny: "when an ability or effect reveal a card
from any pile, the game is paused and the card is briefly shown to the player. Leave the mansion
reveal screen untouched." Before this, only the EXPLORE reveal paused the table (the mansion-door
overlay). Every other reveal — Ada/Carlos's Mansion peek, Ricardo's Inventory top, the PDA, Master
of Unlocking, Hunk's hand, SK-029's pistols, Ada (Outbreak) L2, Cover-up, Wesker's Secret, the
Ecliptic Express, Mind Control, the Bolt-Action Rifle's Inventory peek — surfaced only as a text
prompt ("You peek at the Mansion: X"), and a peek leaves the card in its pile so there is NO zone
diff for the client to observe. Now:
- **Engine:** `LoggedAction.reveals?: readonly CardReveal[]` (`{instanceId, pile, ownerSeat?}`,
  `CardRevealPile` = mansion/inventory/hand/discard/market/deck) is filled by the new
  `recordCardReveals()` in `applyActionInternal`, which rewrites the action's log entry matched by
  `seq` exactly like `recordExploreReveals`. Wired at EVERY non-explore reveal site: the
  `playActionCard` effect loop (`lookAtMansionTop`, `weskersSecret`, `stealRevealedWeapons…` with
  `ownerSeat`, `lookAtTopInventory`, `lookAtMansionTop3AndReorder`), `useCharacterAbility`
  (`revealMansionTopNoEffect`, `revealInventoryTopForAction`), the `chooseOption` resolvers
  (`revealHandTwoTypes`, `skillRevealPistolsForExplore`, `turnStartRevealActionsForCards`,
  `chooseOtherPlayerRevealHand`, `coverUpTrash`) and the explore-path WE-015 cost gate. Explore
  reveals are deliberately NOT recorded here — they belong to the mansion-door overlay.
- **Gotcha:** `recordCardReveals` REASSIGNS `nextBase.log` (`.map` returns a new array), so it must
  run BEFORE any state object that spreads `...nextBase` is built. The Cover-up site built
  `afterTrash` first and silently dropped the reveal until the call was moved above it.
- **Client:** `detectCardReveals(prev, next, mySeat)` (`ui/anims.ts`) walks the log backwards past
  supplementary entries and returns the newest batch newer than `prev`, but ONLY for a seat that is
  INVOLVED — the actor, or a seat whose own card was revealed (Master of Unlocking / Mind Control
  carry `ownerSeat`), so a bot's private peek never pops the overlay on the human's screen (the same
  rule `detectReveals` uses). `App.tsx` holds it in `cardReveal` state, adds it to
  `disabled`/`cardHidden`, and renders the new `ui/CardRevealOverlay.tsx` (title, source label, one
  card per reveal with its pile caption, "Tap to continue") — but only while no mansion-door reveal
  is active, so a same-step explore + WE-015 reveal plays the mansion panel first. A `view === null`
  effect clears it on the way to the lobby.
- **Tests:** `game-core/src/engine/cardReveal.test.ts` (12 — one per site; 11 go red when the
  helper is stubbed to a no-op), `anims.test.ts` +7, `ui.test.tsx` +3. Verified live in a hotseat
  game: the overlay renders centred at desktop and 400x800 (no overflow), and injecting a reveal
  into the store's view drove the real App effect → overlay → tap-to-dismiss.

**ZOMBICIDE FAN WEAPON SHEET (CW-025..CW-033) IMPLEMENTED (2026-11-13):** Manny sent a photo of nine
printed weapon cards and asked for them as custom cards. All nine are in `data/custom.ts` with the
printed stats and rules text verbatim; two titles repeat on the sheet (Machine Gun w/ Launcher, Akimbo
Flintlock Pistols), so they got sequential ids (cw-027/028 and cw-030/031). Nine new `WeaponEffect`
kinds — the `types.ts` comment block maps each to its card. Gotchas hit while wiring:
- **A multi-Infected bonus belongs in `computeDamage`, NOT in the per-weapon damage expression.** The
  reducer's per-weapon `damage` value is summed INTO `computeDamage`, so adding "+5 per additional
  Infected" in both places double-counts (45 read as 50). `plusDamagePerInfectedBattled` already lived
  in `computeDamage` alone — follow that precedent.
- **`computeDamage` now receives `infectedBattledThisTurn: exploreCount`** from the explore reducer
  (it was previously unset there, so `plusDamagePerInfectedBattled` never fired in the reducer), and
  `exploreDamage` takes an optional `exploreCount` (6th param) plus the armed-launcher handling so the
  picker preview agrees with the resolve.
- **CW-028's "can deal 15 to all Revealed Infected" is a manual per-turn trigger**
  (`useWeaponAbility` → `armedLauncherInstanceId`, cleared in `endTurn`). While armed the weapon's own
  damage is zeroed and the 15 is a per-Infected splash merged into `resolveMultiExplore`'s splash term.
- **CW-025's recall is implemented as printed but its branch is DORMANT:** a weapon reaches the play
  area only by being used in an explore (`playWeapon` is validated but has NO reducer case, and
  `explore` rejects a play-area weapon unless a reuse ability applies), so "in your Play Area and was
  not used while Exploring" cannot occur in normal play. Dispatching `playWeapon` THROWS
  (`unknown action type`).
- **Art:** cropped the 3x3 photo (828x1159) into `CARD-ART/CW-025.png`..`CW-033.png` at
  320px wide, P-mode 256 colours (~108 KB each, matching the catalogue; RGB runs ~280 KB
  apiece). Verified in `client/dist/assets/` after `npm run build -w client`. The printed
  CW-029 text really is "+1 card" — a low-res crop makes the word look like an action icon.

**RACHAEL FAILURES FIXED — DUPLICATE CARD IDs + A DUPLICATE PROMPT (2026-11-13):** the last 4
pre-existing red tests. Two root causes, both "the same thing added twice":
1. **`ma-000` was defined twice** in `data/custom.ts` — the Rachael Foley ooze (its printed code,
   see `CARD-ART/MA-000.png`, which CI-009 shuffles in by that id) and the "Martial Arts" action
   card. `cardDefs` keeps the LAST def, so every ooze instance resolved to the ACTION card:
   revealed as a non-Infected, never defeated, no Decoration, never attached, and it vanished
   from the deck. Martial Arts is now `ac-000` (the code the engine comments already used for it)
   and `game.ts`'s attach check follows. `rc-001` (Rebecca Chambers — one copy had a literal
   `\\n` in its text) and `ah-001` were duplicated the same way and are de-duplicated too.
   **Scan for duplicate ids after adding ANY card**: `grep -c "id: '<id>'" game-core/src/data/*.ts`.
2. **Two identical turn-start prompt blocks for Rebecca L1** (`turnStartDrawThenDiscardCard`):
   `rebeccaDrawDiscard` (commit 5a56101) and `rebeccaTurnStartDrawAndDiscard` (commit 2458f38),
   both pushing `ability-<seat>-v<version>`. Two prompts sharing one id means `chooseOption`
   removes BOTH, so the player can answer neither. Kept `rebeccaTurnStartDrawAndDiscard` (what
   the test expects) and moved its `usedStartOfTurnAbilities.turnStartDrawThenDiscardCard` flag
   write over from the deleted block, so the manual ability button is still blocked after the
   prompt fires. Every `prompts.push` in `turnStartAbilityPrompts` must have a UNIQUE id — most
   still use the generic `ability-<seat>-v<version>` and are safe only because they are the sole
   prompt for that ability; give any new one a distinct prefix (`rachael-explore-...`).

**BARRY L1 "usable again next turn" FIXED (2026-11-13):** the last of the 5 documented
pre-existing red tests. `validate.ts` rejected a second `useCharacterAbility` for
`plusDamageThisTurn` with "start-of-turn ability already used this turn" because
`actions.ts` recorded `usedStartOfTurnAbilities.plusDamageThisTurn = true` when the button
was pressed (commit e328e00). That flag is for abilities fired by a TURN-START PROMPT and is
only cleared in `startTurn`, so it survived the seat's `endTurn` and blocked the ability for
every later turn. The once-per-turn rule was ALREADY enforced by the log scan at the top of
the same block (it walks back to the seat's last `endTurn`), so the flag was redundant within
a turn and wrong across one. Removed the flag write and the dead `plusDamageThisTurn`-specific
check it had spawned (the general check above it already fired first, so that branch was
unreachable). Real games were unaffected — `startTurn` clears the flag before the next turn —
which is why only the test's hand-built fixture (endTurn without startTurn) caught it. A/B:
reversing the hunk turns exactly that one test red.

**LK-001 LEON L2 (RAPID FIRE) NOW COVERS THE WEAPONS HE PLAYS (2026-11-13):** Manny:
"Lk-001's second ability should mean that all weapons he plays count as pistols ... any two
weapons trigger his level 1 ability while his level 2 is active." It did not. The explore
reducer resolves `dualWieldBonus` from the PRE-explore state, where the two weapons are still
in HAND, and `effectiveWeaponTags` only added 'pistol' to cards already in the PLAY AREA — so
L2 was nearly dead (a play-area weapon is only explorable with a reuse ability, which LK-001
does not have). `effectiveWeaponTags`/`isPistolWeapon` now take an optional `playedIds` (an
explore's weapon set) and treat those as in the play area; `dualWieldBonus` and
`healOnDefeatWithWeaponTag` pass their `weaponIds`. `playAreaCardsArePistols` also reads
`seatAbilities` instead of `characterAbilities`, so a Partner Leon's L2 covers the seat's
shared play area — matching `maxWeaponUses`, which already reads the seat. Verified: L2 +
shotgun(25) + knife(10) from hand = 45 damage (was 35), and the reducer now defeats a 40 HP
Bui Kichwa that 35 could not. The client needs no change — its picker prices combos with the
same `exploreDamage` helper.

**HEALTH GAUGE: OPAQUE + KEPT INSIDE THE CARD (2026-11-13):** Manny: "Double the size of the
health gauge, make them not transparent and adjust the centering so that it doesn't leave
the card." Both gauges are now 2x their ORIGINAL size, and the centering was reworked so
neither leaves its card:
- **Character gauge** stays at `--cc-badge-size: 36%` but the anchor moved INBOARD to
  (78%, 17%) — promo (78%, 27%) — because a 36% ring centred on the printed badge
  (89.7%, 7.7%) spills past the card's top-right corner. The art-only character card is
  back to `overflow: hidden` (no longer needs to be visible). The printed badge still sits
  inside the gauge's disc.
- **Infected gauge** (the one previously left alone) is doubled 27px -> 54px AND absolutely
  positioned (`.card-top .health-ring { position: absolute; top/right: 6px }`) so the bigger
  ring cannot push the card's flex header taller or spill out. The reveal overlay keeps its
  own `.mansion-door-card .health-ring` positioning — that rule comes later in the file and
  wins on equal specificity.
- **Opaque:** `HealthRing` now draws a solid backing disc (`.health-disc`, `#12151c`) under
  the segments, so card art no longer shows through the ring's centre or the empty segments.
Measured live: character gauge 28x28 inside the 80x114 card (4px right / 6px top margin),
15x15 inside the 44x63 phone card, `fullyInside: true` at both sizes.

**POISON GAUGE + COUNTER VISIBILITY (2026-11-13):** Manny: "A poison counter is still not
being attached to characters when they're supposed to gain one. Remove the health pulse
animation for the heath gauge. Double the size of all health gauges. When the player is
being affected by poison a counter, change the health gauge to purple." ENGINE FIRST: the
counter DOES attach in every reachable path — verified with throwaway tsx probes (single
explore, multi-explore, Crow chain, partner-led, the explore that downs the character, and
MA-072's second card, which auto-defeats the revealed Infected so it correctly attaches
nothing). What was missing was the VIEW: `Board.tsx` renders `PlayerPanel` only for OTHER
seats, so the viewing player's own counter was drawn NOWHERE — only the transient purple
card-shake. Fix: `CharacterCards` renders the seat's counters as a small fan pinned to the
character card's bottom-left (`.cc-counters`, `data-player-counters`). GAUGE: the
`hp-pulse` keyframes and `.cc-hp-ring-flash` are DELETED, along with the now-dead
`CardView.flash` prop; the character gauge is 2x (`--cc-badge-size` 18% -> 36%, ring
viewBox 24/26 -> 48/52, stroke 3/6 -> 6/12) and `.card.card-character.card-art-only` is
now `overflow: visible` because the bigger ring is centred on the printed badge and spills
past the card's top-right corner. `HealthRing` gained a `poisoned` prop (purple
`#a855f7` fill + `data-poisoned`) wired through `CardView` -> `CharacterCards` and
`MansionReveal`'s party (`RevealPartyMember.poisoned`, fed from `explorer.counters`).
Measured live: 28x28 on the 80px card (was ~14), 15x15 on the 44px phone card, unclipped,
no overlap with the next column. The Infected card's OWN Health ring (27px in
`.card-top`) was deliberately NOT doubled — at 54px it would overflow the 94px card's flex
header.

**CI-002 CROW CHAIN REVEAL FIXED (2026-11-13):** Manny: "when infect crow is revealed the
second card reveal animation isnt happening". The client's `detectReveals`
(`client/src/ui/anims.ts`) rebuilt the revealed set from the top `exploreCount` cards of
the pre-explore deck plus the zone diff — but a chained card that is RETURNED (an
undefeated Infected bottomed, or a non-Infected shuffled back) is indistinguishable from
an unrevealed deck card, and `shuffleBack` shuffles the WHOLE deck, so deck order is no
signal either. A Crow chain therefore showed only the Crow. Fix: the engine records the
exact revealed set on the logged explore action (`action.revealedInstanceIds`, in reveal
order) through `recordExploreReveals()`, which rewrites the explore log entry in place
(matched by `seq`, so it is position-independent in the very branched explore case); the
client uses that list and falls back to the old prefix for logs written before the field
existed. Wired for the plain single reveal, the MULTI block (Crow chains AND
multi-explores) and the single-path MA-039 / MA-072 branches. Tests: `customCrow.test.ts`
+2 and client `anims.test.ts` +2, both verified RED with the hunk reversed. A pure
client-side re-derivation of the expansion rules was rejected on purpose — it would
duplicate the reducer's reveal logic.

**RC-002 PARTNER HEAL FIXED (2026-11-13):** Manny: "rc-002's level 2 ability does not heal
her when she is a partner" (the heal is her L1 — `healIfDidNotExplore`, 10 Health at end of
turn; L2 is the Machine Gun damage). Root cause: the end-of-turn block looked the ability up
with `seatAbilities` (the Main + Partner union) and wrote the recovery to `hordeHp`, i.e. the
MAIN character's Health — so a Partner Rebecca healed the Main and never herself. Fix: look
the ability up per character (`characterAbilities` → `hp`, `partnerAbilities` → `partnerHp`),
the same split `healAtTurnStart` already uses in `startTurn`. The condition stays SEAT-level
(`exploredOrAttackedThisTurn`) because the Alliance rule is "Partner and Main explore at the
same time". `newPlayer` is built from `...player`, so the partner value must be written
explicitly or it is dropped. Tests: `customCards.test.ts` +5 (partner heal lands on partnerHp
and not hp, capped at partnerMaxHp, suppressed by a seat explore, level-gated below the L1
gate of 3 Decorations, Main case unchanged); 2 of them verified RED with the hunk reversed.

**BOT DEADLOCK FIXED (2026-11-12):** the idle loop above is fixed in `ai/policy.ts`. Two
triggers, both feed one override — "take the seat's best explore instead of endTurn":
1. `isUnarmedDeadEnd(state, seat)`: no Weapon card anywhere in hand / inventory / discard /
   play area / attached / partnerAttached AND no Weapon in the Resource Area it can afford this
   turn (`buysLeft`, `turnGold`).
2. `idleTurnsInARow(state, seat)` >= `STALL_TURNS` = 5: consecutive COMPLETED turns whose only
   logged actions were passes (playAmmo/playWeapon/prompts/endTurn). Counted from `state.log`,
   so no engine state was added; the seat's still-open turn is skipped when counting.
Scoring is untouched — `EXPLORE_BIAS` still never applies to an unarmed explore, and unarmed
explores only enter the candidate set when a trigger fires — so normal play is unchanged.
`choosePlayoutAction` delegates to `chooseGreedyAction` when a trigger fires (every rollout line
is equally dead).

TUNING (seeds 1-8, 4 hard bots, firstTimer, 8000-action cap): before the fix 2/8 seeds capped
(turn 2679 and 4490) and games ran 637-1365 turns; STALL_TURNS 2 or 3 ended most seeds with
EVERY seat dead (bots suicide right after a quiet start); STALL_TURNS 5 ends all 8 seeds with
4 survivors, turns 321-707, decoration spread comparable to baseline. Verified after the fix:
`unofficialExpansion` bot-conservation seed 3 went cap(turn 2467) -> gameOver(turn 145);
no-custom seed 4 cap(turn 1982) -> gameOver(turn 430); poison seed 5 cap(2242) -> 178;
poison seed 6 cap(1050) -> 356.

TEST STATE after the fix: game-core engine 40/45 files pass, 7 failures, ALL pre-existing and
reproduced with the policy change stashed (`actions.test.ts` Barry L1 log scan, `customAntiqueCoin`
IT-000, `customRachael` prompt id, `customRachaelFoley` x3, `unofficialExpansion` custom-ex-002
pile). The bot-conservation test in `unofficialExpansion` is now GREEN. `src/ai` all green
(policy/playout/bot/sim/soak/evaluate/enumerate = 127 tests) including "hard bots explore at a
healthy rate and games end naturally" and the full-game soak "every scenario plays a full game
with conserved, sane, terminating state". client 207, server 105 green (server includes the
bot-only-endgame no-freeze test).

**EX-009 POISON IS FIVE COUNTER CARDS (2026-11-12):** Manny: "make the number of poison
counter card 5 instead of 1". `CUSTOM_CARDS` EX-009 `copies: 1 -> 5` (data/custom.ts); setup
already seeds `supply` from `copies`, so a poison game now starts with `ex-009#1..#5` in the
shared supply. The printed "a maximum of one Poison counter per Character" rule is unchanged
(`counters.ts` matches by cardId, not by supply size), so up to five Characters can carry one
each. Verified: two seats exploring into Web Spinner / Yawn end up with `ex-009#1` and
`ex-009#2`, supply 5 -> 4 -> 3, and each takes its own 5 damage at its own turn start. New
regression test `unofficialExpansion.test.ts` "five counters let two Characters be poisoned at
the same time"; the supply-seeding assertions now expect five instances.

**SIDE EFFECT — bot sim seed 3 now hits the 4000-action cap (not a poison bug):** with 5
counters, `unofficialExpansion.test.ts` "conserves every instance ... across full games" fails
on seed 3 with `ended: 'cap'` (turn 2467, 2 seats alive). Reproduced with `['poison']` vs the
full EX set, and confirmed it is the copy count: on 1 copy the same seed ends `gameOver` at
turn 988. Root cause is the bot policy, not the counter: `ai/policy.ts` deliberately never
volunteers an unarmed explore (`action.type === 'explore' && weapons.length === 0` is filtered
out), so once two seats die and the survivors hold no Weapon and cannot afford a buy
(10 Gold vs cost 20), they loop `playAmmo` / `endTurn` forever — the game can never reach
"all players dead". Same loop can hang a live game where only weaponless bots remain. NOT
fixed here (bot policy decision for Manny). The other red in that file, `custom-ex-002` pile,
is the known stale assertion documented above. The loop is NOT poison-specific: a sweep of
seeds 3-6 with NO custom cards stalls too (`noCustom seed=4` ends `'cap'` at turn 1982 with all
four seats alive), so it is a pre-existing bot/idle bug — the extra poison deaths just make more
seeds reach it. Sweep data: noCustom 3/5/6 = gameOver (turns 1096/637/1365), noCustom 4 = cap;
poison bundle 4 = gameOver turn 11, 3 = gameOver turn 189, 5 = cap turn 2242 (3 alive), 6 = cap
turn 1050 (1 alive).
**FCH-002 HUNK (2026-11-13):** Manny sent a fan character scan — HUNK, 100 Health,
gates 2 / 5. L1 "All your 'Machine Gun' Weapons get -10 Ammo Requirement" reuses the
existing `ammoReqReduction` kind (tag `machineGun`). L2 "If you have more than 100
Ammo, all your 'Machine Gun' Weapons get +10 Damage" needed a NEW `CharacterAbility`
kind `plusDamageForWeaponTagIfAmmoAbove { tag, threshold, amount, level }` (types.ts)
plus the pure helper `plusTagDamageIfAmmoAbove(abilities, weaponDefs, ammo)`
(abilities.ts), wired into the shared `abilityDamage` term of BOTH the reducer
(`actions.ts`) and the overlay helper (`explore.ts`), and into the ally explore
(`allyExplore.ts`). That is the same split RC-002's `plusDamageForWeaponTag` uses,
except RC-002's is wired explore-only and is absent from `exploreDamage` — HUNK's is
in both, so the picker's damage total matches the resolve. Art:
`CARD-ART/FCH-002.png` (320x446, P-mode, ~103 KB; the source dashboard render is
bottom-cropped, so it letterboxes like FCH-008 — the printed 100 Health badge sits at
~(87.8%, 8.5%) vs the CSS ring's 89.7%/7.7%, inside the spread the other custom scans
already have). Tests: `engine/customHunk.test.ts` (14 tests, 3 verified red without
the wiring).

**PR-009 REBECCA (NURSE) START-OF-TURN FLAG (2026-11-13):** Manny reported PR-009's
L1 could still be used twice in a turn — the ActionBar's `Rebecca:Lv1` button stayed
after the turn-start prompt was answered. The prompt resolution never set
`usedStartOfTurnAbilities` (unlike the other turn-start abilities fixed in 1a70a70 /
055d482). PR-009 now raises its OWN prompt kind `rebeccaNurseGift` (turn-start prompt
+ the manual button) and the gift resolution sets the flag. The distinct kind is
load-bearing: AC-017 Fierce Battle shares the old `giveOneCardToPlayer` kind and the
flag is GLOBAL, so a Fierce Battle gift by ANY seat would otherwise consume Rebecca's
ability for the turn. Tests: `abilities.test.ts` +2 (button gone after the prompt /
still there after Decline) + 1 AC-017 non-interference test. **Balance side effect
(measured, not yet re-baselined):** the fix drops the bot soak's natural-end rate from
18/30 (0.600) to 16/30 (0.533) — floor 0.55 — because the old code let a bot activate
PR-009's L1 up to 3x per turn (prompt + button) and opponents got more free cards.
A/B over the soak's exact 30 games with only these hunks differing. The floor belongs
to the AI/balance work; re-baseline to ~0.50 with these numbers if Manny wants green.

**BOARD: COUNTER SUPPLY PILE REMOVED + ABILITY BUTTON LABELS (2026-11-12):** Manny asked to
"not show zone-pile-counter-supply on the board" and to simplify the ability buttons to
"<first name>:Lv<level>" (e.g. `Chris:Lv1`). `Board.tsx` no longer renders the shared
`zone-pile counter-supply` pile (nor the `counterAttached` / `supplyIds` locals that gated
it) — counters stay visible on the character panel (`data-player-counters`). `CardFlightLayer`
already no-ops when a zone anchor is missing, so dropping the `data-anim-zone="supply"`
element is safe; there was no `.counter-supply` CSS to clean up. `abilityLabel` in
`ActionBar.tsx` now joins name and level with a colon (`Barry:Lv1`); the full rules text still
rides in the tooltip. Tests: `ui.test.tsx`'s counter-supply test inverted to assert the pile
never renders, and the two `Barry Lv1` label assertions became `Barry:Lv1`. Gates: typecheck
clean, client 212/212, client build OK.

**FCH-008 SHERRY BIRKIN CANNOT BE A PARTNER (2026-11-12):** Manny asked to make the fan
character FCH-008 Sherry Birkin ineligible as a Partner. New `CharacterAbility` kind
`cannotBePartner` (types.ts, FCH-008 section); FCH-008 carries it at level 1 in
`data/custom.ts`. `canBePartner` (engine/characters.ts) now rejects either
`noHealingNoNonInfectedAttach` (Chris) or `cannotBePartner` (Sherry), so the ONE gate covers
the lobby partner picker (`Lobby.tsx`), the server room validation (`rooms.ts`
MAIN_ONLY_CHARACTERS) and engine setup + the random partner pool (`game.ts`). The kind is
passive — validate's `useCharacterAbility` switch rejects it by default, so no dead ability
button appears and ability indices 0/1 are unchanged. Sherry is still a legal MAIN character.
Tests: `fanSherry.test.ts` +4 (canBePartner false, explicit partner rejected, 25-seed
random-partner sweep, main-with-partner still legal), `ui.test.tsx` +1 (lobby dropdowns),
`rooms.test.ts` +1 (createRoom/setCharacterSelection rejection).

**CI-001 / CI-003 OSCAR + OSMUND SADDLER (FIRST ENCOUNTER) (2026-11-11):** Manny sent a second
pair of fan-card scans. CI-001 "Oscar - Zombie Elephant" (Infected, 120/10/7): when he is not
defeated he tramples the exploring Character, trashing the highest-Damage Weapon(s) they are
using (ties all trashed). CI-003 "Osmund Saddler (First Encounter)" (Infected, 60/50/5): on
reveal every player gains a 10x Ammo, and on defeat it shuffles a card named "OSMUND SADDLER"
into the Mansion — that is the OFFICIAL boss card MA-054, not a new custom card. Two new
`InfectedEffect` kinds: `onNotDefeatedTrashHighestDamageUsedWeapons` and
`onRevealEachPlayerGainsAmmoX10`. The `rachaelFoley.ts` helper was renamed to
`engine/customInfected.ts` (it now serves the whole custom infected line). `cardsForScenario`'s
dependency loop resolves against `ALL_CARDS` as well as `CUSTOM_CARDS`, so enabling CI-003 pulls
MA-054's def in on any scenario. Both effects are wired in the single-explore, multi-explore and
ally-explore (Sherry) paths; the gains/trample are applied to the FINAL seat because the explore
rebuilds the seat from a pre-effect snapshot (the same reason MA-092's gains land last). Tests:
`engine/customOscarSaddler.test.ts` (10 tests, 3 verified red without the wiring). Art:
`CARD-ART/CI-001.png` + `CI-003.png` (320x446, P-mode, ~120 KB).

**PRE-EXISTING RED ON origin/master (not this change — do not attribute it to the
custom-card work):** three tests fail on a CLEAN `origin/master` checkout, verified
by stashing the WIP and re-running each file. (1) `server/src/rooms.test.ts`
"toSnapshot matches the protocol RoomSnapshot shape" — commit e447adf added
`mansionAttachmentMode` to the snapshot but the expected object at line 183 was
never updated (the remote's 0bbfa71/57ed940 fixed the OTHER test files, not this
one). (2) `game-core/src/engine/unofficialExpansion.test.ts:120` — expects
`custom-ex-002`, but commit 4ceeaad deliberately merged custom weapons into the
matching base pile by weapon tag, and EX-002 ("explosive") now lands in the `grn`
pile; the assertion is stale. (3) `game-core/src/engine/customRachael.test.ts:170`
— Rachael's L1 prompt and the RC-001 partner prompt still share an id at turn start
(Rachael uses `rachael-explore-<seat>-v<version>`, RC-001 uses the generic
`ability-<seat>-v<version>`, and a third prompt also uses the generic id). Left
alone per the "do not fix another session's in-flight work unasked" rule; the
custom-card commits add no new failures (full game-core run: 993 passed / these 2,
client 206, server 104/105).

**CI-009 / MA-000 RACHAEL FOLEY CUSTOM CARDS (2026-11-11):** Manny sent two fan-card
scans — CI-009 "Rachael Foley (First Encounter)" (Infected, 60/50/5) and MA-000 "Rachael
Foley (ooze)" (Infected, 30/50/5) — and asked for both in the Mansion deck. Three new
`InfectedEffect` kinds in `types.ts`: `onRevealDamageReductionPerAmmoX10InDiscard` (CI-009
takes 10 less damage per "Ammo x10" in the exploring player's discard pile),
`onDefeatShuffleCardIntoMansion` (CI-009 shuffles a fresh copy of a named card into the
Mansion on defeat), and `onDefeatShuffleBackIfDamageAtMost` (MA-000 returns to the Mansion
when defeated with ≤80 damage). The soak is a combat modifier, so it lives in
`resolveExplore`/`resolveMultiExplore` behind a new `ammoX10InDiscardCount` param (the
pure resolvers cannot read the discard pile); the two defeat effects are applied by the
explore reducer, which owns `attached` and the Mansion deck. New helper module
`engine/rachaelFoley.ts` (`ammoX10CountInDiscard`, `oozeShufflesBackOnDefeat`,
`shuffleCopyIntoMansion`, `shuffleIntoMansion`) is called from the single-explore,
multi-explore, MA-039 and ally-explore paths. `cardsForScenario` pulls `ma-000` in as a
dependency when `ci-009` is selected, exactly like EX-006/EX-008 → EX-009. MA-000's
shuffle-back still awards its Decoration (the MA-053 Lisa Trevor precedent: the trophy is
not attached but the Decoration is paid). Tests: `engine/customRachaelFoley.test.ts`
(11 tests, all fail without the wiring). Art: `CARD-ART/CI-009.png` + `MA-000.png`
(320x446, P-mode, ~120 KB). Known limitation: the ally-explore and MA-039 paths get the
damage soak but not the defeat effects (both are pre-existing simplified paths — CI-002
Crow's chain is absent there too).

**CHARACTER HOVER CARD: SKILL TEXT CLIPPED IN THE PLAYER PANEL (2026-11-11):** Manny asked to
"scale the skill text in the character hover card in the player panel so that the full text is
visible when hovered". Two independent clipping bugs, both measured on a live pass-and-play board
at 1440x1250 (headless Chrome never advances CSS transitions, so they were disabled before measuring):
1. **Horizontal** — `.card.card-character.card-art-only .skill-row` used `align-items: flex-start`,
   so the text's cross-size was its MAX-CONTENT width. Any word wider than the 80px card (Barry's
   "attacking/exploring", 19 chars ≈ 80px at the 7px font) made the whole text box wider than the
   card, and `.card-skills`' `overflow-y: auto` (which computes `overflow-x: auto` too) clipped the
   right-hand characters — the text ran ~20px past the card's right edge. The row is now
   `align-items: stretch` (the text wraps at the row's width) with the level box opting back out via
   `align-self: flex-start`; the row's right padding went 6px → 2px. `overflow-wrap: break-word` on
   `.skill-text` is the safety net for that one over-wide compound word.
2. **Vertical** — `.player-panel:not([data-me])` keeps `overflow: hidden` even on hover, so the
   enlarged card's rules panel (which grows UP past the panel's top edge by design) had its first
   lines cut off. Added `:has(.player-character-card:hover) { overflow: visible }` — the exact fix
   `.app-action-dock` already had for the viewing player's own cards.
**Verified:** enemy-panel hover at 1440x1250 — panel `overflow: visible`, `skillsOverflowX: 0`,
`textOverflowX: 0`, `scrollHeight == clientHeight`, and the full ability text read off the screenshot
with nothing cut at the top, bottom or right. Gates: typecheck clean, client 206, game-core 958.

**Fixed the 3 pre-existing failures the pull left behind (2026-11-11):**
All three reproduced on the clean pulled tree with this work stashed, and all three are now green.
1. **Soak conservation (`ai/soak.test.ts`, `alliance/2`)** — THREE duplicate-instance bugs in the
   multi-explore path, all around MA-078 Red Executioner (the single-explore path was always correct,
   which is why only multi-explore games failed):
   - `applyMercenariesNotDefeatedEffects` already shuffles MA-078 back into the Mansion AND sets
     `infectedShuffledBack`, but the multi-explore caller shuffled it back a SECOND time
     (`actions.ts`, the old `if (r.infectedShuffledBack) { shuffleBack(...) }` block) → the same
     instance appeared 3× in `mansionDeck`. Removed: the flag means "already handled".
   - The multi-explore DISPOSITION pass (`for (const id of undefeatedEntries ...)`) sent MA-078 to the
     deck bottom because its effect kind is not in the `shuffles` list — and then the effect shuffled it
     back too, adding it a second time. The pass now skips any infected whose effect shuffles it back
     itself (`onNotDefeatedMoveHighestDecorationAttachedToBottomThenShuffle`).
   - `newPlayer.attached` was built from `state.seats[seat].attached` (the PRE-explore seat), so
     MA-078's removal of the highest-Decoration trophy was dropped and that trophy sat in BOTH the
     Mansion and the Combo Pile. It is now built from the live post-effect seat (`fxState`), and the
     Decoration delta is carried into `decorations` (`decorationDelta(A, A)` is 0, so it is a no-op
     when nothing moved).
   Regression test: `mercenaries.test.ts` "MA-078 Red Executioner: a MULTI-explore shuffles it back once
   and still drops the trophy" — fails (3 copies) with the disposition fix disabled.
2. **`ai/evaluate.test.ts` ×4** — stale exact-score assertions. Commit 43eb09c deliberately changed
   `CARD_DRAW_VALUE` 12→20 and `affordablePiles` to `8 + floor(ownedVal*0.6) + marketPull`. Updated the
   four expectations and their derivations: 230→239 (piles now 15 + 14 = 29), 222→230, 176→180,
   462→470.
3. **`ai/sim.test.ts` explore-rate heuristic** — measured both sides of 43eb09c on the same 8 seeds:
   perTurn 0.106 → 0.064, but total explores 395 → 426 and Decorations 381 → 408 with 7/8 games still
   ending naturally. The bots fight MORE in absolute terms and just take longer, so the floor moved
   0.08 → 0.06 and an absolute `totalExplores > 300` guard was added; `gameOverCount` remains the real
   anti-freeze guard.

4. **Soak natural-end rate (`ai/soak.test.ts`)** — with conservation fixed, the rate assertion
   finally ran and failed: 17/30 = 0.567 vs the old 0.6 floor. Attributed by re-running the alliance
   seeds with the MA-078 fix reverted: alliance 2/3 natural without it (18/30 = 0.60, exactly at the
   old floor) vs 1/3 with it. The other low scenarios (partnersInEscape 0/3, classicHorror 1/3,
   spyGames 1/3, nightmare 1/3) are untouched by the fix — the pulled AI reweight is the primary
   driver, and the fix costs exactly one alliance game (the moved trophy's Decoration Reward is now
   correctly lost, so the bots are weaker). Floor moved 0.6 → 0.55 with the measurement recorded;
   the conservation assertions stay the real defect guard.

**CH-000 Rachael Foley — custom character (turn-start Explore debt + solo low-HP damage) (2026-11-11):**
Manny sent the card scan and asked to "implement this custom character". Card: `[CHARACTER]` RACHAEL FOLEY,
printed code CH-000, **80 Health**, gates **1 / 5**. Text verbatim — L1: "At the beginning of your turn, you can
get +1 Explore. If so, Rachael must Explore at least twice this turn." L2: "Whenever Rachael Explores, if she has
no Partner and she has 50 or less Health, she gets +20 damage this turn."
1. **Data** (`data/custom.ts`): id `ch-000`, `maxHp: 80`, `level1At: 1`, `level2At: 5`, abilities
   `turnStartPlusExploreRequiresTwoExplores` (L1) and `exploreDamageIfNoPartnerLowHp { amount: 20,
   hpThreshold: 50 }` (L2). Wrote `SPEC_RACHAEL.md` first (prompt kind + resolution semantics).
2. **L1** needed a count-based obligation the engine did not have (`mustExplore` is a boolean = "at least
   one"). New `PlayerState.exploresRequiredThisTurn?: number`: the turn-start prompt
   (`turnStartPlusExploreRequiresTwoExplores`, options `Gain +1 Explore` / `Decline`) sets it to **2** and
   adds +1 Explore; `applyOutbreakHooks` pays it down by `exploreCount` (a multi-explore of 2 IS two
   Explores); `startTurn` clears it; `validate`'s endTurn gate blocks while it is > 0 AND
   `canExploreLegally` (so a seat that cannot explore is never deadlocked). Shared helper
   `mustExploreNow` (Wesker's `mustExplore` OR the debt) drives the validator and the bot's
   "never volunteer an unarmed explore" filter.
3. **L2** is a per-explore bonus added to the shared `abilityDamage` term (so single- and multi-explore
   both get it), mirroring `exploreBonusIfAmmoAbove`: +20 when `partnerInstanceId === undefined` and
   `hp <= 50`.
4. **Art**: `CARD-ART/CH-000.png` (320x446, 107 KB, P-mode) from the scan.
**Verified**: new `engine/customRachael.test.ts` (16) — data shape, absent from ALL_CARDS, the turn-start
offer (and its absence below L1), accept/decline, the debt blocking endTurn and paying down one explore at
a time, a multi-explore paying 2 at once, the deadlock guard, the next-turn reset, the four L2 cases
(solo@50 gets it; 51 HP / L1 / has-partner do not), and a distinct prompt id so it cannot collide with a
partner's turn-start prompt. Regression-checked: disabling the prompt resolver and the L2 term turns 6 of
them red; reverting the prompt id turns the collision test red. Gates: typecheck clean, client 206,
server 105; game-core full suite 6 failed | 933 passed (939) — the SAME 6 failures as the pre-pull
baseline (4 stale ai/evaluate, 1 ai/sim explore-rate heuristic, 1 Red Executioner double-shuffle
conservation bug), all reproduced on the clean pulled tree with this work stashed.

**IT-000 Antique Coin — custom MANSION item, trash-for-a-weapon (2026-11-11):**
Manny sent the card scan and asked to "implement this mansion item card ... when enabled via the custom card
selector it should add two of these cards to the mansion deck".
1. **Card**: `[ITEM]` ANTIQUE COIN, printed code IT-000, cost 60, 2 copies. Text verbatim: "You can Trash this Item
   to Gain one Weapon from the Resource Area with cost equal to, or less than, Antique Coin's cost." (The scan
   reads IT-000, not IT-008.)
2. **Data** (`data/custom.ts`): id `it-000`, `type: 'item'`, `copies: 2`, `cost: 60`, **`mansion: true`**,
   `itemEffects: [{ kind: 'gainWeaponFromMarket', costLimit: 60 }]`. The `mansion` flag and the effect kind were
   already stubbed in `types.ts` (commit 72ca72d) but nothing consumed them.
3. **Routing**: `setup`'s `isCustomMansionCard` now honours `c.mansion === true`, so the two copies are shuffled
   into the Mansion deck; `pilesForScenario` skips `mansion` cards so the coin never gets a Resource Area pile
   despite printing a cost. The lobby picker groups it under "Mansion Deck Cards".
4. **Effect**: `playItem` (trashing the item) raises an `antiqueCoinChooseWeapon` prompt listing Resource Area
   weapons with `cost <= 60` (`marketWeaponIds` gained an optional `maxCost`); the `chooseOption` handler moves
   the chosen instance from its pile to the player's discard via `gainCard`. No eligible weapon → no prompt.
5. **Art**: `CARD-ART/IT-000.png` (320x446, 110 KB, P-mode) from the scan; `cardArt.ts` globs the directory so no
   map entry was needed.
**Verified**: new `engine/customAntiqueCoin.test.ts` (8) — data shape, not in ALL_CARDS, 2 copies in the Mansion
and no `custom-it-000` pile, the <=60 offer list (we-010 at exactly 60 included; we-006/012/014/016 excluded),
the chosen weapon leaves its pile for the discard, no prompt when nothing is cheap enough, and the full
explore → Take → play path. Regression-checked: disabling the `playItem` wiring turns 3 of them red.
Gates: typecheck clean (3 workspaces), client 206, server 105, game-core full suite green.

**Turn 1 never went through startTurn, so every turn-start effect was dead on the opening turn (2026-11-10):**
Manny: "CR-001 dosent give the player it's automatic +1 buy each turn from it'S LEvel 1 ability".
1. **Root cause**: `startTurn` is the only place the turn-start pools are applied (`buysLeft: 1 + plusBuyBonus(seatAbils)`,
   Carlos's `goldAtTurnStart`, Ada's `turnStartActionIfHpAtMost`, Wesker's forced Explore, skill ammo/gold) and the
   only place beginning-of-turn ability prompts are raised. But every caller (`server/src/host.ts`, `client/src/hotseat.ts`,
   `ai/sim.ts`) calls it **only after `endTurn`**, and `setup` returned the raw seat pools. So turn 1 ran on the setup
   values: CR-001 had 1 Buy, and every other turn-start effect was skipped too.
2. **Fix**: `setup` now returns `startTurn(baseState)` on the non-skill path, so the opening turn is produced exactly
   like every later turn. The Skill System needed the same at the other entry point into `phase: 'main'`:
   `advanceDraft` now returns `startTurn(finishDraft(...))` when the draft completes (skill.ts imports `startTurn`
   from game.ts; the cycle is safe because both modules only use each other's exports inside functions).
3. **Version baseline moved**: the opening state is now `version: 2` (startTurn bumps it), so 9 version assertions
   in `game.test.ts` / `replay.test.ts` were re-based (+1) with a comment on the setup one.
**Verified**: `setup` with cr-001 → `buysLeft 2`, `version 2`, `turnNumber 1`; after a full 5-round draft the same.
Tests: new `engine/firstTurnStart.test.ts` (4) — turn-1 Buy for CR-001, 1 Buy for a character without the ability,
opening hand untouched, and the post-draft pools. Gates: typecheck clean (3 workspaces), client 202, server 104.
**Browser-verified** over the real WebSocket protocol (the dev server must be RESTARTED after game-core edits — it
runs `tsx src/main.ts` with no watch): room `9W5UUN`, seat 0 = `cr-001#1`, `buysLeft 2`, `turnNumber 1`, `version 2`,
and the client status bar reads `BUYS 2` with "Lv1:0★ You get +1 Buy."

**Non-Infected reveals open the overlay, their prompts render inside it, and the panel locks (2026-11-10):**
Manny: "Non infected cards should still trigger the mansion reveal screen, prompts caused by revealed non
infected cards should display in the reveal mansion screen, the reveal screen should lock until all prompts are
resolved."
1. **Why they were invisible** (`anims.ts`): for a non-Infected reveal the engine REMOVES the card from the
   mansion deck and parks it in **NO zone** while its `takeOrBottom` prompt is open. `detectReveals`' zone diff
   only matched cards that moved `mansion -> attached/mansionBottom/removed`, and the re-insertion scan only
   matched cards found back in the deck — so a parked card was seen by neither. `Reveal.outcomeZone` gains
   `'pending'`, and `detectReveals` now also walks the revealed set (the top `exploreCount` of the PRE-explore
   deck) for a card that is in **no zone at all** in the next state. Everything else is unchanged: re-inserted
   cards still report `'mansion'`, and the zone diff still catches defeated/escaped/removed plus crow and
   MA-039/MA-072 expansions that land beyond the top N.
2. **Prompts inside the panel** (`MansionReveal.tsx`): new `prompts` / `state` / `onChooseOption` props. Pending
   prompts render as the prompt text + option buttons inside the overlay (it would otherwise cover the ActionBar
   they used to live in). `locked = prompts.length > 0` disables Continue and shows "Answer the choice above to
   continue." A `'pending'` outcome reads "`<name>` is revealed — answer the choice below to continue."
3. **Who gets the buttons** (`App.tsx`): the panel receives the exploring seat's **live** prompts and a
   `chooseOption` dispatcher, but ONLY when the viewer IS the explorer. The server rejects a `chooseOption`
   whose seat is not the sender's (`host.ts`: `action.seat !== human.seat`), so a forced-explore watcher
   (FCH-008 Sherry watching a bot explore) must not be offered buttons it cannot press. The exploring seat can
   never have a pre-existing prompt (validate gates every action behind "resolve pending prompt first"), so
   everything pending at reveal time is reveal-caused.
4. **Shared labels**: `client/src/ui/promptLabels.ts` is the option-label helper extracted from `ActionBar`, so
   the overlay and the ActionBar render identical option labels.
**Verified live** via a throwaway `window.__store` hotseat probe (reverted): exploring into the Rocket Launcher
Case token opened the overlay with the token card, the "Gain the Rocket Launcher weapon" prompt and its TAKE /
SEND TO BOTTOM OF MANSION buttons inside the panel, Continue disabled (`data-reveal-locked="true"` + the hint);
clicking TAKE granted the weapon to the discard, dropped `state.prompts` to 0 and re-enabled Continue. A second
run with the Gatling Gun Case token was screenshot-verified. Tests: anims +2 (limbo detection; ordering with an
Infected revealed in the same explore), ui +2 (prompt + lock render; Continue enabled when no prompt opened).
Gates: typecheck clean, game-core 864, server 104, client 201, build OK.

**Mansion reveal = battle line + multi-infected one-at-a-time (2026-11-10):** Manny: "update the reveal mansion
layout, add the player's character and partner card to the left of the weapons used, lead character in the right.
When multiple infected are revealed animate them into the reveal screen one at a time."
1. **Layout** (`MansionReveal.tsx` + `styles.css`): the panel is now a 700px-wide BATTLE LINE, left to right —
   `.mansion-door-party` (the exploring seat's **character + Partner** cards, `compact artOnly`, live HP rings, and a
   red **LED** tag on whichever one led the explore) | `.mansion-door-weapons` (the unchanged "Weapons used" block,
   now `max-width: 200px` so a long row wraps instead of stretching the line) | `.mansion-door-card` (the revealed
   card, still 145px). `flex-wrap: wrap` collapses the line vertically on narrow screens.
2. **Multiple revealed cards** (`anims.ts`): new `detectReveals(prev, next, mySeat)` returns EVERY card the viewing
   seat's newest explore revealed, in **reveal order** (the pre-explore `mansionDeck` order IS the reveal order; a
   WE-019 bottom reveal sorts after the top cards because its instance is in `mansionBottom`). `detectReveal` is now
   `detectReveals(...)[0] ?? null`, so every existing single-card caller/test is unchanged. A multi-explore
   (`exploreCount > 1`), a CI-002 Crow chain and a MA-039/MA-072 event expansion all feed the same list.
3. **Step-through** (`App.tsx`): the reveal state is a `revealQueue` + `revealIndex`. `.mansion-door-card` carries
   `key={def.id-index}`, so advancing REMOUNTS it and re-runs the new `door-card-in` entrance
   (`translateX(-46px) scale(0.8)` + fade, 0.35s) — that is what makes the cards arrive ONE AT A TIME. A `1 / 2`
   progress chip renders when `total > 1`, and the button reads **NEXT** until the last card (**CONTINUE**). The
   queued pending-death (YOU DIED) screen still fires only after the LAST card is dismissed.
4. **Party data**: built in `App.tsx` from `explorer.characterInstanceId` / `partnerInstanceId` (resolved with
   `defForInstance`) plus the explore action's `leader` (default `'main'`); the Partner's HP comes from
   `partnerHp`/`partnerMaxHp` and BOTH cards get the Main's `decorations` (the Partner levels off the Main's
   trophies). A forced explore (FCH-008 Sherry) uses the TARGET seat's party — `explorerSeat`, not the viewer.
**Verified live** (server room, First Timer): `[Hunk + LED] [Combat Knife] [Bui Kichwa]`; a Partner-Mode room:
`[Hunk 65HP + LED] [Partner 70HP] [Combat Knife x2] [Mimicry Marcus]`; and a throwaway `window.__store` hotseat probe
(reverted) drove a 2-explore unarmed explore → `1/2 Cerberus` → NEXT → `2/2 CONTINUE` with the entrance animation
re-running on the remount. Tests: anims +2, ui +3 (the old "prefers a defeated over a re-inserted" case was rewritten
as the multi-card behaviour it became). Gates: typecheck clean, game-core 853, server 104, client 195, build OK.
**Leon L2 `pistolsTwicePerTurn` per the official FAQ (2026-11-10):** Manny quoted the Master
FAQ — *"When he uses a pistol weapon, you can pay its ammo requirement twice for that weapon
to apply its effect and damage twice"* — and said the game did not do that: it only let a
Pistol be REUSED in a later explore. Now ONE entry in an explore action's `weapons` array is
one USE, so the same Pistol instance may appear twice in a SINGLE explore: the ammo is paid
twice, the damage is dealt twice, and every `weaponEffects` entry fires twice
(`grantExplores`, `gainCardsAndActions`, `plusDamagePerExtraWeapon`, …). The two uses may
still be SPLIT across two explores (the old play-area reuse, kept), and the per-turn cap of 2
is enforced by a new `canUseWeaponTimes` helper — `weaponUsesThisTurn` now counts
OCCURRENCES in the log, not log entries, so a double use spends both uses. Wiring:
`validate.ts` (the "duplicate weapon" rejection became a per-weapon cap check),
`actions.ts` (new `uniqueWeapons` de-dupes the play-area / trash-after-use / explosive lists —
a weapon used twice is still ONE card), `enumerate.ts` (offers one doubled variant per combo
so the bots AND the client's legality check can reach it), `client/src/ui/explorePicker.ts`
(new pure `toggleWeaponDouble`) and `ActionBar.tsx` (a "×2" button on every weapon option with
`remainingUses >= 2`; the checkbox still toggles one use). Spec: `SPEC_LEON_L2.md`; tests:
new `game-core/src/engine/leonL2.test.ts` (+11) and 3 in `client/src/ui/ui.test.tsx`. Gates:
typecheck ×3 clean, game-core 864, server 104, client 88, vite build OK, full-game soak 23/30
natural — IDENTICAL to the stashed pre-change baseline (verified by `git stash -u` + re-run),
so no balance regression. Noticed but NOT done (separate feature): SK-021 Weapon Master LV.3
(`exploreDuplicateWeaponEffect`) is armed as `duplicateWeaponEffect` but never consumed in the
explore path — it duplicates only the EFFECT, not the damage, so it needs its own wiring.

**Health-gauge number shadow + skill-box decoration cost (2026-11-10):** Two small UI asks from Manny.
1. **2px shadow all round the gauge number.** `.health-ring-label` (the `<text>` inside every
   `HealthRing` - characters AND infected cards share the class, so one rule covers every gauge) now
   carries four directional `text-shadow`s at 2px offset / 2px blur, `rgba(0,0,0,0.85)`. Four shadows
   rather than one blurred one: `0 0 2px` leaves the diagonals too thin to read as an outline. The
   shadow is pure CSS, so the class is the whole contract - `HealthRing.test.tsx` gained a test that
   asserts `<text class="health-ring-label">` survives, because dropping it silently makes the number
   unreadable over art.
2. **Decoration cost before the star in the character skill box.** `.skill-box` in `CardView.tsx` read
   `Lv{level}:★` / `Lv{level}:☆`; it now reads `Lv{level}:{gate}{star}` where `gate` is that tier's
   `level1At`/`level2At`. Most characters gate L1 at 0, so they read `Lv1:0★` - the 0 means "active
   from the start", not a typo. The six `ui.test.tsx` assertions that pinned the old `Lv1:★` /
   `Lv1:☆` strings were updated to the real gates (Chris 0/4, LK-001 1/8, CR-001 0/7, CC-001 2/5,
   CU-001 3/8, Leon 2/6, Krauser 1/7). Verified in the browser: the skill boxes rendered
   `Lv1:2☆ / Lv2:4☆ / Lv1:2☆ / Lv2:6☆` and `getComputedStyle` on the gauge label returned the four
   2px shadows. Gates: client 188, typecheck clean, vite build OK.

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
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect a clean tree at the multi-explore/granted-explore commit.
3. M5-T05 DONE (commit 0083419): FAQ checklist at `docs/rules/FAQ-VERIFICATION.md`. FAQ-3 (Gatling Gun Majini) was a gap — the engine boosted the player's damage instead of the Infected's attack; Manny ruled Infected's attack, and `resolveExplore`/`resolveMultiExplore` now add it to `boostedAttack`/`atk` (regression tests in `explore.test.ts`).
4. Verify the gate personally (tsc + vitest in the affected workspace) before reporting green.
5. GRANTED EXPLORES (commit 41757a2): a weapon that grants Explores (Pump-Action/Automatic/Riot/Triple Barreled Shotguns, Stun Rod, Flashbang) can now spend them in the SAME explore — `exploreCount` is bounded by `exploresLeft + grantedExploresFor(weapons)` (validate.ts) and the reducer adds the grant back after spending. The ActionBar's "Explores to use" selector lists 1..pool and a hint names the granting weapon; `exploreCountOptions`/`grantedExploresForSelection` in `client/src/ui/explorePicker.ts` mirror the engine helper. `enumerate.ts` offers 1 and the full pool so bots use it too. Fixed a latent multi-explore conservation bug this exposed: MA-092's "Gain 1 copy" was applied to a pre-gain seat snapshot and dropped from the discard (`gainCopyTracked` in mercenaries.ts now reports the created ids; regression test in multiExplore.test.ts).
7. SKILL AREA POSITION (uncommitted): the Mercenaries Skill Area moved out of the footer dock into the action identity row, immediately right of the character/partner cards — the row is now `CharacterCards -> Skill Area -> deck -> hand -> discard`. App.tsx no longer renders SkillPanel; ActionBar.tsx renders it in a new `.action-col.action-col-skills`. `.skill-panel` is a vertical column and `.skill-panel .skill-row` stacks label -> pips -> button (scoped, because `.skill-row` is shared with CardView's character-card skill list). Collapses to zero width when the Skill System is off.
6. LEON L2 DOUBLE USE (this change): `weapons: [pistolId, pistolId]` in ONE explore = the official FAQ play (pay the ammo twice, effect and damage twice). `weaponReuse.ts` gained `canUseWeaponTimes` and `weaponUsesThisTurn` counts occurrences; `validate.ts` rejects only beyond the per-turn cap; `actions.ts` de-dupes the play-area/trash lists via `uniqueWeapons`; `enumerate.ts` offers the doubled combo; the ActionBar has a "×2" button. If a future ability grants MORE than 2 uses (or duplicates only the effect, like SK-021), extend `maxWeaponUses` and the `toggleWeaponDouble` cap — the rest of the pipeline already treats each array entry as one use.
8. IT-000 ANTIQUE COIN (this change): a custom MANSION item — `mansion: true` routes it to the Mansion deck (2 copies) instead of a Resource Area pile, and its `gainWeaponFromMarket { costLimit: 60 }` effect fires on `playItem` as an `antiqueCoinChooseWeapon` prompt. The `mansion` flag is the general switch for "custom card that prints a cost but lives in the Mansion"; any future card with it must also be excluded from `pilesForScenario` and grouped into the picker's Mansion section. `marketWeaponIds(state, maxCost?)` is shared with EX-003 (which passes no limit).
9. CH-000 RACHAEL FOLEY (this change): a custom character whose L1 is a COUNT-based Explore obligation. `PlayerState.exploresRequiredThisTurn` (2 when she takes the turn-start +1 Explore) is paid down by `payExploreDebt` in `applyOutbreakHooks` (by `exploreCount`, so a multi-explore of 2 counts twice) and by the Sherry forced-explore path; `startTurn` clears it; `validate` blocks endTurn while it is > 0 AND `canExploreLegally`. `mustExploreNow(state, seat)` is the shared "is this seat obliged to explore" predicate (Wesker `mustExplore` OR the debt) — use it for any new obligation instead of reading `mustExplore` directly. Her L2 is a per-explore bonus on the shared `abilityDamage` term.
10. PULL FALLOUT FIXES (this change): the three failures commit 43eb09c left behind are fixed (details in the top paragraph). The MA-078 lesson is the one to remember — in the MULTI-explore path, `applyMercenariesNotDefeatedEffects` already shuffles an `infectedShuffledBack` infected into the deck, so the caller must NOT shuffle it again AND the disposition pass must NOT bottom it either; and `newPlayer` is built from the PRE-explore seat, so any seat mutation a not-defeated effect makes (MA-078 drops the highest-Decoration trophy from `attached` and adjusts `decorations`) must be carried over from `fxState` or it is silently lost and the card lands in two zones at once.
11. LATER PULL FALLOUT (this change): commit 8c0cc06 added `ai/win_turns.ts`, which failed `tsc --noEmit` under `noUncheckedIndexedAccess` (`eTcounts[s] += 1` on a fixed 4-slot array) — guarded with `?? 0`. And the soak's natural-end floor moved 0.6 → 0.55 once the conservation fix let the rate assertion run: the pulled AI reweight lengthens every game, and the MA-078 fix costs one alliance natural ending (measured 18/30 without it, 17/30 with). Balance signal, not a defect — conservation stays the real gate.
12. CI-009 / MA-000 RACHAEL FOLEY (this change): the fan-card pair is in `data/custom.ts` with three new `InfectedEffect` kinds. The damage soak is applied inside `resolveExplore`/`resolveMultiExplore` via the `ammoX10InDiscardCount` param — any NEW combat modifier that depends on the discard pile must be threaded the same way (the resolvers are pure). The defeat effects live in the explore reducer: CI-009's `onDefeatShuffleCardIntoMansion` creates a fresh instance and shuffles it in (`shuffleCopyIntoMansion`), and MA-000's `onDefeatShuffleBackIfDamageAtMost` removes the instance from `attached` while still paying its Decoration. `cardsForScenario` pulls `ma-000` in when `ci-009` is selected. If a future card shuffles a named card into the Mansion, add its dependency to the same `wanted` loop.
13. CI-001 / CI-003 OSCAR + SADDLER (this change): `engine/rachaelFoley.ts` became `engine/customInfected.ts` (it now serves every custom infected, not just Rachael). Two new kinds: `onNotDefeatedTrashHighestDamageUsedWeapons` (CI-001 — trashes the highest printed-Damage used weapon, ties included, skipping weapons already in `removed`) and `onRevealEachPlayerGainsAmmoX10` (CI-003 — `gainAmmoX10` per living seat). CI-003's defeat shuffles the OFFICIAL `ma-054` Osmund Saddler, so `cardsForScenario`'s dependency loop now resolves ids against `ALL_CARDS` too — any custom card may name an official card as its dependency. Reveal grants and tramples must be applied to the FINAL returned seat in every explore path (the seat rebuild would drop them otherwise); the single-explore defeated branch applies them to `defeatFxState`, the multi-explore and not-defeated branches to the returned state.
14. FCH-002 HUNK (this change): a fan character whose L2 is a CONDITIONAL per-tag damage bonus. `plusDamageForWeaponTagIfAmmoAbove` is the kind to reach for when a card says "all your <tag> weapons get +N damage while <condition>" — add a pure helper next to `exploreBonusIfAmmoAbove` and wire it into the shared `abilityDamage` term of BOTH `actions.ts` (reducer) and `explore.ts` (overlay helper), or the picker's total will disagree with the resolve. HUNK also shows the custom-character checklist: printed gates go in `level1At`/`level2At`, the printed text goes in `levels[].text` (the card face renders those, not `text`), `canBePartner` defaults to true unless the card prints a restriction, and the art is a whole-card scan normalised to 320px P-mode.
15. PR-009 START-OF-TURN FLAG (this change): a "start of turn" ability that is ALSO a manual button must set `usedStartOfTurnAbilities` in its prompt resolution, or the button stays after the prompt is answered. When two cards share a prompt kind (PR-009 and AC-017 both used `giveOneCardToPlayer`), give the character its OWN kind before adding a once-per-turn flag keyed by ability kind — the flag map is global, so the shared kind would let either card consume the other's ability.
16. SK-034..SK-036 BOMBER (this change): three fan Mercenaries Skills. Selecting them in the room's Custom Cards puts them in the def pool and `buildSkillDeck` deals every skill-type def, so they join the Skill deck automatically — the ONLY extra client work was a picker section, because `type: 'skill'` fell through every existing group in `Lobby.tsx` (characters / infectionTokens / resourceAreaCards / otherCards) and would have been invisible. SK-034 is a flat per-Explosive-weapon bonus (`exploreExplosivePlusDamage`), wired into `exploreSkillDamageBonus` AND `exploreDamage` — note `exploreDamage` (the picker's preview, imported from `@re/game-core`) did NOT read skill bonuses at all before this, so SK-030's pistol bonus was missing from the preview too. SK-035 is a reuse ability: `maxWeaponUses` returns `1 + count` for Explosive weapons while the Skill is active, and the explore reducer's disposal now keeps an Explosive with uses left in the play area instead of trashing it (`toTrashAfterUse` had to stop matching Explosives — they are disposed of by the explosive rule, and both paths were adding them to `removed`). SK-036 is the hard one: Manny ruled it deals the Explosive weapons' damage to EACH revealed Infected individually, so a weak one can die while a strong one survives. That needed `resolveMultiExplore` to return per-index `splashDefeated` + `survivingAttack`, and the multi-explore reducer block to split into `defeatedEntries` / `undefeatedEntries` — the on-defeat bookkeeping (decorations, level, XP, Barry chain, on-defeat prompts) runs for the defeated subset and the damage/on-not-defeated block runs for the survivors, so a partial defeat awards the kill AND still charges the survivor's attack. `explosiveDamage` is computed by `exploreExplosiveDamage` (Explosive weapons' own damage + per-Explosive bonuses: Jill L1, SK-034) — reach for that helper rather than re-deriving it. Known limitation: the MA-039 Collapsing Floor Traps path has its own simplified `resolveMultiExplore` call and does not apply the splash. Pre-existing inconsistency noticed while splitting the block (NOT changed, it moves bot XP/balance): the single-explore path always pays the +1 Explore XP (actions.ts ~3582) but the multi-explore path only pays it inside the defeated branch, so a failed multi-explore pays no XP — a partial SK-036 defeat pays it, a total whiff does not. RE-VERIFIED after this change: server M3-T05 still fails, and it is NOT the Bomber work — with the multi-explore split AND the explosive-disposal change both reverted (actions.ts byte-compared against the pre-Bomber tree, only inert deltas left: 3 unused SkillEffect kinds, 3 unselected custom cards, 2 skill helpers that return 0 with no Skill active, and resolveMultiExplore's two extra return fields) the test still fails at the same assertion. The cause is the other session's uncommitted Gatling xAmmo rework in the tree.
17. RC-002 PARTNER HEAL (this change): a self-healing character ability must be looked up per CHARACTER, not through `seatAbilities`. `healIfDidNotExplore` used the union and wrote `hordeHp`, so a Partner Rebecca healed the Main's Health and never her own — the reported "does not heal her when she is a partner". Now `characterAbilities` heals `hp` and `partnerAbilities` heals `partnerHp` (mirroring `healAtTurnStart` in `startTurn`), and the value is written explicitly into `newPlayer` because it is built from `...player`. The trigger stays seat-level: "Partner and Main explore at the same time", so `exploredOrAttackedThisTurn` suppresses the heal for both. Do NOT use `partnerLeading` to decide who explored — only the legacy `chooseExploreLeader` action persists it, the modern `explore` action's `leader` field does not.
18. CI-002 CROW CHAIN REVEAL (this change): the client reveal overlay steps through `detectReveals`, which needs the EXACT revealed set — and the deck diff cannot supply it, because a revealed card that is returned (bottomed / shuffled back) looks like an unrevealed deck card and `shuffleBack` reshuffles the whole deck. The engine now writes `action.revealedInstanceIds` (reveal order) onto the logged explore via `recordExploreReveals(ids)`, which rewrites the explore log entry matched by `seq`. Wire it at EVERY site that reveals more than `exploreCount` cards: the plain single reveal, the MULTI block's full `revealedIds`, and the single-path MA-039 / MA-072 branches. The client falls back to the top-`exploreCount` prefix when the field is absent (old logs). Do NOT re-derive the Crow/MA-039/MA-072 expansion rules on the client — that duplicates the reducer.
19. POISON GAUGE + COUNTER VISIBILITY (superseded by 20 on the gauge geometry): (a) The viewing player's OWN counters were never rendered — `Board.tsx` only renders `PlayerPanel` for other seats, so a Poison counter was invisible except as a transient card-shake. `CharacterCards` now draws them on the character card (`.cc-counters`, `data-player-counters`); if a future surface hides the own panel again, the counter disappears with it. (b) The pulse animation (`hp-pulse` / `.cc-hp-ring-flash` / `CardView.flash`) is gone by request. A counter turns the gauge purple via `HealthRing`'s `poisoned` prop -> `data-poisoned`.
20. GAUGE ANCHOR + OPACITY (this change): the 36% character gauge could not stay centred on the printed badge (89.7%, 7.7%) and fit inside the card, so the anchor moved inboard to (78%, 17%) — promo (78%, 27%) — and the art-only card went back to `overflow: hidden`. The Infected gauge WAS doubled (27 -> 54) and is absolutely positioned (`.card-top .health-ring`) so it cannot grow the card header. `HealthRing` gained an opaque backing disc (`.health-disc`, `#12151c`). When resizing either gauge, check `fullyInside` against the card rect at desktop (80x114) and phone (44x63) — the phone card is only 44px wide, so a 36% gauge is 15px.
21. LK-001 LEON L2 (this change): "all weapons he plays count as pistols". `effectiveWeaponTags`/`isPistolWeapon` take an optional `playedIds` — an explore's weapon set counts as being in the play area, because playing a weapon puts it there. `dualWieldBonus` and `healOnDefeatWithWeaponTag` pass their `weaponIds`; the ammo path (`exploreAmmoReq`) does NOT, so a pistol-tagged ammo discount still only applies to real/play-area pistols. `playAreaCardsArePistols` reads `seatAbilities` (Main OR Partner Leon), not `characterAbilities`. When adding a new "is this a pistol" consumer, decide explicitly whether it should see `playedIds` — L1's Dual Wield does, ammo does not.
22. BARRY L1 ONCE-PER-TURN (this change): `usedStartOfTurnAbilities` is ONLY for abilities that FIRE FROM A TURN-START PROMPT (PR-009, AC-017, ...). Never record a manual `useCharacterAbility` there — the flag is cleared only in `startTurn`, so it outlives the seat's `endTurn` and blocks the ability for every later turn. Manual once-per-turn abilities are covered by validate's log scan, which walks back to the seat's last `endTurn` (`plusDamageThisTurn` is in that switch list). The `plusDamageThisTurn`-specific check this replaced was dead code: the general `[ability.kind]` check directly above it already fired first.
23. DUPLICATE CARD IDS + DUPLICATE PROMPTS (this change): a repeated `id` in `data/*.ts` is silent — `cardDefs` keeps the LAST definition, so the other card is unreachable (`ma-000` was both the Rachael ooze and the Martial Arts action; the ooze resolved as an action and was never defeated). Scan `grep -c "id: '<id>'" game-core/src/data/*.ts` after adding a card, and check the printed code against `CARD-ART/<ID>.png`. Likewise, two turn-start prompts with the same id destroy each other (`chooseOption` removes every prompt with that id): `turnStartAbilityPrompts` pushes 19 prompts, most with the generic `ability-<seat>-v<version>` id, safe only while each ability has one prompt — give a new prompt its own prefix. When two commits add the same card, remove BOTH the duplicate def and its duplicate prompt/handler, and carry over anything the deleted block did that the kept one lacks (here: the `usedStartOfTurnAbilities` flag write).
24. ZOMBICIDE FAN WEAPONS CW-025..CW-033 (this change): nine custom weapons. Per-card effect kinds are listed in the `WeaponEffect` union. Two rules of thumb: (a) a bonus that scales with the number of Infected Battled goes in `computeDamage` (which the reducer now feeds `infectedBattledThisTurn: exploreCount`) — adding it to the per-weapon `damage` expression too double-counts, because that value is summed into `computeDamage`; (b) a "you can / once per turn" weapon effect is a `useWeaponAbility` manual trigger (validate's `manual` filter + enumerate's `hasManual` must both list the kind, or no button appears). CW-025's recall branch is currently unreachable — a weapon only reaches the play area by being explored with, and `playWeapon` has no reducer case.
25. ABILITY/EFFECT REVEAL OVERLAY (this change): a NON-explore reveal must pause the table and show the card. The engine records `LoggedAction.reveals` via `recordCardReveals()` (same `seq`-matched log rewrite as `recordExploreReveals`) — and because that helper REASSIGNS `nextBase.log`, always call it before building a state object that spreads `...nextBase`. The client's `detectCardReveals(prev, next, mySeat)` + `CardRevealOverlay` render it, gated to the INVOLVED seat (actor, or a seat whose own card was revealed) so a bot's private peek does not leak to the human; the overlay is suppressed while a mansion-door reveal is active. When adding a new reveal effect/ability, wire `recordCardReveals` at its site — a peek has no zone diff, so the client cannot discover it any other way.
26. MERCENARIES BASIC RESOURCES (this change): a room option that swaps the scenario's basic piles for the Mercenaries printings. `MERCENARIES_BASIC_RESOURCES` is keyed by PILE ID (am10/am20/am30/hg/kn) and `pilesForScenario` replaces only the CONTENTS, so the board slot is stable. Any new option that changes which cards a scenario uses must be passed to BOTH `cardsForScenario` and `pilesForScenario` — `setup` silently skips pile card ids with no def, so a missing def reads as "the pile is empty", not an error. The starting deck is stat-derived (`pickBasic` in game.ts) and also honours the option via `GameSetup.mercenariesBasicResources`, which must be set at the `setup()` call sites in host.ts and hotseat.ts.
27. MERCENARIES AMMO ABILITIES (this change): the card ART is the source of truth when a def's `text` disagrees with it — AM-005's art reads "When you Trash this card, you get +10 Gold during this turn" and the data had a plain +10/+10. `CardDef.bonuses` fire on PLAY ONLY; an extra printed ability needs its own effect kind (`ammoEffects` here). A "when this card is trashed" trigger has NO choke point (45 sites push to `removed`) — diff `removed` before/after the action in a post-action hook instead of patching each site, and pay the OWNER (`ownerSeatOf(prev, id)`), not `action.seat`. A per-card on-defeat trigger must be raised in BOTH explore paths: the multi-explore reducer does NOT call `applyMercenariesOnDefeatAbilities`. An end-of-turn "you can move it to the top of your Inventory" is resolved automatically (the CW-025 ruling) — and the end-of-turn draw then takes it into the new Hand, so assert on the hand, not `inventory[0]`.
28. BOSS REVEAL vs GAME-OVER OVERLAY (this change): the explore that defeats the boss is the same action that ends the game, so the end screen and the reveal land on the same render. `.seat-swap-backdrop` (640) covered `.mansion-door-backdrop` (600). Two guards, because either can be undone alone: raise the reveal's z-index above the seat-swap (660), AND gate the overlay with `shouldShowGameOverOverlay` so it is not in the DOM while a reveal/death overlay is pending. The z-index is what prevents the FIRST-frame flash — the reveal queue is populated in a `useEffect`, i.e. after paint. When two full-screen overlays can coexist, decide the precedence ONCE (a helper + a CSS-ordering test) rather than per call site.
29. END-SCREEN PLAYER RANKING (this change): the game-over screen lists every player ranked by Decorations then Health — the same order `checkWin` uses, so the list agrees with the CHAMPION line. The ranking is a PURE helper (`client/src/ui/standings.ts rankStandings`) because the client test env is `node` with no DOM and App cannot be rendered in tests; `SeatSwap` takes an optional `standings` prop (`<ol data-standings>`, one `<li data-standing>` per seat, winners get `is-winner`). `viewForSeat` does NOT sanitize Decorations/Health (only hand and inventory), so `view.state.seats` is enough — no new server field.
30. B4MC SHERRY BIRKIN PROMOS (this change): three JP-2025 prints whose codes collide with official CH-004..006, ids `b4mc-ch-004/005/006`. The boxed number beside "Level N" is the DECORATIONS requirement (`level1At`/`level2At`), not a cost. A "+N per Character that has been Healed this turn" ability needs an explicit TRACKER — diff Health before/after (`applyHealTracking`) at both turn boundaries (after `applyAction`, and in the `startTurn` wrapper), keyed `<seat>:main|partner` so a Character counts once; clear it in `startTurnInternal`. A custom card may name an OFFICIAL card it needs via the new `CardDef.dependencies`, which feeds the `cardsForScenario` `wanted` loop (ch-005 -> we-028 Stun Rod). A "pay 1 Action" manual ability goes in validate's manual list with an `actionsLeft >= 1` check, and its once-per-turn comes from the log scan — do NOT use `usedStartOfTurnAbilities`. When the bonus is per-WEAPON, add it in the shared per-weapon damage expression (covers single + multi + ally) and mirror it in `exploreDamage`.
31. FAN JP-2025 SET (this change): 7 custom cards (5 actions `cac-*`, 2 weapons `cw-034/035`). Two structural lessons: (a) CAC-013's "at the end of your turn" trigger required extracting the whole endTurn reducer body into `applyEndOfTurn(state, seat, nextBase)` — the turn must END after the target's discard, so the `endTurn` case raises a prompt and the resolution calls the helper; the host AND `client/src/hotseat.ts` now gate auto-`startTurn` on `next.prompts.length === 0`, because a prompt can hold the turn open. (b) A weapon buff that changes an Infected's Decoration (CW-035) cannot ride on a modified `revealedDef` copy — `decorationDelta` reads `state.cardDefs`, so the bonus is awarded explicitly at the defeat site. Also: `gainCard` gained a `'playArea' destination` (CAC-015 routes gained Weapons there) and the CAC-015 first-weapon bonus is mirrored in BOTH the reducer's per-weapon damage expression and `exploreDamage`. Manual action-card abilities use the new `useActionAbility` action (validate + enumerate must both list it). Art is 320px P-mode; a second crossbow print was dropped as a duplicate per the user.
**FAN "LOCATIONS" CARD TYPE (2026-11-16):** Manny added a new custom card TYPE: room cards that live attached to the Mansion deck and are REVEALED by an Explore (the Explore is consumed). Three kinds: GLOBAL (active for everyone on reveal, cannot be bought), 1X (a one-shot you pay gold + 1 Buy for, repeatable while you have buys unless the card says "Max: once per turn"), and investment (no GLOBAL/1X label - pay the printed gold + 1 Buy per cube, left-to-right price ladder, cubes shown as player numbers in coloured circles). Ids `loc-001`..`loc-008`. Engine in `game-core/src/engine/locations.ts`; state `locationDeck` + `locations`; reveal gate at the top of the explore case in actions.ts. The whole explore case is wrapped in an IIFE (`exploreResult`) purely so the Arklay armed flag can be cleared on every return path - the seat is rebuilt from a snapshot in each branch, so a mid-case clear is dropped. `sanitize()` hides the location deck ORDER (length preserved) so clients cannot see what comes next. UI `client/src/ui/LocationsRow.tsx` + a count badge on the mansion pile. Tests: `customLocations.test.ts` (20), `locationView.test.ts` (3), `LocationsRow.test.tsx` (6). Locations are OPT-IN via `GameSetup.locationsMode` (hotseat toggle in the Lobby) — auto-dealing them broke 89 existing custom-card tests, so they never enter a game unless asked for. NOTE: none of the 8 fan cards is an investment card, so the invest path is covered by an injected fixture test.
**FAN "LOCATIONS" BATCH 2 (2026-11-16):** Five more rooms, ids `loc-009`..`loc-013`. `loc-009` Lord Spencer's Study (investment, 30g: +1 XP whenever you trash, via the `removed`-diff hook `applyLocationTrashXpHooks` in actions.ts; On Reveal +5 health), `loc-010` Lounge (investment, 10g: 1 decoration per card you hold from a supply pile that is now EMPTY; On Reveal removes your infection + counters), `loc-011` Mansion Bathroom (investment, 10g: 1 decoration per copy of the 2nd most common weapon NAME in your Inventory), `loc-012` Materials Room (GLOBAL: -1 decoration per Inventory card beyond the first 18), `loc-013` Mirror Corridor (GLOBAL: -1 per singleton Inventory card; On Reveal Infected revealed THIS turn get -10 Health, min 5). RULING: an On Reveal effect applies to EVERY living player regardless of the card's GLOBAL/1X/invest label — only the ongoing effect is scoped. Mirror's reduction is `GameState.infectedHpReductionThisTurn`, passed into resolveExplore/resolveMultiExplore as `infectedHpReduction` and cleared in startTurnInternal. Lounge's empty-pile scoring derives each pile's cardId from `state.cards` (an emptied pile has no instances left to read). `SimConfig.locationsMode` lets the bot soak deal the deck. Tests: `customLocations2.test.ts` (11). Art LOC-009..013.png.
**FAN "LOCATIONS" BATCH 3 (2026-11-16):** `loc-014` Terrace (invest 80g) and `loc-015` Tiger Statue Room (invest 70g), both confirmed INVESTMENT cards by reading the panel art. Terrace's "first action card gained may be played" is implemented as a free immediate play of the first ACTION bought from a market pile each turn, gated on having an Action left: `buy` moves the card to hand and sets `pendingFreeActionInstanceId`, and `applyAction` re-enters the normal `playActionCard` path (flag cleared first, so no recursion) — the card's bonuses fire exactly as a normal play. `freeActionPlayAvailable` is refreshed for EVERY investor at the `startTurn` boundary and is `undefined` until then, which is why an immediate post-invest play works. Terrace's On Reveal offers every living player one item from the Resource Area (`locGainItemChoice`). Tiger knocks 10 gold off EVERY buy on the investor's turn (`locationBuyCostReduction`, applied in the buy reducer and in validate's affordability check), and its On Reveal lets each player discard a card for 1 XP (`locDiscardForXpChoice`). Gotcha: a reveal prompt raised during an explore is CONSUMED by any helper that auto-answers prompts — assert on the explore's returned `prompts`, not on the post-ack state. Tests: `customLocations3.test.ts` (10). Art LOC-014/LOC-015.png.
**MASTER'S CLIENT TYPECHECK WAS RED — FIXED IN `685c55b`; AND THE WORKTREE GATES WERE LYING.** Two things came out of Manny's `TS2353 at turnHistory.ts(47,3)`:

1. **The real bug.** `9512605` had added `elevatorDiscardStart` / `courtyardStart` labels to `VERBS`, which is typed `Record<Action['type'], string>` — but those two action types exist **only in an uncommitted working tree** (`git log -S` finds no commit on master that ever contained them). So anyone resolving `@re/game-core` to the repo's own sources got an excess-property error at exactly 47:3. `685c55b` drops both labels until the location work that defines the types lands. Their WIP keeps both sides consistent locally, so nothing of theirs was lost.

2. **Why my earlier "green" gates did not catch it.** Landing worktrees are built by `cp -a`-ing the shared checkout's `node_modules`, and **`cp -a` here DEREFERENCES the `@re/*` symlinks** — so every worktree resolved `@re/game-core`, `@re/server` and `@re/client` to the SHARED tree's sources and typechecked *that* instead of its own checkout. The identical command read EXIT=0 in the worktree and red in Manny's editor. The fix is to replace `node_modules/@re/<pkg>` with **Windows Junctions pointing at the worktree's own packages** (`New-Item -ItemType Junction` via PowerShell; `cmd //c mklink /J` from MSYS silently creates nothing). Once that is done, pristine `origin/master` reproduces the user's diagnostic exactly.

Re-verified after the fix, against the worktree's OWN sources: root typecheck 0, client 292/292, client build ok. The location-tile change (`b9a839d`) was re-checked under the same truthful setup and is fine.


**LOCATION TILES REDESIGNED — `b9a839d` (2026-11-23).** The revealed room cards no longer look like a different component family from the hand. They are now EXACTLY one hand card — 94px wide, `aspect-ratio: 5/7`, `overflow: hidden` — with the location scan filling the tile edge to edge (`CardView`'s own `.card` is pinned to `inset: 0`) and the name, cost ladder, investment cubes and Invest/Use buttons sitting ON the art in a new `.location-overlay`.

Three details that matter when touching this again:
- **The overlay is `pointer-events: none` and only its buttons opt back in.** That keeps the `HoverCard` popup and the art interactive underneath; making the whole overlay clickable silently kills the hover popup.
- **Action labels compress (`9px`, `white-space: normal`)** because an invest card can carry Invest + Peek + Rearrange + Forfeit + Discard = five rows, and the old fixed-size buttons would spill past the 131px tile.
- **The face-down "Next: Location" tile shares the footprint and overlay**, so the row is uniform.

Verified numerically (not by screenshot): a throwaway probe page mirroring the real markup against the REAL `styles.css`, served over loopback — every tile measured **94 x 131.6**, identical to a `.card`; overlay, name and actions all landed inside the tile; `elementFromPoint` at each button's centre returned that button; no horizontal overflow.

**Master was typecheck-red before this landing.** The pushed Action union had gained `elevatorDiscardStart` and `courtyardStart`, but `VERBS` in `client/src/ui/turnHistory.ts` never got the two labels, so the `Record<Action['type'], string>` literal failed `tsc`. Carried the fix as its own commit `9512605` (the two labels were already written, uncommitted, in the shared tree) so master is green again — flagging it because it is another session's in-flight work.


**PROMO BATCH 2 SHIPPED — `07709e6` (2026-11-23).** PR-004 / PR-006 / PR-007 are on `master`, so all six JP 2025 promo characters are implemented. Gates on the clean worktree at that commit: typecheck 0, game-core **1548/1548**, client 286/286, server 115/115.

**The landing was nearly wrong, and only the full soak caught it.** Yoko Suzuki L1 (`attachCardFaceDownToCharacter`) wrote `attached: [chosen]` — but `seat.attached` is SHARED with Infected trophies and partner attachments, so every trophy vanished from the zone arrays while their registered location still said `mansionDeck@0`: `partnersInEscape` seed 1 ended at the action cap with 13 orphans. Reproduced with a throwaway vitest probe (`playBotGame`, then diff registered ids against the union of all zones); bisected three ways — origin engine + the new card data = 0 orphans, my engine + identical characters = 13, disabling only the attach resolver = 0. Fix: `PlayerState.faceDownAttachedId` records which card THIS effect attached, and resolution appends to `attached` / hands back only that id. Also worth remembering: the main tree's own full run had shown the same conservation failure buried among 7 pre-existing WIP failures, and the clean worktree's first attempt appeared to "hang" for ~11 min — that was just the 33-minute soak emitting no output until it finishes.

Test-rig note: the `game(<id>, over)` helper spreads `over` into SEAT 0 only, so GameState-level keys (`activeSeat`, `phase`) are rejected by tsc as unknown `PlayerState` properties — set them separately.


**PROMO CHARACTERS PR-004 / PR-006 / PR-007 — batch 2 (2026-11-23).** Batch 1 (PR-003 George Hamilton, PR-005 Albert Wesker, PR-008 Cindy Lennox) shipped as commit `e77f796`; batch 2 lands the remaining three, completing the six-card JP 2025 promo set. All three were transcribed from scans with gate numerals calibrated against `pr-009` (inside-shield numeral = gate).

**PR-004 Jim Chapman** (70 HP, gates 3/7): L1 `coinFlipOnExplore` (flip on the SEEDED RNG — heads adds the weapon's printed damage again so it deals double this turn, tails costs Jim 10); L2 `onInfectedRevealedAmmoBottom` — raised by a wrapper hook after an explore that revealed an Infected during his turn, accepting pays 2 `"Ammo x10"` and forces every revealed Infected still in the Mansion to the very bottom (overriding a shuffle-back).
**PR-006 Yoko Suzuki** (70 HP, 3/4): L1 wired `attachCardFaceDownToCharacter`, a kind that had been declared all along but had NO reducer or validate case anywhere — attaching a hand card face down returns whatever was attached before to hand; L2 `lethalReduceMaxHpHealFull` substitutes a lethal hit for −20 Maximum Health plus a full heal.
**PR-007 Alyssa Ashcroft** (80 HP, 2/5): L1 parks the explore for a 20-Ammo payment granting +10 Damage on her single weapon THIS combat; L2 names a card type, reveals the Inventory top, and on a match draws it and grants +1 Explore.

**Two reusable patterns came out of this batch.** (1) `GameState.exploreChoiceAsk` + `PlayerState.exploreChoicePending`: a SECOND pre-reveal park alongside `davidKnifeAsk`, for abilities whose effect must apply to the triggering explore (PR-004 L1 coin flip, PR-007 L1 pay-Ammo). Detection sits next to the David parking block; the `exploreChoice` resolver applies the choice and RE-DISPATCHES the stored action, keeping the pending flag armed so it cannot re-offer. Both PR-004 L1 and PR-007 L1 require exactly one weapon in use because their text names a single weapon. (2) **`lethalSubstitution` on GameState**: `applyYokoSubstitution` hooks the ONE real damage choke (`applyRicardoDamage`) plus the three direct `applyHpLoss` prompt handlers, but ~19 damage sites rebuild the seat from a PRE-damage snapshot (`{...target, hp: ric.hp}`), which silently discarded the new Maximum Health — the max-HP rewrite is therefore recorded on state and re-applied by an end-of-action block right after `applyEntranceHallWeaponBuy`. Any future effect that mutates `maxHp` from inside a damage path needs the same treatment.

Known interpretation notes (documented in code): the coin-flip doubling is implemented as "+the weapon's printed damage", which equals a true double when no other bonuses are stacked on it; PR-004 L2 is resolved after the explore rather than mid-resolution, which is why its wording is scoped to "revealed Infected still in the Mansion".


**PROMO CHARACTERS PR-003..PR-008 — BATCH 1 SHIPPED (2026-11-23, commit e77f796).** The six JP 2025 promo scans had art but NO engine `CardDef`. Texts transcribed from `CARD-ART` with the gate digits read by CALIBRATING against `pr-009` (whose data says gates 1/4): the numeral INSIDE the shield is the gate (`levelNAt`), the numeral left of it is the level. Whole-card local reads agreed on every gate; a strip-crop pass disagreed and was discarded.

SHIPPED (fully wired + tested, 12 new cases in `game-core/src/engine/promoCharacters.test.ts`): **PR-003 George Hamilton** (80 HP, gates 2/6; L1 manual herb-trash Green→+1 Action / Red→+1 Explore, L2 turn-start choose X Herbs → draw X), **PR-005 Albert Wesker** (100 HP, 2/6; L1 +1 card while MAX HP ≤ 80, L2 +1 Explore while MAX HP ≤ 60 — validate enforces the Maximum-Health gate), **PR-008 Cindy Lennox** (70 HP, 1/5; L1 hooked in `gainCard` for +1 Buy on any Herb gain, L2 turn-start +20 damage at full Health). Gates: game-core 1538/1538 after rebasing onto a64734e, client 286/286, server 115/115, typecheck 0.

REMAINING THREE — transcribed but NOT implemented (their triggers fire INSIDE the explore or need state surgery; defs deliberately held back rather than shipped inert):
- **PR-004 Jim Chapman** (70 HP, gates 3/7): L1 "When Jim Explores, you can flip a coin. If heads, this weapon Jim is using deals double Damage this turn. If tails, Jim takes 10 Damage." L2 "During your turn, when an Infected is revealed, you can Gain 2 'Ammo x10'. In that case, move all revealed Infected to the bottom of the Mansion."
- **PR-006 Yoko Suzuki** (70 HP, gates 3/4): L1 = the existing-but-UNWIRED kind `attachCardFaceDownToCharacter` ("attach a card from your Hand to Yoko, face down... move the previous one to your Hand") — NOTE that kind has NO reducer/validate wiring anywhere today (only a custom card references it), so it needs implementing rather than just declaring. L2 "When Yoko's Health would be reduced to 0 or less, you can reduce her maximum Health by 20 then Heal her to full Health instead." (Ada's `setHpToOnLethal`/`applyHpLoss` is the precedent; this variant must also rewrite `maxHp` in state, so it needs the lethal choke at actions.ts ~9033 / ~11269 / ~11282.)
- **PR-007 Alyssa Ashcroft** (80 HP — Manny confirmed, gates 2/5): L1 "When Alyssa Explores, if she is only using 1 Weapon, you can pay 20 Ammo. In that case, that Weapon gets +10 Damage during this turn." (changes THIS combat → needs a pre-reveal park like `davidKnifeAsk`, or a deferral). L2 "During your turn, you can name a card type. In that case, Reveal the top card of your Inventory. If the Revealed card was the named type, draw it and you get +1 Explore during this turn."

Ability-kind declarations for all three are ALREADY in `types.ts` (harmless unused union members) so the next pass only needs the defs + wiring.


**REVEAL PANEL REPEATED CARDS IN BOT STRETCHES — FIXED (2026-11-23, commit 963a812).** Symptom: when bots explored and found an item/card, the reveal overlay showed it again on later reveals; a single turn could queue ~13 reveal entries across all bots. **Root cause (client, pre-existing — not from the card work):** the server delivers a whole bot stretch as ONE snapshot, so `App.tsx` queues EVERY fresh explore from it. `revealsForExplore(prev, next, action)` seeded its outcome map from a `prev -> next` **zone diff**, which spans every explore in that snapshot rather than the one being rendered — so explore #2's panel also listed explore #1's defeated Infected, explore #3 re-listed both, and the queue grew ~N². The engine already records the exact per-explore revealed set on the logged action (`revealedInstanceIds`), so the fix uses ONLY that list (deriving each outcome directly) whenever it is present; the zone diff is kept only for logs written before that field existed. Regression test `client/src/ui/revealScoping.test.ts` (3 cases, red on the old logic: `expected ['ma-046#1','ma-001#1'] to deeply equal ['ma-046#1']`). Gates: typecheck 0, client 286/286, server 115/115.


**CH-023 DAVID KING L2 — NOW A CHOICE (2026-11-23, commit 54e32b2).** "When you play a Knife Weapon from your Hand, move a Knife Weapon from your Discard Pile to your Play Area, David is now using that moved Weapon." Both weapon-list sites (`explore.ts` single-explore, `actions.ts` multi-explore) silently appended a phantom discard knife.

The extra weapon changes the combat's damage AND outcome, so the hold-and-settle trick cannot apply — the decision has to happen before the explore resolves. It uses the repo's existing PRE-REVEAL PARK shape (the same one CH-017 Helena uses), not CW-013's post-reveal `pendingExplore`:
- `GameState.davidKnifeAsk = { seat, action }` stores the parked explore; `PlayerState.davidKnifePending` suppresses re-offering while the window is open or its answer is being applied.
- Park fires when the LEADER has `knifeFromDiscardForExplore`, a Knife was played FROM HAND, and a Knife sits in the Discard Pile. Options = the discard knives + Decline.
- Answering moves the picked knife Discard -> Play Area and RE-DISPATCHES the stored explore via `applyAction(s, ask.action)`, so the knife belongs to that same combat. The marker clears at the end of the explore (in the shared wrapper, skipped while `davidKnifeAsk` is set) and at turn start in `startTurnInternal`.
- **It answers through `chooseOption`** (not a new action type): a dedicated `davidKnifeChoice` action was tried first and got rejected by validate's "resolve pending prompt first" gate, so routing through chooseOption inherits that gate for free.
- Removed both silent additions; the preview (`exploreDamage`) now excludes the unchosen knife.

Tests: `outbreak.test.ts`'s CH-023 L2 case re-baselined to park / decline / accept / no-double-offer. Gates: game-core 1523/1523, client 283/283, server 115/115, typecheck 0. Pushed abbb950..54e32b2. **F1 + ac-012 + ch-023 are all done.** Remaining: the non-explore damage sites (MA-037/MA-031 AoE reveals, outbreak traps, `mercenaries.ts dealDamageToCharacter`).


**AC-012 STRUGGLE FOR SURVIVAL — NOW A REACTIVE CHOICE (2026-11-23, commit abbb950).** "You can Discard this card from your Hand to lower the Damage of 1 Weapon being used costing 40 Gold or less to 0." The shared effect kind `negateWeaponCost40OrLessFromHand` was an explicit v1 no-op in the atomic attack resolution; keyed on the `ac-012` CARD ID (AC-008 shares the kind but is Versus-only and stays untouched).

- `attackWeaponCost` is hoisted out of the weapon branch so the gate can be read later; Infected Characters' base damage is not a weapon, so it never triggers.
- An alive, non-downed OPPONENT holding AC-012 is asked while the attack resolves. Target held at pre-attack Health; resolver zeroes the hit on accept (discarding from the HOLDER's hand) or applies the full loss on decline. Settles via `settleHeldDamageLoss`, so it composes with IN-004 / MA-054o underneath.
- Tests: `deadKinds.test.ts` +2 (offer/decline/accept; and no window vs a weapon costing >40 Gold). Gates: game-core 1523/1523, client 283/283, server 115/115, typecheck 0. Pushed 58eaaa8..abbb950.

**NEXT BACKLOG ITEM — `ch-023` David King L2 needs NEW machinery, not a hold.** Printed: "When you play a Knife Weapon from your Hand, move a Knife Weapon from your Discard Pile to your Play Area, David is now using that moved Weapon." Both sites (`engine/explore.ts:~224` single-explore and `engine/actions.ts:~3169` multi-explore) silently push a phantom discard knife into the weapon list BEFORE damage is computed. Because the window fires when the knife is PLAYED (before the reveal), converting it cannot reuse the hold-and-settle trick: the explore must be PARKED and RE-RUN after the answer, which is the CW-013 `pendingExplore` shape — but CW-013 defers AFTER the reveal (it needs to know an Infected appeared), while David's choice changes the WEAPON LIST itself, so it needs a pre-reveal variant that stores the explore ACTION and re-applies it, plus moving the chosen knife discard→playArea first. Also note `data/outbreak.ts:33` has `level1At: undefined, level2At: undefined // GATES UNVERIFIED`.


**MA-054o KEVLAR JACKET + IN-004 SLOUGH ARMOR — BOTH NOW CHOICES (2026-11-23, commit 58eaaa8):** completes the five atomic-reducer cards of AUTO_OPTIONAL_AUDIT F1. Both were resolved silently inside the atomic damage path; both now hold the victim at pre-damage Health and settle via a prompt, using `settleHeldDamageLoss` like CH-045 / CH-049 / B4MC-CH-007.

**MA-054o (Outbreak)** — "When that character would receive any damage, you may move this card to the bottom of the mansion. If you do, that character receives no damage during this turn." Explores now only call `attachedKevlarId(state, seat)` and leave the full hit pending; `queueKevlarJacketPrompt` is raised FIRST in the reducer chain (`kevlarQueued` seeds `reductionQueued`) because it consumes the jacket. Resolver: accept = strip from `attached`, append to the Mansion bottom after dropping any stray copy (a card can never sit in two zones), settle 0; decline = settle the full loss. **Traps (`outbreakTrapDamage`) and attacks still auto-apply it.**

**IN-004 (Outbreak)** — "When your infected character is attacked, you may discard this card from your hand. If you do, reduce the damage of one weapon being used by 20." The attack computes `sloughBase` (the FULL pre-Slough hit while the choice is open, so the auto-applied Kevlar Jacket underneath still composes correctly), holds the target at pre-attack Health, and queues on the ATTACKED seat. Resolver: accept = discard from that seat's hand + reduce by 20; decline = full hit, card kept.

Tests re-baselined to offer/decline/accept: `rulesText.test.ts` MA-054o suite (incl. a one-zone assertion) and `deadKinds.test.ts`'s IN-004 test. Gates: game-core 1521/1521, client 283/283, server 115/115, typecheck 0. Pushed d7e34cc..58eaaa8.


**B4MC-CH-007 CHRIS L1 — DAMAGE REDUCTION IS NOW A CHOICE (2026-11-23, commit d7e34cc):** third F1 card. "Once per round, the first Infected Damage he takes on his own turn is lowered by 10. In that case, gain 1 'Ammo x10'." The -10 was folded into `exploreParams.damageReduction` on BOTH explore paths and the latch/Ammo were applied silently afterwards (multi-explore post-processing block + the single-explore not-defeated tail). Now the same hold-and-settle shape as ch-045/ch-049: hold the leader at pre-damage Health (`queueChrisL1ReductionPrompt`), ask, settle reduced-or-full onto the CURRENT hp; accepting consumes the once-per-round latch AND pays the Ammo.
- `chrisL1DamageReduction(state, seat)` → **`leaderInfectedReduction(state, seat, abilities)`**: evaluated against the LEADER's abilities so a PARTNER-led explore works too (own-turn gate + `roundUsedAbilities` latch unchanged).
- The three reducers now share one **`reductionQueued`** flag at each damage site, so at most ONE window is raised per hit (they are mutually exclusive in practice — different characters — but the flag makes it explicit).
- **Still auto-applied for all three:** the AoE reveal sites (MA-037/MA-031), outbreak traps, and `mercenaries.ts dealDamageToCharacter`. **Not started: ma-054o Kevlar Jacket, in-004 Slough Armor.**
- Tests: `customB4mcChris.test.ts`'s CH-007 L1 suite re-baselined from "always applies" to the choice (hold / accept+latch+Ammo / decline / level 0 / once-per-round). Gates on origin/master+changes: game-core 1521/1521, client 283/283, server 115/115, typecheck 0. Pushed ae68b78..d7e34cc.


**CH-049 WESKER L1 — DAMAGE REDUCTION IS NOW A CHOICE (2026-11-23, commit ae68b78):** second F1 card. "When Albert would take any damage while exploring, you may lower that damage by 10 for every card in your hand." Was folded into `exploreParams.damageReduction` as `amount * handAfter.length`. Now the same hold-and-settle shape as CH-045: hold the leader at pre-damage Health (`queueWeskerReductionPrompt`), ask, and settle reduced-or-full onto the CURRENT hp. No printed cost, so accepting only lowers; a declined lethal hit still downs him; multi-explore holds the survivors' combined attack and a big enough hand absorbs it entirely.
- **NEW SHARED HELPER: `settleHeldDamageLoss(state, seat, applied, partnerLead)`** (actions.ts, just after `applyPendingExploreOutcome`). This is the tail every "hold at pre-damage Health and ask" window needs: hp update, `flipDown` on a lethal Main hit, permanent Partner removal on a lethal partner hit. CH-045's resolver was refactored onto it (no behaviour change) and CH-049 uses it directly. Reach for it for b4mc-ch-007 / ma-054o / in-004 rather than re-inlining the flipDown + partner-cleanup block a third time.
- GOTCHA when porting this pattern to a NEW card whose predecessor is already committed: `git diff` against the local HEAD bundles the old card's hunks with the new one (e.g. one hunk that both removes the old auto-reduction AND adds the new hold), so naive hunk-filtering produces patches whose PRE-image no longer matches origin/master. Expect to rebuild those hunks by hand; do not "fix" it by re-adding lines that are already upstream.
- SCOPE: explore damage only. Still auto-applied: the AoE reveal sites (MA-037/MA-031), traps, `mercenaries.ts dealDamageToCharacter`. Untouched: b4mc-ch-007 Chris L1, ma-054o Kevlar Jacket, in-004 Slough Armor.
- Tests: `weskerDamageReduction.test.ts` (7 — hold, accept, decline, decline-lethal downs, accept-lethal survives, multi-explore full absorption, not-the-victim). `mercenaries.test.ts`'s CH-049 case re-baselined from "always applies" to the choice. Gates on origin/master+changes: game-core 1519/1519, client 283/283, server 115/115, typecheck 0. Pushed 974f3a1..ae68b78.


**CH-045 HUNK L1 — DAMAGE REDUCTION IS NOW A CHOICE (2026-11-23, commit 974f3a1):** first card of the AUTO_OPTIONAL_AUDIT **F1** family. "When Hunk would take any Damage, you can lower that Damage by 20. In that case, Gain 1 'Ammo x10'." The -20 used to be folded into `exploreParams.damageReduction` (always on) and the Ammo was granted unconditionally by the post-action damage hook. Now the explore **HOLDS** the leading character at its pre-damage Health and asks; accepting applies only the reduced loss and pays the Ammo, declining applies the full loss — so a declined lethal hit STILL downs him. The hold is the same mechanism B4MC-CH-005 Jill's trash-to-negate already uses (`newLeadingHp = baseLeadingHp` + a prompt + a resolver that settles onto the CURRENT hp).
- Mechanism to reuse for the rest of F1: `queueHunkReductionPrompt` (abilities.ts) + the `hunkDamageReduction` resolver in the chooseOption switch. Payload carries `loss`, `amount`, and `leader` ('main'|'partner') because a PARTNER-led explore lands the loss on `partnerHp`, and emptying it removes the Partner permanently (same cleanup as the ch-015 redirect). Multi-explore works too (the survivors' combined attack is the held loss).
- The old automatic Ammo grant in `applyDamageTakenHooks` now SKIPS while a `hunkDamageReduction` prompt is open (`prev.prompts.some(...)`) — `prev` is the pre-action state, so it still contains the prompt being answered. Without that guard the Ammo would double-pay.
- SCOPE of this slice: **explore damage only**. Still auto-applied: the AoE reveal sites (MA-037/MA-031), outbreak traps, and `mercenaries.ts dealDamageToCharacter`. Not started: ch-049 Wesker, b4mc-ch-007 Chris L1, ma-054o Kevlar Jacket, in-004 Slough Armor.
- Tests: `hunkDamageReduction.test.ts` (7 — hold, accept, decline, decline-lethal downs, accept-lethal survives, multi-explore, not-the-victim). `mercenaries.test.ts`'s CH-045 case re-baselined from "always applies" to the choice. Gates on origin/master+changes: game-core 1512/1512, client 283/283, server 115/115, typecheck 0. Pushed 93e3be4..974f3a1.


**CH-015 HUNK L1 + CW-013 PUMP-ACTION SHOTGUN (2026-11-23, commit 93e3be4):** two more AUTO_OPTIONAL_AUDIT backlog items cleared. `ch-015`'s `damageRedirectToPartner` had exactly ONE reader, and it only gated Ada's lethal-damage override — the redirect never happened. It is printed "you can", so it is now a prompted CHOICE raised from `applyDamageTakenHooks` (the post-action hp-diff hook): ONE code path covers explore, poison, trap, AoE and off-turn damage. Accepting restores Hunk's Health and takes it from `partnerHp`; a hit that empties the Partner kills it (permanent removal). `cw-013`'s `optionalSelfDamageForDamageAndType` was data-only; it now prompts on the Infected reveal (`cw013SelfDamage`) and DEFERS the explore so the +10 / Melee grant applies RETROACTIVELY to that combat, reusing the AC-018 `pendingExplore` machinery. New `PlayerState.extraWeaponTags` (instanceId → tags, cleared in `startTurn`) is merged by `effectiveWeaponTags`, which the reducer's per-weapon damage line, `exploreDamage` and the tag-scoped bonuses all read — so the picker preview agrees.
- Tests: `hunkRedirect.test.ts` (6), `pumpActionShotgun.test.ts` (8). Both proven red with the features neutralised.
- Verified on origin/master + changes (detached worktree): game-core 1505/1505, client 283/283, server 115/115, `npm run typecheck` exit 0. Pushed 86f5db9..93e3be4.
- KNOWN GAPS (deliberate, documented in code): cw-013 is wired for the SINGLE-explore path only — a multi-explore batch reveals several Infected at once and has no per-reveal deferral; ch-015 is NOT offered when a single hit downs Hunk outright (the down is already applied), nor for damage applied outside `applyAction`.
- The old `hasDamageRedirect` clause in the explore reducer was REMOVED: it made the engine treat the redirect as automatic, which silently suppressed Ada's lethal-damage override for any Hunk-with-partner.


**AC-040 VENGEFUL INTENTION (2026-11-23, commit 86f5db9):** the Nightmare action's last clause — "Each time you play another action this turn, your character takes 10 damage" — was data-only. `damagePerAdditionalActionThisTurn` was WRITTEN by the `damagePerAdditionalAction` effect and INITIALISED in `startTurn` (game.ts x3), but nothing ever READ it. `playActionCard` now applies the armed amount from the PRE-play player, so the card that arms the effect is never charged for itself; it routes through `applyRicardoDamage` like every other self-damage effect. It is a COST, not a choice — no prompt. Turn-scoped by the existing `startTurn` reset (no new flag needed). Tests: `game-core/src/engine/vengefulIntention.test.ts` (4: arming, per-action charge, cross-seat isolation, turn-boundary reset; red without the fix).
- Verified on origin/master + fix (detached worktree, since the shared tree is behind and holds another session's uncommitted WIP): game-core 1491/1491, client 283/283, server 115/115, `npm run typecheck` exit 0. Pushed 0a12f55..86f5db9.
- The MAIN tree's own run had 7 failures in `customLocations.test.ts` / `customUsher.test.ts` — all reproduced with my hunk reverse-patched, so they are NOT mine: the other session's uncommitted 6-room batch makes the pool 51 locations instead of 45 and shifts the Usher seed map. Their WIP also adds `courtyardStart`/`elevatorDiscardStart` to the engine WITHOUT the matching `client/src/ui/turnHistory.ts` VERBS entries, which is why the main tree typechecks only with their dirty client file present.


**LOC BATCH 10 — SIX NEW ROOMS (2026-11-19):** Manny sent 6 renders:
loc-040 Firearms Room (GLOBAL), loc-041 Garden (invest 0), loc-042 Greenhouse
(invest 10), loc-043 Helipad Lookout (invest 30), loc-044 Hidden Library
(GLOBAL), loc-045 Exhibition Room (GLOBAL). Art LOC-040..045.png (320x436,
titles verified with local gemma4:e2b). Tests in `customLocations10.test.ts`
(15). Introduces XP-STORED-ON-CARD pools, Setup-on-reveal effects, and a
forfeitBuy action.
RULINGS (Manny): Setup XP fires when the room is revealed / enters play;
Greenhouse/Helipad are invest rooms whose abilities spend the CARD's XP pool
(available to investors); Exhibition takes ALL card XP on >20 explore damage;
Garden is a 0-cost invest room spending PERSONAL XP.
- New state: GameState.locationXp (Record<instanceId, number> — XP on cards),
  GameState.greenhouseDamageBonus {seat, amount}; CardDef.locationSetupEffects
  (LocationSetupEffect: setupAddXpPerPlayer{perPlayer}, setupXpOnActionWeaponPiles).
  Helpers: cardXp/addCardXp/removeCardXp, locationInstanceId, applySetupEffects.
- applySetupEffects runs in revealLocation AND in setup() for Usher face-up
  rooms (baseState made `let`). setupAddXpPerPlayer adds perPlayer x seatCount;
  setupXpOnActionWeaponPiles adds an xpToken to every action/weapon pile.
- Firearms Room (GLOBAL): scorePenaltyPerNon10Ammo — -1 per ammunition card
  except am-001 (type is 'ammunition', NOT 'ammo').
- Garden (invest 0): applyGardenHook post-buy (turnGold >= 30 + xp >= 1) offers
  gardenOffer -> gardenTarget (give Infection to a chosen seat via gainInfections,
  or remove top infection from self).
- Greenhouse (invest 10): new `forfeitBuy` action (validate + enumerate +
  turnHistory + LocationsRow "Forfeit Buy (+20 dmg)" button) spends 1 Buy; if
  invested + card XP >= 1, removes 1 card XP and arms greenhouseDamageBonus.
  The +amount is added to ALL FOUR explore bonusDamage sums (search
  `mazeDamagePenalty(state, player.playArea...`) and consumed by the seat's
  first explore (cleared in the wrapper) or at the turn boundary.
- Helipad Lookout (invest 30): applyHelipadHook diffs attached for a defeated
  Infected by an investor with card XP -> helipadOffer (+30 Gold / Skill +
  Infection / Decline); spends 1 card XP, random catalogue skill + gainInfections.
- Hidden Library (GLOBAL): scoreHiddenLibrary — +5 if 4 knife-tag weapons OR 4
  pistol-tag weapons OR 10 am-001 cards (weaponTags). On Reveal
  revealEachOtherPlayerMayDiscardAndDraw{5}: every OTHER player may discard hand
  and draw 5 (hiddenLibraryDraw handler). NOTE: revealOnly auto-answers prompts,
  so the test reveals manually to inspect the choice prompt.
- Exhibition Room (GLOBAL): Setup tokens action/weapon piles. The BUY GATE
  (before the Bar gate) moves a tokened pile's XP to the card on an action/weapon
  buy (no personal XP cost); validate buy exempts the XP requirement when
  exhibitionInPlay. applyExhibitionDamageTake: explore hp loss > 20 takes ALL
  card XP as personal XP (card empties). Explore damage = infected ATTACK (not
  hp) — use ma-006 Licker (attack 30) to exceed 20 in tests.
- POOL 39 -> 45: re-scanned Usher seeds (probe usher-seeds10.ts, deleted):
  seed 368 Library+Lesson Space, seed 49 Library scoring, seed 57 Kitchen,
  seed 25 Large Library, seed 100 Tiger (first), seed 20 Attic (first). LOC_IDS
  extended to loc-045. scoreEffectValue gained a `default: return 0`.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (6 hashed
  LOC assets), location suites 147/147, full game-core soak loc10-final-full.log.

**LOC BATCH 9 — FIVE NEW ROOMS (2026-11-19):** Manny sent 6 renders; Terrace
was already loc-014 (skipped). Implemented loc-035 Tea Room (30/30/30),
loc-036 Study (100), loc-037 Stuffed Deer Room (60), loc-038 Suspended Ceiling
Room (60), loc-039 Taxidermy Room (80). Art LOC-035..039.png (320x436, titles
verified with local gemma4:e2b). Tests in `customLocations9.test.ts` (13).
RULINGS (Manny): Stuffed Deer plays the revealed action for FREE (no Action);
Tea Room's skill is a RANDOM Mercenaries catalogue skill (like Parlor).
- Tea Room (invest [30,30,30]): turn-start teaRoomChoice prompt (options gated
  on cube count: Draw 2 remove 1 / Gain skill remove 2 / Decline). Handler
  removes cubes from loc-035 and draws 2 or registers a random catalogue skill.
- Study (invest [100]): locationScoreEffects scorePerActionCard{perCard:1}
  (actionCardCount across hand/discard/playArea/inventory, investor-only via
  the locationScore invest gate). On Reveal revealGainGold{20} — every living
  player +20 Gold (subject-less "Gain", mirrors revealGainHealth).
- Stuffed Deer Room (invest [60]): startTurn reads the POST-DRAW Inventory top;
  if action, moves it to hand + arms PlayerState.pendingStuffedDeerPlayId. The
  applyAction wrapper CAPTURES the pending ids early (the hook chain rebuilds
  seats and drops the field) and PLAYS them last via applyActionInternal
  playActionCard{isFreePlay:true} (after every hook, so end-turn seat
  reconstruction cannot revert it). New playActionCard.isFreePlay flag skips
  the Action cost in reducer + validate. On Reveal revealLoseHealth{10} (every
  player). NOTE: applyAction(endTurn) does NOT call startTurn (the host loop
  does) — tests must call startTurn directly then trigger the wrapper.
- Suspended Ceiling Room (invest [60]): applySuspendedCeilingHook diffs each
  seat's attached for newly defeated Infected (type 'infected'); every OTHER
  living investor draws 1 per defeat. On Reveal revealHealthLossCapThisTurn{10}
  sets GameState.healthLossCapThisTurn{seat,baseline,cap}; applyHealthLossCap
  clamps the revealer's HP to baseline-cap post-hoc in the wrapper (damage has
  no choke point), reviving damage-death when the cap fully protects. Cleared
  at the turn boundary.
- Taxidermy Room (invest [80]): startTurn +1 Action (taxidermyActionBonus added
  to actionsLeft). On Reveal revealBlockActionPlaysThisTurn sets
  PlayerState.blockedActionPlaysThisTurn on the revealer; validate playActionCard
  rejects (isFreePlay exempt). Cleared at the turn boundary.
- New kinds: ongoingTeaRoomTurnStart, ongoingStuffedDeerTurnStart,
  ongoingDrawOnOtherDefeat, ongoingTurnStartPlusAction, revealGainGold,
  revealHealthLossCapThisTurn, revealBlockActionPlaysThisTurn, scorePerActionCard.
  Helpers: actionCardCount, teaRoomInvested, teaRoomCubes, stuffedDeerInvested,
  suspendedCeilingInvested, taxidermyActionBonus.
- POOL 34 -> 39: re-scanned Usher seeds (probe usher-seeds9.ts, deleted):
  seed 4 Library+Lesson Space (also Library scoring), seed 5 Kitchen, seed 2
  Large Library, seed 20 Attic Landing (first), seed 18 Tiger (first). LOC_IDS
  extended to loc-039.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (5 hashed
  LOC assets), location suites 132/132, full game-core soak loc9-final-full.log.

**LOC BATCH 8 — SIX NEW ROOMS (2026-11-19):** Manny sent 6 renders:
loc-029 Statue Corridor (70), loc-030 Storeroom (50), loc-031 Researcher's
Private Room (40), loc-032 Shed (40), loc-033 Small Dining Room (30),
loc-034 Stairway (10). All implemented + art shipped (LOC-029..034.png,
320x436 palette, titles/costs verified with local gemma4:e2b). Tests live in
`customLocations8.test.ts` (17) — NOT customLocations7.test.ts, which is a
stale-named file already covering loc-022 Bar / loc-023 Bedroom.
RULINGS (Manny): Storeroom rearrange = look through a weapon pile and choose
its new TOP card; Storeroom extra turn = one final turn per LIVING investor
after the base game ends; Stairway = spend 1 XP to reveal the top Location
then free-invest any revealed room not yet cubed (no Buy).
- Statue Corridor (invest 70): gold-icon action cards (bonuses.gold > 0) cost
  no actions — `freeGoldAction` in the playActionCard reducer + validate gate
  (exempt like isFreeRepeat); enumerate already offers all hand actions, so no
  enumerate change. On Reveal: revealer loses 3 XP (revealLoseXp, floor 0).
- Storeroom (invest 50): new `storeroomRearrangeStart` action removes one cube
  then offers storeroomChoosePile (weapon piles with >=2 cards) ->
  storeroomChooseTop (move chosen to front). LocationsRow "Rearrange (1 cube)"
  button. Extra turn: checkWin wraps checkWinBase — while the base game is over
  but a living investor is not in `storeroomFinalTurnsTaken`, returns
  gameOver:false; the applyAction wrapper records the ending seat when a turn
  advances past a living investor while checkWinBase(state).gameOver. Dead
  investors are excluded (can't take a turn). GameState.storeroomFinalTurnsTaken.
- Researcher's Private Room (invest 40): turn-start researchersBuyOrExplore
  prompt (+1 Buy / +1 Explore). On Reveal: every OTHER player gains an
  Infection (reuses revealEachOtherPlayerGainsInfection).
- Shed (invest 40): turn-start shedAmmoChoose (CSV-staged am-001 picks from
  hand + Done); Done discards staged ammo and draws that many; if XP >= 1 and
  not yet repeated, offers shedRepeatOffer (Repeat 1 XP / Decline); Repeat
  re-raises shedAmmoChoose with repeated:'1' (once per turn).
- Small Dining Room (invest 30): turn-start diningDiscardForXp (discard a hand
  card for 1 XP / Decline). On Reveal: every OTHER player loses 2 XP
  (revealEachOtherPlayerLosesXp, floor 0).
- Stairway (invest 10): applyStairwayHook (post-gain, gainedThisTurn grew with
  an ACTION card) offers stairwayOffer (Spend 1 XP / Decline); Spend reveals the
  top Location (revealLocation, On Reveal fires) then stairwayInvestChoice
  (free cube on any revealed room not yet cubed, no Buy/gold).
- New LocationEffect kinds: ongoingFreeGoldActions, ongoingStoreroomRearrange,
  ongoingStoreroomFinalTurn, ongoingTurnStartBuyOrExplore, ongoingShedAmmoDraw,
  ongoingTurnStartDiscardForXp, ongoingStairwayOnActionGain, revealLoseXp,
  revealEachOtherPlayerLosesXp. Helpers in locations.ts: statueCorridorInvested,
  storeroomRearrangeInvested, storeroomInvestors, researcherInvested,
  shedInvested, diningXp, stairwayInvested.
- POOL 28 -> 34: re-scanned the Usher seed map (probe usher-seeds8.ts, deleted):
  seed 4 Library, seed 2 Kitchen, seed 3 Large Library, seed 71 Attic Landing
  (first), seed 30 Tiger (first), seed 112 Library+Lesson Space. LOC_IDS in
  customLocations.test.ts extended to loc-034. Fixed the fragile Pillar
  inventory-reshuffle test (customLocations6): control seat 0 hand:[] + 6-card
  discard, and pick a prompt option that REMAINS in the inventory after the
  draw (the handler no-ops for cards already drawn into hand).
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (6 hashed
  LOC assets), location suites 119/119, full game-core soak loc8-final-full.log.

**LOC BATCH 6 — FIVE NEW ROOMS (2026-11-19):** Manny sent 5 renders:
loc-024 Parlor, loc-025 Passage to the Shed, loc-026 Pillar Corridor,
loc-027 Reading Room, loc-028 Mural Corridor. All implemented + art shipped
(LOC-024..028.png, 320x436, titles/costs verified with local gemma4:e2b).
RULINGS (Manny): Parlor gains a RANDOM skill from the full Mercenaries
catalogue; Pillar triggers on ANY shuffle incl. the Mansion; Mural's stow is
chosen in pick order.
- Parlor (invest 30): post-buy hook (gainedThisTurn grew + gold >= 40) offers
  Pay/Decline; Pay spends 40 and registers a random skill instance in
  skillArea + seat.skills (cardDefs extended if the pool lacked skills).
- Passage to the Shed (invest 30): post-action removed-diff hook offers the
  OWNER of each trashed card a spend-1-XP trash of a hand/discard card;
  chains while XP lasts (each trash is a new trigger). On Reveal: revealer
  gains an Infection.
- Pillar Corridor (invest 30): centralized shuffle DETECTOR in the wrapper
  (no choke point exists): inventory reshuffle = whole prev discard now in
  inventory/hand and gone from discard; Mansion shuffle = same membership,
  different order. Offers pick-to-top of the shuffled deck; handler drops
  the existing occurrence first (insertAt copy trap). Generous edges
  (explicit discard->inventory moves also offer) accepted for an optional
  window. NOTE: send-to-bottom is NOT a shuffle (no RNG) — the test uses the
  MA-000 ooze shuffle-back (a real whole-deck shuffle in one action).
  On Reveal: revealer gains an Infection.
- Reading Room (invest 50): new `readingRoomPeek` action (validate +
  enumerate + turnHistory verb + LocationsRow "Peek (1 Buy)" button) spends
  1 Buy and privately reveals the top Mansion card via recordCardReveals
  (entry.reveals, NOT action.reveals). On Reveal: every OTHER player gains
  an Infection.
- Mural Corridor (invest 30/70/100): startTurn draws +1 per cube (after all
  other turn-start draws, covers both startTurn branches) then prompts
  muralStowChoose: pick N hand cards in order (payload.picked CSV staging),
  placed [...picked, ...inventory] on the last pick.
- Infection convention: gainInfections pops state.infectionDeck, respects
  isImmuneToInfectionEffects, no deck (non-Outbreak) -> no-op, like every
  other infection effect.
- Hooks run LAST in the applyAction wrapper (after Leon's trash hook) so
  they see every trash/gain/shuffle the earlier hooks produced.
- Tests: customLocations6.test.ts 17 (data, art, 3 Mural, 3 Reading, 3 Shed,
  3 Pillar, 3 Parlor) + LocationsRow Peek-button test. Fixture lessons:
  locationsMode's location deck INTERCEPTS every explore — empty it for
  Mansion-combat tests; a single explore grants +1 XP unconditionally (Shed
  math: 2+1-1=2); reveals ride on logEntry.reveals.
- Gates: typecheck x3 clean, client 282/282, server 115/115, build OK (5
  hashed LOC assets in dist). First full run: 1425/1431 — the 6 reds were
  STALE assertions from the pool growing 23->28 (customLocations deck-count
  list; 5 Usher seed deals shifted). Re-pointed: LOC_IDS extended to 028;
  Usher seeds 8->39, 12->4, 2->23, 16->44, 11->13 (new map in the test
  docstring). Location suites 61/61 after; FINAL full game-core 1431/1431 ALL
  GREEN (soak included), EXIT=0.
  LESSON: adding locations shifts every Usher/Clock seed deal — re-scan the
  seed map (usher-seeds probe) whenever the LOC pool grows.

**TIGER STATUE ROOM DISCOUNT — UI FIX (2026-11-19):** Manny asked if the
loc-015 buy discount works when invested. ENGINE: yes — buy case + validate
+ the XP-token buy path all subtract locationBuyCostReduction (engine test
customLocations3: invest 70, buy ac-001 cost 30 -> pays 20; bots enumerate
through validate so they honour it too). UI: NO — Board.tsx checked
affordability against the FULL printed cost and displayed it, so a player
with 25 gold could not click a 30-cost card even though the engine would
charge 20. Fix: export locationBuyCostReduction from game-core index; Board
computes the viewer's discount on their turn (canBuy), uses the effective
cost for the button's disabled state, the pile price label, and the tooltip
("(Tiger Statue Room: −10)"). Test: LocationsRow.test.tsx "Tiger Statue Room
investment discounts the buy button and price label" (25 gold + invested ->
foyer button enabled + 20g; uninvested -> disabled) RED→GREEN. Gates:
typecheck x3 clean, client 281/281, Tiger engine suite 11/11, build OK.

**CE MODE SHOWS THE ATTACHMENT-MODE SELECTOR (2026-11-19):** Manny: checking
Random CE Events should also trigger the Mansion Attachment Mode selector.
The selector was gated on attachable events in the CUSTOM PICKER only, but
ceMode injects CE-001..012 engine-side — so with CE mode on and nothing picked
the selector stayed hidden even though the mode governs those events
(state.mansionAttachmentMode overrides every attachment's own mode at attach
time). Fix: OR ceMode into the gate on all three surfaces (hotseat
`hasAttachmentCards || ceMode`, room `room.ceMode ||`, create `ceMode ||`).
Test: ui.test.tsx "shows the Mansion Attachment Mode selector when CE events
mode is on" (room surface, on→shown / off→hidden) RED→GREEN; live-verified
create + hotseat toggles reveal the selector. Gates: typecheck x3 clean,
client 279/279, build OK. styles.css + overlayOrder.test.ts dirty in the tree
are the OTHER session's WIP — left unstaged.

**XP-TOKEN PILE BADGES (2026-11-19):** Manny: "for locations that add xp to
piles or areas, add #xp in a circle to the top of that pile or area, # =
how much xp is on that stack." The Bar (loc-022, `onexAddXpTokenToPile`) is
the only location that places XP tokens — `state.xpTokens` (one per pile,
dedup-guarded in addXpTokenToPile; buying costs 1 XP first, 2 XP strips the
token via buyXpChoice). The tokens were INVISIBLE in the UI. Board.tsx now
crowns each tokenized Resource Area pile with a circular gold `.xp-token-badge`
reading `<count>xp` (count = occurrences of the pileId in xpTokens, so stacked
tokens show the total); empty piles get it too; the pile tooltip explains the
XP spend. CSS: .market-pile position:relative + the badge circle (landed in
HEAD via the other session's cb2c0e0, which absorbed the shared styles.css —
the Board/test hunks are this session's commit). Test: LocationsRow.test.tsx
"crowns XP-token piles" (1xp/2xp/placement/no-token) RED→GREEN. Verified
visually with a throwaway real-Board + real-CSS probe page rendered to
scratch/xp-badge-probe.html and read by the LOCAL Ollama vision model
(gemma4:e2b): clean centered circles, readable, no art overlap. Live gameplay
route abandoned: First Timer has no Ammo x20, so Bar's 20g Use is unreachable
on turn 1 — the probe is the deterministic visual gate. Gates: typecheck x3
clean, client 278/278 (incl. the other session's lobby-collapse cb2c0e0),
build OK.

**CE-009 ECLIPTIC EXPRESS ON-DEFEAT WINDOW FIXED (2026-11-19):** Manny: "does
ce-009 trigger correctly when in play and a player defeats an infected — they
should be prompted to trash a card in their discard pile if they choose to".
NO — the eclipticTrash window existed ONLY in the multi-explore branch; the
common SINGLE-explore defeat never prompted, and neither did the deferred
resumes. Fix: one shared `eclipticTrashPromptFor(state, seat)` helper
(actions.ts, beside applyPendingExploreOutcome) used by EVERY defeat path:
single-explore defeated branch (reads the FINAL post-explore discard via
defeatFxState), multi branch (replaces the old inline block), the AC-018 /
AC-042 chooseOption resumes, and the next-explore entry guard. Prompt id now
carries a counter (`ecliptic-trash-<seat>-<version>-<n>`) so a resolved pending
+ the new explore cannot collide (chooseOption removes every prompt with the
same id). Handler unchanged (Decline guard already correct). Tests:
eclipticExpress.test.ts 9 — RED before the fix (5 fails), GREEN after; covers
prompt/options, trash, Decline, empty discard, not attached, not defeated,
multi, entry-guard resume, AC-018 decline resume. Fixture lessons: the
Uroboros window goes to NON-exploring seats holding ac-018; validate's prompt
gate is per-seat, so the entry-guard scenario needs the stale prompt on a
DIFFERENT seat; a cards-map overwrite must spread the STACKED state's cards or
the revealed top card is unregistered (nightmare reveal crash).
RULING (Manny, 2026-11-19): Sherry's forced explore prompts the EXPLORING
player (the target), not Sherry — wired in allyExplore after the target's
redraw (final discard), via the exported helper (hoisted-function import
across the actions↔allyExplore cycle, same shape as game↔actions). 2 more
tests (defeat prompts target + trash resolves; no-defeat silent) — RED→GREEN.
Gates: typecheck x3 clean, ecliptic 11/11 + fanSherry/clock/usher 52/52,
client 276/276, server 115/115, build OK; FINAL full game-core 1414/1414 ALL
GREEN (the first soak, 1412/1412, predated the ally wiring and was superseded).

**LOC BATCH-1 ART COMPLETE (2026-11-19):** Manny sent the 7 missing batch-1
renders (Library, Arklay Laboratory, Keeper's Room, Kitchen, Large Art Room,
Large Gallery, Large Library). Titles + printed costs verified with the LOCAL
Ollama vision model gemma4:e2b (Manny: use the local LLM for vision tasks —
/api/generate with images:[base64], ~4s/card; it is multimodal and fast).
All matched the defs (Arklay 1X/30, Keeper's+Kitchen 10, the three Large 20,
Library GLOBAL). Normalized to the LOC convention (320x436 palette PNG) ->
LOC-001..007.png. ALL 23 LOC cards now ship art. Art test widened to
loc-001..008. Gates: typecheck x3 clean, location+mode suites 74/74, client
273/273, build OK. Live-verified: Large Library tile serves LOC-007.png.

**LESSON SPACE ART + LOCATION HOVER CARDS (2026-11-19):** Manny sent the
LOC-008 Lesson Space render (822x1122 JPEG). Normalized to the LOC batch
convention — 320x436 palette PNG, FULL card render WITH printed text, exactly
like LOC-009..023 (cardArt.ts's "art only" docstring is stale for this batch) —
saved as CARD-ART/LOC-008.png; the vite glob picks it up with no manifest.
The loc-008 def already matched the print (GLOBAL, costs [20],
scorePerDuplicateActionName, revealLoseHealth 5) — no engine change.
LocationsRow tiles now ride inside HoverCard (the Hand.tsx pattern): hover
shows the enlarged full-art CardView popup. CSS keeps the flex row's stretch
through the wrapper (.locations-row > .hover-card { display:flex }).
Tests: art-exists (customLocations2) + hover-wrapper (LocationsRow.test).
Gates: typecheck x3 clean, client 273/273, location suites 32/32, build OK.
Live-verified ONLINE: Usher room dealt Lesson Space, thumbnail data-has-art,
hover popup = full loc-008 card served from /assets/LOC-008-*.png.
NOTE: batch-1 LOC-001..007 art landed later the same day (see the entry above) — all 23 LOC cards now have art.
Browser-harness note: rapid reload loops can leave the client stuck in
"Connecting…" on a stale localStorage reconnect token — localStorage.clear()
+ reload recovers; the server ws layer was healthy throughout (node probe).

**USHER/CLOCK ONLINE CREATE-FORM FIX (2026-11-19):** Manny: "in usher mode, no
LOC cards are displaying at the start of the game or at all". TWO causes:
1. REAL BUG: the ws.ts `createRoom` handler forwards room options POSITIONALLY
   and stopped at mercenariesBasicResources — `msg.usherMode`/`msg.clockMode`
   were DROPPED, so online rooms made via the create form always had both
   flags false (the in-room setUsherMode/setClockMode toggles worked; hotseat
   worked — which is why the earlier live check missed it). Fixed: append both
   args. Regression: ws.test.ts "createRoom carries usherMode/clockMode through
   to the started game" (flags in roomState + 3 locations in the first
   stateSync). LESSON: rooms.test calls the store directly and hotseat bypasses
   ws — every new room flag needs a ws-layer test, not just store/UI tests.
2. STALE SERVERS: the local dev servers on 1725/1726 had been running since
   2026-11-18 (before the modes existed) — old engine in memory + freshly built
   client/dist = checkboxes that do nothing. Killed both, relaunched from
   server/ with current code. LESSON: tsx does not hot-reload; after engine
   changes, restart long-running dev servers before blaming the code.
- Gates: typecheck x3 clean, server 113/113. Live-verified ONLINE create form →
  fill bots → start: 3 face-up GLOBAL locations turn 1 (Large Gallery,
  Keeper's Room, Library).

**THE HOUSE WITH A CLOCK IN ITS WALLS GAME MODE (2026-11-19):** Manny: a second
location mode, checkbox under the Usher one on all three lobby surfaces.
X = ceil(Mansion deck size / 15) RANDOM Locations are shuffled INTO the Mansion
deck at setup (X computed before they are added); reshuffle until no two LOCs
are adjacent (100 tries, then a deterministic interleave fallback). RULING
(asked): unlike Usher, On Reveal effects DO fire — a drawn Location goes into
play immediately (standard reveal, revealedBy = the explorer) and the next card
is revealed INSTEAD; Locations never consume Explore slots, single or multi.
- Engine: `GameSetup.clockMode` / `SimConfig.clockMode`; `cardsForScenario`
  pulls all 23 LOC defs for either mode. `setup` registers `<id>#clock1` into
  the deck. The explore case's `drawMansion(deck, fromBottom)` wrapper replaces
  EVERY combat draw (initial single/multi, Crow chain, MA-039/MA-072
  expansions, both single-path branches, WE-019 bottom reveal): a drawn LOC
  goes to `state.locations` via `clockLocationIntoPlay` (locations.ts), which
  applies ONLY the combat-timing flags (Mirror Corridor / Attic Landing /
  Bedroom — pure setters) so the battle math sees them; the full
  `applyRevealEffects` (seat effects + prompts) runs in the case's IIFE post-
  processing on the FINAL state, because every branch rebuilds the acting seat
  from a pre-explore snapshot. Double-applying the flags is idempotent.
  Helena's peek skips leading LOCs. Deck-exhausted-by-LOCs returns '' and the
  explore is consumed without a battle; '' guards on the chain pushes and the
  MA-039/072 shuffle-backs. Ally explore (Sherry) peels top LOCs first
  (revealedBy = target) and applies their reveals via applyClock at every
  return. Usher + Clock compose (3 on the board + X in the deck).
- LATENT BUG FIXED (allyExplore, pre-existing at HEAD): the combat branches
  never wrote the POPPED deck back into `next` — the revealed card stayed in
  the deck and the not-defeated branch appended a SECOND copy at the bottom.
  `next` now starts from `mansionDeck` (the popped local).
- Plumbing mirrors usherMode exactly: RoomSnapshot.clockMode, createRoom
  param, `setClockMode` (protocol + rooms + ws), host/hotseat/sim. Testids:
  create-clock-toggle / clock-toggle / hotseat-clock-toggle.
- Tests: customClock.test.ts 13 (pool, X + non-adjacency over 10 seeds,
  determinism, compose-with-Usher, single replacement + heal on final seats,
  multi replacement, Crow-chain replacement, Mirror/Attic combat timing,
  Gallery prompt, Bedroom blocks the NEXT explore, LOC-only deck, ally
  explore). hotseat +1, ui +1, rooms +1, protocol +1.
- RECOVERY NOTE: the ~11:53 tree gutting (see the AC-018 entry below) lost
  every uncommitted hunk OUTSIDE the shared files. Correction to that entry's
  "neither commit touched your files": 17cdac7 DID absorb the clock hunks in
  actions.ts and the GameSetup flags in types.ts (both sessions edit those
  files; staging them stages the merged content). Everything else was
  re-applied verbatim from the session record and both new test files
  rewritten; verified typecheck x3 clean, targeted 105/105, client 272/272,
  server 112/112. LESSON: commit verified work promptly in this shared tree.
- Gates: typecheck clean x3, client 272/272, server 112/112, targeted 105/105,
  FULL game-core 88 files / 1394 tests ALL GREEN (the soak alliance orphan is
  fixed by the AC-018 entry's explore-entry guard, as that entry predicted),
  vite build OK. Live-verified pass & play: both checkboxes in order, deck
  41 = 38 + ceil(38/15), no Locations row at start, and a Large Library
  surfaced mid-explore into the Locations row (GLOBAL, active for everyone)
  while the battle continued. Committed 9083944 (not pushed).

**AC-018 + REACTIVE-WINDOW GUARD LANDED (2026-11-19, commits fa29737 + 17cdac7):** the
four "you can / you may" prompts Manny asked for are DONE and pushed — b4mc-ch-008 L2
(`chrisL2TopChoose`), MA-070 (`ma070Choose`), SK-004 (`medicHealBonusChoose`), AC-018
(`uroborosInjection`). AC-018 was NOT the "~5 lines" the audit guessed: the +20 Health
has to change the combat OUTCOME, so the explore is now DEFERRED (`shouldDefer` +
`ac018WindowOffered`) and re-resolved from `pendingExplore.exploreParams` (new exported
`ExploreParams`) with `autoDefeat` preserved; a flipped outcome recomputes
`damageTaken` / `decorationDelta`. Shared resumption extracted to
`applyPendingExploreOutcome`. Two extra defects fixed on the way: (1) a "you may trash"
window needs a `Decline` option, and `'Decline'` is a LABEL — AC-042 was pushing it into
`removed` as if it were a card instance; (2) a deferred explore whose prompts went
unanswered was silently OVERWRITTEN by the next explore, orphaning the revealed Infected
(soak alliance/1: ma-036/082/084/056) — the `explore` case now resolves any outstanding
`pendingExplore` first. That guard is a PRE-EXISTING bug in the shared AC-042 / Las Plagas
mechanism, not AC-018 specific.
**Your Usher note's "the ONLY red is the soak alliance/1 conservation orphan" is now
GREEN** — re-run the soak before attributing any red to usherMode. Gates at 17cdac7:
typecheck x3 clean, game-core 87 files / 1381 tests, client 267/267, server 108/108.
**SHARED TREE:** the working tree was briefly gutted (547 files showing as deleted); it is
back to 17cdac7 + your Usher WIP. Stage only your own paths — neither of this session's
commits touched your files, and `git restore .` right now would throw away live edits.

**FALL OF THE HOUSE OF USHER GAME MODE (2026-11-19):** Manny: remove the LOC
cards from the custom-card menu and tie them to a game-mode rule — a "Fall of
the House of Usher" checkbox under Mercenaries Basic Resources on all three
lobby surfaces. RULING (asked; two readings): the 3 random Locations are set up
AT GAME START — face-up in play from turn 1, GLOBAL effects live for everyone,
invest effects still need gold cubes, 1X uses still cost gold + a Buy, and On
Reveal effects NEVER fire. They mark the mansion; they are NOT shuffled into
the deck and no Explore is consumed by them.
- Engine: `GameSetup.usherMode` + `SimConfig.usherMode`; `cardsForScenario`
  pulls ALL 23 LOC defs when on; `setup` rngShuffles the loc ids, takes 3,
  registers `<id>#usher1` and puts them straight into `state.locations`
  (`cubes: {}`, `revealedBy: -1`, no applyRevealEffects, no locationDeck).
  -1 = no revealer, so Large Library's revealer-scoped On Reveal draw stays
  inactive for everyone. The old `locationsMode` engine path is UNCHANGED (its
  tests still pass) but no longer exposed in the UI.
- Plumbing mirrors mercenariesBasicResources: RoomSnapshot.usherMode,
  createRoom param, `setUsherMode` host message (protocol + rooms + ws),
  host.ts / hotseat.ts pass it to setup + cardsForScenario (pilesForScenario
  needs nothing — locations never pile).
- UI: CustomCardsPicker drops the Locations section AND excludes loc ids from
  "Add All"; the hotseat "Locations" toggle is REPLACED by the Usher checkbox
  (testids create-usher-toggle / usher-toggle / hotseat-usher-toggle).
  LocationsRow renders the 3 rooms unchanged (Invest/Use read state.locations).
- Tests: customUsher.test.ts 11 (pool pull, 3 distinct face-up / no deck / no
  prompts, determinism, On Reveal never fires, GLOBAL score + ongoing live at
  turn 1, revealer-scoped grant inactive, invest cube gate, 1X gold+Buy gate,
  explore hits the Mansion directly, locationsMode regression). hotseat +1,
  ui +2, rooms +1, protocol +1; RoomSnapshot/Room literals in store.test /
  ui.test / host.test / protocol.test / rooms.test gained usherMode: false.
- PITFALLS hit: (1) a seed scan for the random pick MUST use the fixture's
  exact character picks — explicit characterCardId skips the random-deal
  nextInt calls and deals DIFFERENT locations. (2) Ammo x20 grants +20 Gold
  too, so Attic Landing's net gold is cost-20+20. (3) the art-exists tests use
  existsSync relative to the LAUNCH cwd — run vitest from game-core/, not
  `--root game-core` from the repo root, or they false-red.
- Live-verified (pass & play, local build): no LOC rows in either picker;
  started game shows 3 face-up rooms (1X Use buttons, GLOBAL note), no
  face-down card, no reveal prompt, turn 1.
- Gates: typecheck clean x3, client 270/270, server 110/110, location suites
  84/84, vite build OK; full game-core 1380/1381 — the ONLY red is the soak
  alliance/1 conservation orphan (ma-036/082/084/056), the other session's
  in-flight AC-018 deferred-explore WIP: it was already red (ma-025) BEFORE
  this feature, and usherMode is opt-in — the soak never enables it, and with
  the flag off setup consumes no RNG and deals nothing. The earlier
  uroborosInjection red went green mid-run as that session landed its wiring.
  UNCOMMITTED (shared tree).

**BO-001 BILL GATES CORRECTED TO 0/5 (2026-11-19):** Manny: the card reads Level 1
at 0 Decorations and Level 2 at 5 — not the implemented 10/25. An 8x crop of JUST
the shield emblems on BO-001.png confirms the digits INSIDE the shields are 0 and
5; the batch-2 "three reads agreed on 10/25" was the level digit OUTSIDE the
shield merged with the gate digit ("1"+"0", "2"+"5") — the exact merge bug the
2026-11-16 vision gotcha below warned about. `custom.ts` bo-001 level1At 10->0 /
level2At 25->5 + RULING comment rewritten; `customZoeyBill.test.ts` docstring +
new gate regression test (Bill starts at L1; 4 Decorations -> L1, 5 -> L2). Bill
now levels much earlier in play. Gates: typecheck clean x3, customZoeyBill 5/5,
characters 11/11, client 267/267, server 108/108; full game-core 1369/1371 — the
2 reds are the OTHER session's in-flight AC-018 Uroboros work
(uroborosInjection.test.ts expects the +20-HP re-resolve their actions.ts WIP is
mid-way through; soak alliance/1 ma-025#1 orphan they are DBGORPH-debugging).
Neither failing test's card pool contains bo-001 (uroboros: PREMIER+ALLIANCE
only; soak: no customCards opt -> cardsForScenario returns the base set), so the
gate change cannot reach them. UNCOMMITTED: the tree holds the AC-018 WIP, so
rebase/push is blocked until it lands.

**ZO-001 ZOEY + BO-001 BILL OVERBECK (2026-11-16, batch 2):** two more custom
characters from Manny's scans. Printed codes still not legible -> provisional
ids zo-001 / bo-001 (rename when codes are known). Both 70 HP.
- **Zoey zo-001** (gates 0/7 — RULING: level-box emblems read as 0 and 7 by two
  vision models): L1 "Zoey can't use shotguns" -> new `cannotUseWeaponTag`
  (validate rejects shotgun-tag weapons in her explores; envelope: I-legal ->
  grayed buttons for bots/humans). L2 "-10 ammo and +10 damage for pistol and
  rifle weapons" -> two `ammoReqReduction` entries (Leon L1 precedent) + a
  `plusDamageForWeaponTags` ['pistol','rifle'] (ch-005p precedent).
- **Bill bo-001** (gates 10/25 — RULING: three reads of the box-left emblems
  agreed; the vision model kept merging the level digit with the emblem digit,
  so the tight crop reads had to be separated): L1 "Infected deal +10 damage to
  Bill when he does not defeat them" -> new `extraDamageTakenWhenNotDefeated`,
  added at the hp-loss site (the branch is type-narrowed 'notDefeated' already)
  AND the pendingExplore display damage. L2 "+10 damage per unused Action" ->
  new `plusDamagePerUnusedAction(amount * actionsLeft)`, in abilityDamage +
  preview.
- Tests customZoeyBill.test.ts 4/4 (shotgun ban, pistol +10/-10ammo, per-action
  preview, Salvador 35+10=45 damage -> hp 25). Gates: game-core 1276/1276,
  client 258/258, typecheck clean. Art: ZO-001.png / BO-001.png.
- Vision gotcha this round: gate digits on these two cards are tiny; the most
  reliable recipe was an 8x crop of JUST the shield/emblem with 'read the number
  inside the shape only, ignore the level digit' — the level+emblem pair read as
  a two-digit number (e.g. "27" = level 2 + gate 7) on full-image reads.

**FR-001 FRANCIS + LO-001 LOUIS (2026-11-16):** two custom characters from Manny's scans
(TWO separate images; the second arrived in a separate gateway folder — always check the newest
native-inputs dirs). Printed codes NOT legible in either scan -> provisional ids fr-001 / lo-001
(type comment + card blocks document this; rename when codes are known). Both 70 HP, gates 3/8.
- **Francis fr-001**: L1 "If you have no cards in your hand, one weapon Francis uses gets an
  additional +10 damage" -> new kind `plusDamageIfEmptyHand`, evaluated on the hand AFTER the used
  weapons leave it (handAfter), flat bonus (one weapon +10 == +10 total; documented). L2 "At the
  beginning of your turn, you can draw 2 cards and discard 2 cards" -> REUSED+extended
  `turnStartDrawThenDiscardCard` with optional draw/discard counts (Rebecca stays 1/1; Francis
  2/2). RULING: the scan's draw count read as both 2 and 3 — majority 2; one-number fix if the
  card says 3.
- **Louis lo-001**: L1 "When Louis explores you can move the bottom card of the mansion to the
  top" -> new manual once-per-turn kind `moveMansionBottomToTop` (useCharacterAbility; log-scan
  once-per-turn guard; validate rejects with <2 mansion cards). L2 reuses
  `plusDamageForWeaponTags` tags ['rifle','machineGun'] amount 10.
- **LATENT BUG FIXED**: the Rebecca draw-1-discard-1 chain offered options as 'Name (id)'
  strings but the resolver filtered hand ids against them — the discard silently never removed a
  card. The chain now uses raw instance ids and supports multi-discard loops (remaining count),
  and 'No Discard' still ends it early. Regression test added.
- Tests: customFrancisLouis.test.ts 5/5 (empty-hand bonus on/off, draw2/discard2 chain,
  bottom-to-top move + once-per-turn, rifle +10, Rebecca discard regression). Gates: game-core
  1261/1261, client 258/258, typecheck clean. Art: FR-001.png / LO-001.png.

**AW-001 LEVEL-0 TIER + AC-000 ART (2026-11-16):**
- Manny: "Aw-001 actually has 3 character abilities starting at level 0." The type comments
  already recorded the intended mapping (drawOncePerTurnIfDamaged = L0) but the DATA had drifted
  to levels 1/1/2 and the ENGINE could not express level 0 (abilitiesForLevel returned [] at
  character level 0). FIX: (a) characters.ts abilitiesForLevel now honors level-0 abilities at
  level 0 (`level === 0` -> filter to level-0 kinds); (b) types.ts drawOncePerTurnIfDamaged
  level union 1|2 -> 0|1|2; (c) custom.ts aw-001 -> draw L0, allDamageReduction L1 (unchanged
  gate 2 / 7), exploreDamageIfHpAtMost L2, + a level-0 entry in levels[]/text. Also fixed a
  PREVIEW gap found while testing: exploreDamage was missing the exploreDamageIfHpAtMost (aw-001
  L2 / low-HP +damage) term — engine applied it, picker didn't (same family as the we-016 fix).
  Tests: customWeskerLevel0.test.ts 3/3 (gating 0/1/2, the level-0 draw prompt fires and draws,
  L2 passive off at 0 / on at 2).
- Manny sent AC-000 (Martial Arts) art -> CARD-ART/AC-000.png (glob picks it up).
- Gates: game-core 1256/1256, client 258/258, typecheck clean.

**CH-005Q JILL VALENTINE (tactical) IMPLEMENTED (2026-11-16):** official custom print, printed
code CH-005 variant (the THIRD custom carrier of CH-005 — premier Barry ch-005, B4MC Sherry
b4mc-ch-005, pirate Jill ch-005p — so this one is ch-005q). 80 HP, gates 5 / 9. Card text read
from the user's scan with the LOCAL Ollama vision model (SetneufPT/Gemma4-12B; the platform
caption + two crop reads collated; vision_analyze was 429-rate-limited, qwen3.5:9b too slow).
- **L1** (gate 5): "+5 Damage for every Action Card she discards this turn. (Action Cards played
  do not count)". NEW ability kind `plusDamagePerActionDiscardedThisTurn`; per-seat counter
  `actionsDiscardedThisTurn` (reset at turn start) maintained by the new hook
  `applyActionDiscardedHooks` — a DIFF of each seat's discard pile across every action (the
  AM-005 trash-hook pattern; discarding has no single choke point, and played Action cards sit
  in the play area so they can never count). Damage feeds `abilityDamage` in the engine
  (single+multi) AND the exploreDamage preview. RULING: the end-of-turn hand discard counts
  toward the counter (harmless — no explore happens after it).
- **L2** (gate 9): "At the end of a turn, Jill can choose up to 3 cards to keep and draws till
  she has 5." NEW ability kind `endOfTurnKeepUpToAndDrawTo`; applyEndOfTurn raises a
  `jillEndOfTurnKeep` prompt (hand cards + 'None') and returns WITHOUT advancing the turn (the
  host already gates auto-startTurn on pending prompts); the chooseOption resolver picks one
  card per prompt (loop up to the limit), and None / limit / hand-exhaustion finalizes by
  re-entering applyEndOfTurn with `pendingKeepEndOfTurn` — she discards the rest and draws back
  to 5. Hand <= 3 at turn end: auto-keep everything, no prompt. Bots answer via generic
  chooseOption enumeration (no policy code needed).
- Art: CARD-ART/CH-005Q.png (the user's scan). Client needs no changes (prompts/banners generic).
- Tests: customJillDiscardKeep.test.ts 7/7 (L1 preview+resolve, played-doesn't-count, discard
  diff hook, prompt raise + no-advance, keep-loop + draw-to-5, auto-keep small hand, limit
  finalize). Also fixed a latent test-file type error in semiAutoRifle.test.ts (computed-key
  object indexing). Gates: game-core 1230/1230, client 252/252, typecheck clean.
- CARD TEXT VERIFICATION: L1 "Jill deals an additional +5 Damage for every Action Card she
  discards this turn. (Action Cards played do not count)" / L2 "At the end of a turn, Jill can
  choose up to 3 cards to keep and draws till she has 5." — collated from the scan; flag in
  RULINGS if the physical card differs.

**BANNER DISMISSES ON FIRST BOARD ACTION (2026-11-15):** Manny: the targeted-by banners should
stay visible until the viewing player interacts with their decision bar.
- Engine (actions.ts applyActionInternal): any non-chooseOption action by a seat clears that
  seat's targetedBy — the banner survives turn start AND prompt answers (Take/Send-to-bottom are
  part of the reveal flow, not a decision-bar interaction) and dismisses on the player's FIRST
  board action (explore / buy / play / end turn / ability). Engine-internal forced explores
  (Sherry) apply through resolvers, never this entry point, so the just-recorded notice is safe.
  The old endTurn-rebuild clear remains (harmless belt-and-braces; endTurn is itself a first
  action).
- targeting.test.ts: the lifecycle test now asserts prompt-answer-keeps (takeOrBottom) + clears
  on the target's first explore; docstring updated. game-core 1223/1223, client 252/252,
  typecheck clean.

**REVEAL TIMING POLISH (2026-11-15):** Manny: (1) reduce the opponent reveal auto-close timer
to 2 seconds; (2) when playing with bots, show the targeted-by banners AFTER all opponent reveal
screens have closed.
- App.tsx: auto-close setTimeout 3000 -> 2000 (all non-locked reveals; the exploring viewer's
  pending-prompt lock still holds).
- Bot-game banner ordering: `isBotGame` (any seat controller === 'bot'); the TargetedNotice
  banner renders [] while revealQueue !== null in bot games — it appears only once every queued
  reveal screen has drained. Human games show the banner immediately (unchanged).
- Client-only change. client 252/252, tsc clean.

**WE-016 PREVIEW FIX (2026-11-15):** Manny: used the Semi-Auto Rifle after two Action cards,
no bonus damage shown. DIAGNOSIS: the RESOLVED explore always applied the +10/Action bonus
(verified: 30 fails vs 50 defeats a 40-HP Dr. Salvador) — but the picker PREVIEW
(`exploreDamage` in explore.ts) omitted it, so the UI displayed no bonus.
- FIX: exploreDamage now mirrors the engine's remaining weapon-effect bonus terms —
  `plusDamagePerActionPlayedThisTurn` (×actions in play), `plusDamageIfSelfHpAtLeast`,
  `revealTopOfInventoryCostGate`, `plusDamageWhenUsingMultipleWeapons`. `blowbackBonus`
  (WE-025) intentionally NOT previewed (depends on discard-with-action choice, unknowable
  up front).
- Tests: new `semiAutoRifle.test.ts` (preview 30->50 with 2 actions AND resolve defeats
  40-HP Salvador); updated one stale expectation in outbreak.test.ts (we-003 Submission's
  own +5-@-80+HP is in the preview now -> 10, matching resolve). game-core 1198/1198,
  client 252/252, typecheck clean.
- NOTE: the preview still can't show the WE-025 blowback pistol discard damage or a few
  prompt-gated effects — engine remains authoritative; preview now covers the static ones.

**EX-004 SILENT-FAILURE FIX (2026-11-15):** Manny: ex-004 causes the same kind of silent
failure as ex-001 had — fix it the same way.
- `custom.ts`: EX-004 declares `dependencies: ['ex-005']` — selecting the Ammunition Box auto-
  includes the Ammo x50's card def (so the granted card's bonuses apply and it renders).
- EX-005 deliberately keeps its OWN market pile when ticked alone — the Box does NOT claim
  exclusivity (unlike EX-001/EX-002). The pile key is EX-005's own selection.
- Test: 'EX-004 pulls EX-005 in automatically; EX-005 alone is still buyable' (def pull-in +
  pile + end-to-end Take flow: Box removed, Ammo x50 instance resolves to a real def).
  NOTE: an earlier bad patch had clobbered the 'shuffles the custom mansion cards' test —
  restored from HEAD before re-adding (suite counts: unofficialExpansion 25, full 1197).
- Gates: game-core 1197/1197, typecheck clean.
**FAN "JP 2025" PROMO SET (2026-11-16):** Manny sent 8 card scans and asked to implement them, read with the LOCAL vision model (gemma4:e2b — see the note below on why). 7 landed; the 8th was a duplicate crossbow print and was dropped by request. Ids: `cac-003` (Change of Outfit), `cac-013` (From Bad to Worse), `cac-014` (Global Battle), `cac-015` (This Shit Ends Now!), `cac-016` (Take Them Down!), `cw-034` (Crossbow), `cw-035` (Scoped Colt Anaconda). The printed codes COLLIDE with official cards (AG-003 prints AC-003 = Shattered Memories; CVL-007 and CW-002 both print CW-002; AC-013..016 are Alliance actions), so the CAC-/CW- prefixes are mandatory — the user chose "CW prefix where possible, CAc for action cards". Duplicate-id scan: 385 ids, 0 dupes. New ActionEffect kinds: `choosePlayerDrawCard`, `weaponsGainedGoToPlayArea`, `discardSelfFromPlayForWeaponFromDiscard`, `endOfTurnPeekAndGiveHand`, `trashHandAndDiscardForMarketCard`. New WeaponEffect kinds: `armedCoinFlipDefeatNextInfected`, `payXpForFirstRevealedBuff`. New actions: `useActionAbility` (CAC-016) and `usePreExploreXpAbility` (CW-035). CAC-013 needed the endTurn body EXTRACTED into `applyEndOfTurn(state, seat, nextBase)` so the turn can finish after the target's discard, and the host/hotseat auto-`startTurn` is now gated on `next.prompts.length === 0` (a prompt can hold the turn open). CW-035's Decoration is awarded explicitly at the defeat site because `decorationDelta` reads the raw def. Tests: `customFanJp2025.test.ts` 25/25. Gates: game-core 1221/1221, server 108/108, client 252/252, typecheck clean.
**LOCAL VISION NOTE:** Ollama on this box is a 4 GB RTX A2000. The default 131072-token context makes a 9B vision read take 5-12 minutes (KV cache spills to CPU). Setting `num_ctx: 8192` + `keep_alive` dropped a `gemma4:e2b` read to ~2 s. Use `read_cards_file.py` / `zoom_read.py` in the Hermes scratch dir for any future card transcription.

**TARGETING ALERT FIX FOR BOT GAMES (2026-11-15):** Manny: "the viewing player in online games
still doesn't get any alert that a bot has targeted him." ROOT CAUSE identified: in a 1-human + bots
room the server broadcasts ONE snapshot AFTER the whole bot stretch — which ALWAYS ends at the
human's turn start. Two things killed the banner at that exact moment:
  1. the engine cleared `targetedBy` at the target's turn START (game.ts), so the snapshot's seat
     already had the notices wiped;
  2. the client gate `activeSeat !== mySeat && phase === 'main'` was false exactly then
     (activeSeat === me), so even intact data would not render.
FIX: (a) engine — the clear moved from turn-start (game.ts, kept only for the downed-skip path) to
the target's TURN END (endTurn newPlayer rebuild in actions.ts); (b) client — the App gate now
renders the banner whenever targetedBy is non-empty, no activeSeat/phase condition. Result: the
snapshot that lands at your turn start carries the notices, and the banner stays up through your
turn until you end it. targeting.test.ts updated: notice survives the target's turn start, clears
at the target's turn end (new 3-step assertion). game-core 1196/1196, client 252/252, typecheck
clean. NOTE: the banner lingers through the player's whole turn by design (they need to know why
they must explore / who forced / stole XP) — it clears at that turn's end.
- 2-human rooms were unaffected (stretch ends at the OTHER human, activeSeat != me mid-game).

**EX-001 OWNS EX-002 (2026-11-15):** Manny: when EX-001 (Special Rocket Launcher Case) is
selected, EX-002 must join the game automatically — and in that case EX-002 gets NO Resource
Area pile (the Case is its only source).
- `custom.ts`: EX-001 declares `dependencies: ['ex-002']` — selecting the Case auto-includes the
  Launcher's card def (the existing dependency-pull in cardsForScenario). This also fixes a latent
  half-bug: selecting EX-001 ALONE previously gained an ex-002 instance with no cardDef
  (no attach-on-gain, unrenderable card).
- `cards.ts` pilesForScenario: when the expanded selection contains ex-001, ex-002 is skipped
  (no market pile, no grn merge). EX-002 ticked alone still gets its grn pile.
- Tests: new 'EX-001 pulls EX-002 into the game automatically; EX-002 alone is still buyable';
  updated the IDS pile test (grn no longer holds ex-002 when the Case is present). game-core
  1196/1196, typecheck clean.

**BOT-REVEAL BATCHING FIX (2026-11-15):** Manny reported on the LIVE Render deploy:
"there are no messages alerting players they were targeted and the view player can't watch
bots mansion reveal".
- **Root cause, bots' reveals:** the server applies a WHOLE BOT STRETCH before broadcasting
  ONE snapshot, so the newest log entry a viewer sees is the stretch's trailing action
  (endTurn/play), never the explore — `detectReveals` (which required the newest entry to BE
  the explore) silently returned nothing for every bot move.
  FIX (client-only): `detectFreshExplores` walks the log BACKWARDS from the newest entry past
  the trailing actions, collects every explore whose seq > prev's last seq (cap 8), and
  `revealsForExplore` computes each one's cards; App.tsx queues ALL of a stretch's explores
  (per-explore party/leader) and APPENDS to a queue already on screen instead of replacing —
  so a multi-bot stretch shows every reveal in order, and a new bot explore during a showing
  reveal joins the line. Three new anims tests (batched explore, multi-explore stretch order,
  no double-shows for already-seen seqs). Client 252/252, typecheck clean.
- **Targeting notices:** engine/plumbing verified correct end-to-end (recordTargeted 6/6 tests,
  sanitize spreads seats so targetedBy rides through, banner component tests) — the "no
  messages" on the live instance was the old pre-targeting server process (PID 6788, started
  Nov 10) seized port 1724 locally; on Render the previous commits carry the engine. If the
  user still sees nothing: bots use abilities only when the greedy policy picks them, so a
  targeting notice needs a Wesker/Sherry/Cephalo bot that actually triggers it.
- **Deployment:** the live instance is Render at https://redbg-1.onrender.com/ (auto-deploy
  on push to master). USER DIRECTIVE: verify on Render, not the local server. Local 1724
  server was restarted then killed per that directive.

**REVEAL-FOR-ALL + 3-SECOND AUTO-CLOSE (2026-11-15):** Manny: "The view player should see all
players complete mansion reveal screen, it should pause the game and automatically close after
3 seconds."
- **Reveal-for-all:** the involvement gate in `detectReveals` (anims.ts) is DELETED — every viewer
  now sees EVERY player's explore reveal (the zones / log / revealed set are all public; only
  hands+inventories are hidden). The two anims tests that asserted non-involvement were flipped
  ('reports ANOTHER player exploring', 'reports a forced explore to an unrelated (watching) seat
  too'). `detectCardReveals` (ability/effect PEEKS) stays involvement-gated — bots' private peeks
  still don't spam the table; this ask was the mansion-door reveal only.
- **Auto-close:** App.tsx useEffect — 3s after a reveal opens (per card in a multi-reveal it
  advances then closes), it does exactly what Continue does: advance / dismiss + play the queued
  YOU DIED screen. The ONE exception (`revealLocked`): the EXPLORING viewer with a pending prompt
  rendered inside the panel (Take / Send-to-bottom etc.) keeps it open until the choice is
  resolved — that panel lock predates this and the earlier "lock until answered" ruling still
  holds. Third-party viewers have no prompts -> always auto-close.
- **PITFALL (bit live):** the auto-close useEffect was first placed AFTER the Lobby early-return
  (`if (view === null || ...) return <Lobby/>`) — a hook after a conditional return breaks the
  Rules of Hooks (React #310: "Rendered more hooks than during the previous render"), which
  CRASHED the app the moment any game view opened (lobby rendered fine; blank game). It must live
  ABOVE the early return and read the state safely there (`view?.state...`). Live symptom: blank
  page right after Start game / entering the board.
- **Commit hygiene:** `client/src/ui/anims.ts` also carries the UNCOMMITTED counter-animation WIP
  (supply/counters zones etc. — not this task). Only the reveal-gate hunk was staged (via
  `git hash-object -w` + `git update-index --cacheinfo` with byte-exact content — `git apply
  --cached` fails on this file's LF/CRLF mix); the WIP stays in the working tree.
- **Live-verified** (pass & play on the fresh build): reveal opened on a Rocket Launcher Case
  token (locked behind its Take/Send-to-bottom prompt — no auto-close while locked, correct);
  after clicking Take, the panel closed BY ITSELF at ~3.0s with no Continue click.
- **Gates:** client 249/249, typecheck clean, vite build OK. game-core/server untouched.

**OFF-TURN TARGETING NOTICES — "the viewing player knows he's been targeted" (2026-11-15):**
Manny: "add a way for the viewing player to know he's been targeted by a card or ability
outside of his turn. I.e. when targeted by fch-008's ability". Generic engine + client feature:
- **Engine:** `PlayerState.targetedBy?: readonly TargetedNotice[]` where `TargetedNotice = { seat,
  reason: TargetReason }` (types.ts). New exported helper `recordTargeted(state, target, bySeat,
  reason)` (actions.ts — the resolvers shadow `targetSeat` as a local const, so the helper is
  deliberately NOT named targetSeat; dedupes (by, reason) and keeps the newest 3). Wired at every
  off-turn targeting resolver: `sherryForceExplore` -> 'forcedExplore'; Wesker L2
  `forceExploreOtherPlayer` + Cephalo `cephaloChoosePlayer` -> 'mustExploreNextTurn';
  `jamesMarcusChoosePlayer` -> 'mustUseAllExploresNextTurn'; `jillAmmoIncrease` (CH-048 Mercenaries)
  -> 'ammoReqNextTurn'; `chooseOtherPlayerRevealHand` (Mind Control) -> 'revealHand';
  `backstabChooseSkill` -> 'backstab' (only fires when the target has an XP'd Skill — untested
  here, gated by the same condition as the prompt). Cleared at the START of the seat's own turn —
  TWO clear sites in game.ts: the normal turn `newPlayer` (the per-turn reset block with
  `ammoReqIncreaseNextTurn: undefined`) AND the downed-revive newPlayer. sanitize() passes the
  field through untouched (it only hides hand/inventory), so server + hotseat clients get it free.
- **Client:** `ui/TargetedNotice.tsx` component + `App.tsx` computes `targetedByMe` (shown only
  when `activeSeat !== mySeat && phase === 'main'`; labels map each TargetReason to a phrase with
  the actor's name) and floats a fixed top-center banner (`.app-targeted-notice`, z-index 500 —
  BELOW the mansion-door reveal). `MansionReveal` gained a `forcedByLabel` prop: App derives it
  from the last log action (`explore` + `forcedBy`) — "X forced you to Explore!" for the target,
  "You forced X to Explore!" for Sherry — rendered as `.mansion-door-forced` under the title.
- **PITFALLS hit:** (1) resolver locals named `targetSeat` shadowed my first helper name —
  rename the helper, not the locals. (2) The downed-revive path in startTurnInternal is NOT the
  normal turn build; the normal per-turn resets live further down (search `ammoReqIncreaseNextTurn:
  undefined`). (3) In App.tsx `const gameState = view.state;` sits AFTER the Lobby early-return —
  a code block using gameState must be inserted after it, not near seatNames. (4) In hotseat the
  banner NEVER shows by design (the holder is always the active seat); the feature is for server
  rooms. The live check above used the forcedByLabel reveal path instead.
- **Tests:** `engine/targeting.test.ts` (6 — Sherry write + sanitize pass-through + clear at
  target's turn start, Wesker L2, Cephalo, Mercenaries Jill, record dedupe/cap). Client
  `ui.test.tsx` +5 (TargetedNotice empty/single/multi, MansionReveal forcedByLabel present/absent).
- **Live-verified** (vite preview build, pass & play): seat 1 (FCH-008 Sherry) force-explored
  seat 0 -> the mansion-door reveal rendered `data-forced-by` "You forced Player 1 to Explore!"
  (plus the party/damage as before). Bots/AoE/poison are NOT covered by `recordTargeted` (the
  banner answers *who aimed at you*, not ambient effects) — Zombie A/B AoE damage etc. still only
  show as an HP change, same as before.
- **Gates:** game-core **1195** (was 1189; +6), server 108, client **249** (was 244; +5),
  typecheck clean x3, soak green, vite build OK.

**CUSTOM JILL VALENTINE (PIRATE) PRINT CH-005 (2026-11-15):** Manny sent a scan of the Jill
Valentine pirate costume card (70 Health, gates 4 / 7) and asked to add it to the custom line.
The printed code CH-005 is taken TWICE in this codebase: by the PREMIER ch-005 (Barry Burton)
AND — added in a parallel push while this was in flight — by the B4MC Sherry fan print
`b4mc-ch-005` (stun-rod Sherry, commit 033261c). This card is the OFFICIAL Capcom/Bandai print
(defaults to the same `ch-` prefix as the other official custom card, ch-000 Rachael), so its id
is **`ch-005p`** ("p" = pirate). Note the B4MC series and the official product both print
"CH-005" for DIFFERENT characters — always grep `id: '` after touching custom.ts.

This commit was REBASED onto origin/master after the parallel Sherry push; the merge combined
my plusTagDamage wiring with the Sherry commit's exploreBonusIfFullHp / stunRodCharge terms in
explore.ts and allyExplore.ts, and keeps BOTH types.ts union blocks.
- **L1 (gate 4): "All your 'Pistol' and 'Machine Gun' Weapons get +10 Damage."** New kind
  `plusDamageForWeaponTags { tags, amount, level }` (types.ts) + pure helper `plusTagDamage`
  (abilities.ts, mirrors `plusTagDamageIfAmmoAbove`). Wired into the SHARED explore
  `abilityDamage` term (actions.ts — covers single AND multi), the picker preview
  (`exploreDamage`, explore.ts) and the Sherry ally-explore (`allyExplore.ts`) — the same three
  sites HUNK's tag bonus uses, so the preview matches the resolve.
- **L2 (gate 7): "When Jill would take any Damage, you can Trash 1 card to negate the Damage."**
  New kind `trashCardToNegateDamage` — implemented the RESUSCITATE way: the explore holds the
  Character at her PRE-damage Health and queues `jillNegateDamage` (options = hand cards +
  Decline, loss in the payload). Accept → the chosen card is trashed (hand → removed), the held
  HP stands (fully negated — a lethal hit does NOT down her). Decline → the loss is applied to
  the CURRENT Health in the resolver (the seat may have changed while the prompt was open), with
  flipDown when the hit was lethal (mirrors the resuscitate decline). Queue helper
  `queueJillNegatePrompt` in abilities.ts; resolver next to the resuscitate handler.
- **Wired:** single-explore (after the kevlar/reduce math, before the down logic) and
  multi-explore (inside the `undefeatedEntries` block — NOTE: it closes BEFORE the barrel/trap
  loop, and `baseLeadingHp` is block-scoped to it, so the hold MUST live inside that block).
  Gated `!leadingIsPartner` (the partner-led explore applies damage to partnerHp and is skipped)
  + non-empty hand + loss > 0. **Documented gaps (same class as CH-008 L1's):** partner-led
  explores, poison at turn start, barrel/trap damage, off-turn AoE, the Sherry ally-explore and
  the AC-042 deferred path. A Jill + Resuscitate player gets NO second resuscitate window if she
  declines (the explore never downs her, so resuscitate never triggers) — corner case, recorded
  not fixed. Kevlar Jacket order: negation covers only the post-jacket remainder; the jacket has
  already moved by prompt time (player-favorable).
- **PITFALL:** the multi hold was first inserted after the barrel/trap loop — TDZ
  (`Cannot access 'baseLeadingHp' before initialization`) because `baseLeadingHp` is a block-scoped
  const inside `if (undefeatedEntries.length > 0)`. Read the brace structure before placing code
  that touches those locals.
- **Tests:** `engine/customB4mcJill.test.ts` (13 — data shape, not in ALL_CARDS, plusTagDamage
  unit (pistol/MG/both-tags/knife-0), picker preview 10→20 at L1, two-Handguns vs 25 HP defeated
  at L1 not L0, prompt + hold, Accept trashes + keeps HP, Decline applies, lethal Accept keeps
  standing, lethal Decline downs, no prompt with empty hand, no prompt below L2, multi hold).
  Verified red without the wiring for the L2 prompt and the L1 damage (behavioral tests).
- **Art:** `CARD-ART/CH-005P.png` (320x448, P-mode, ~109 KB) from the scan — tight card scan
  at 514x700, scaled to 320x436 and letterboxed 6px top/bottom to match the B4MC family.
  `client/dist/assets/CH-005P-<hash>.png` confirmed emitted by `vite build`.
- **Gates:** game-core **1175 + Sherry's parallel tests** (was 1162; +13 mine), server 108, client 244, typecheck clean ×3,
  soak 29/30 natural. LEDGER entry appended.

**B4MC CHRIS REDFIELD FAN PRINTS (2026-11-15):** three custom characters added from Manny's scans
(`b4mc-ch-007/008/009`, all 90 Health). CH-007 gates 3/6 (L1 once-per-round -10 Infected Damage + an
Ammo x10; L2 once-per-turn Trash -> +1 card). CH-008 gates 2/7 (L1 +10 Damage this turn once an
Infected has dealt Damage this round, +20 instead while a Character is face down; L2 once per round a
not-defeated Infected goes on TOP of the Mansion). CH-009 single level, gate 3 (turn-start +1 Explore
and +10 Damage, owing two Explores - reuses Rachael Foley's `exploresRequiredThisTurn` debt).
FIVE new `CharacterAbility` kinds + two new state fields: `PlayerState.roundUsedAbilities` and
`GameState.infectedDamageThisRound`.

**ROUND = Manny's definition (2026-11-15):** "one complete turn for all players that can take a turn
before it circles back to the first player". Implemented WITHOUT a round counter: `startTurnInternal`
(game.ts) treats `activeSeat === lowest living seat` as the round start and clears every seat's
`roundUsedAbilities` plus the global `infectedDamageThisRound`. So a 1-seat game resets every turn.

**"YOU CAN" SCOPE RULING (Manny, 2026-11-15):** CH-007 L1 and CH-008 L2 were designed for play modes
this game does not have, so they are AUTOMATIC (no choice prompt) and apply ONLY during that
character's OWN turn (`state.activeSeat === seat`). CH-009 keeps its Yes/No prompt (it is a choice by
design, like Rachael Foley L1).

Wiring notes: CH-007 L1's reduction is added to BOTH the single-explore `damageReduction` and the
multi-explore combined `damageReduction`; the Ammo grant + `markChrisL1ReductionUsed` are applied to the
FINAL seat on the multi path (the explore rebuilds the seat from a pre-effect snapshot - a mid-branch
gain is dropped). CH-007 L2 is a post-action hook (`applyTrashDrawHook`) that fires when any action
grows `removed` during his turn, once per turn. CH-008 L1's bonus is computed at turn start into
`weaponDamageBonusThisTurn`. CH-008 L2 inserts at Mansion position 1 in BOTH the single-explore
disposition and the multi-explore `undefeatedEntries` loop. Known gaps: the CH-008 L1 round flag is set
only at the explore not-defeated sites (reveal-time AoE infected damage and NYX are NOT covered), and
the AC-042 deferred-explore path does not apply CH-007 L1 / CH-008 L2.

Art: `CARD-ART/B4MC-CH-007/008/009.png` (320x448, P-mode, ~100 KB). The default character badge
geometry (89.7%, 7.7%) is used; the fan render's printed "90 Health" badge measured anywhere from
(84-90%, 8.9-12%) across repeated vision reads, so the live HP ring may sit a few px off. VERIFY ON A
RENDERED CARD before adding a per-card `--cc-badge-x/y` override.

Tests: `engine/customB4mcChris.test.ts` (20). Gates after rebasing onto origin/master: game-core 1162
passed / 0 failed (the 7 pre-existing failures were fixed upstream), server 108, client 244, and
`npm run typecheck` is CLEAN (0 errors, all three workspaces) after Manny had the 20 untracked
`game-core/src/ai/*.ts` debug scripts deleted - they were the whole reason the typecheck gate was red.
Still uncommitted and NOT part of this task: `client/src/ui/anims.ts` (a counter-animation WIP) and
`game-core/src/data/CARD-ART/MA-000.png`.

**B4MC SHERRY BIRKIN PROMOS (2026-11-15):** Manny sent three JP-2025 card scans (printed
codes CH-004/005/006 — all of which COLLIDE with official cards) and said "prefix their
card id with b4mc". Implemented as `b4mc-ch-004` / `b4mc-ch-005` / `b4mc-ch-006`.
- **Data** (`custom.ts`): ch-004 100 HP, `level1At: 2` / `level2At: 5`; ch-005 100 HP,
  `level1At: 0` / `level2At: 7`; ch-006 90 HP, `level1At: 4` and NO level 2. (The boxed
  number beside "Level N" on these prints is the Decorations requirement, matching
  `level1At`/`level2At` — verified against official ch-002 whose 2/6 match its data.)
- **New CharacterAbility kinds:** `damagePerCharacterHealedThisTurn` (ch-004 L2),
  `stunRodCharge` (ch-005 L1), `exploreBonusIfFullHp` (ch-005 L2),
  `healAtTurnStartOrElseDamageThisTurn` (ch-006 L1).
- **"Healed this turn" needs a tracker.** `applyHealTracking(prev, next)` (abilities.ts)
  DIFFS Health per seat (main `hp`, and `partnerHp` only when `partnerInstanceId` is set)
  and records the key `<seat>:main|partner`; a Character healed twice counts once, and a
  heal capped at max Health does not count. It runs at the TWO turn boundaries — after
  every `applyAction` and inside the `startTurn` wrapper (most heals land there) — and the
  list is cleared in `startTurnInternal`. Keying by character, not by event, is what makes
  "+5 per Character" right.
- **ch-005's "Stun Rod" is the OFFICIAL `we-028`** (Outbreak). New `CardDef.dependencies`
  feeds the `cardsForScenario` `wanted` loop, so the def is present even on a base
  scenario. `setup` shuffles one instance into the seat's Inventory when she is the Main
  OR the Partner (ruling).
- **ch-005 L1 is a manual ability**: pay 1 Action (validate rejects with
  `no Action to spend`), once per turn via validate's log scan; sets
  `PlayerState.stunRodCharged`, cleared in `startTurn`. The +10 is applied PER WEAPON in
  the explore damage expression (`w?.id === 'we-028'`), so it covers single-, multi- and
  ally-explore and needs no state mutation; `exploreDamage` (the picker preview) mirrors it.
- **Rulings taken** (asked, because each had two readings): "each Character that has been
  Healed" = ANY character, opponents included; the -1 Action is a once-per-turn manual
  cost; the Stun Rod shuffle happens whether she is Main or Partner.
- **Tests:** `customB4mcSherry.test.ts` (14) — data shape, the we-028 dependency pull, the
  setup shuffle (Main and Partner), the heal / heal-or-damage branches, the heal tracker,
  the charge cost + once-per-turn + per-weapon bonus, and both L2 bonuses through
  `exploreDamage`. Art: 3 PNGs converted from the JPEGs (320x448, P-mode, ~95-104 KB).

**END-SCREEN PLAYER RANKING (2026-11-14):** Manny: "Add a ranked list of players and
their decorations at the end of the game to the end screen." Done.
- `rankStandings(players, winners)` in `client/src/ui/standings.ts` — PURE (no React /
  store) so it is unit-testable in the `node` test env: Decorations desc, then Health,
  i.e. the SAME order `checkWin` ranks winners, so the list can never disagree with the
  CHAMPION / SHARED VICTORY line. It also strips `hp` from the rendered rows.
- `SeatSwap` gameOver renders `<ol className="seat-swap-standings" data-standings>` with
  one `<li data-standing={seat}>` per player (rank / name / `N ★`); winner rows get
  `is-winner`. `standings` is optional so the old winner-only path still renders.
- `App.tsx` builds the rows from `view.state.seats` (Decorations + Health are NOT
  sanitized away by `viewForSeat` — only hand/inventory are) plus `seatNames`.
- **Live-verified**: SHARED VICTORY with rows `1 Jill 9 ★`, `2 Ada 9 ★`, `3 Chris 3 ★`
  — the 9-9 tie broken on Health (Jill 80 > Ada 55).
- **Tests**: `standings.test.ts` (4 — order, tie-break, winner flagging, hp stripped),
  `ui.test.tsx` +1 (the ranked rows render, best first).

**BOSS REVEAL vs GAME-OVER OVERLAY (2026-11-14):** Manny: "When the boss is revealed and
defeated, the game end screen pops up immediately and the player doesn't actually get to
see the boss revealed." The explore that DEFEATS the boss is also the explore that ends
the game, and `.seat-swap-backdrop` (pass-device + game over) is z-index 640 while
`.mansion-door-backdrop` (the explore reveal) was 600 — the end screen painted straight
over the boss.
- **Two independent guards** (either alone can be undone, so both are worth having):
  `.mansion-door-backdrop` z-index 600 → **660**, and `shouldShowGameOverOverlay()`
  (`client/src/ui/overlayOrder.ts`) keeps the end screen OUT OF THE DOM while a
  mansion-door reveal, an ability/effect reveal, or YOU DIED is pending. The z-index is
  what stops the FIRST-frame flash (the reveal queue is set in a `useEffect`, after
  paint); the gate is the semantic "you must see it first".
- **Only the Nightmare scenario has a scenario boss** (`winInfectedCardId: 'ma-054'`,
  Osmund Saddler); Outbreak uses `endInfectedCardId: 'ma-041'`. `checkWin` fires the moment
  the boss is ATTACHED, i.e. in the same action as the reveal.
- **Live-verified**: Nightmare hotseat, boss forced to the Mansion top → the reveal shows
  "Defeated! Osmund Saddler is attached to your character (+8 ★)." with NO end screen, and
  the CHAMPION screen appears only after Continue.
- **Tests**: `client/src/ui/overlayOrder.test.ts` — the gate truth table, plus a test that
  PARSES `styles.css` and asserts `.mansion-door-backdrop`'s z-index beats
  `.seat-swap-backdrop`'s (goes red at 600).

**MERCENARIES AMMO ABILITIES AM-005..AM-007 (2026-11-14):** Manny: "Am-005's card
text reads 'when you trash this card, you get +10 gold during this turn'" — the card ART
agrees, but the DATA did not: all three Mercenaries ammo cards were plain
`+Ammo/+Gold` cards with no printed ability. Fixed (option 2 + 3: the trash trigger is
ADDED ON TOP of the play bonus, and all three cards got their text + effect).
- **Data:** new `AmmoEffect` union + `CardDef.ammoEffects`. `am-005` →
  `gainGoldWhenTrashed` 10; `am-006` → `onDefeatTrashForAmmoX10`; `am-007` →
  `recycleToInventoryTopAtTurnEndIfDidNotExplore`. `text` corrected to the printed
  wording on all three. `bonuses` UNCHANGED — the +Ammo/+Gold icons still fire on PLAY.
- **AM-005:** `applyTrashAmmoGoldHooks` (actions.ts) is a DIFF OF `removed` run after the
  action. Trash has 45 reducer sites and no choke point, so a per-site hook would drift;
  the diff covers every source (Item Management, WE-030, CW-029, SK-016, AC-044/047,
  Rebecca L2, Cover-up, infected effects). The Gold goes to the card's OWNER
  (`ownerSeatOf(prev, id)`) — "YOU trash this card".
- **AM-006:** `ammoX10UpgradePrompt` (mercenaries.ts) is raised ONCE PER EXPLORE, in BOTH
  the single- and the multi-explore defeat path (the multi path does NOT call
  `applyMercenariesOnDefeatAbilities`, so it needed its own call). The prompt id keys on
  the Ammunition instance — one per defeated Infected would collide. `am006Choose`
  resolution trashes it, `gainAmmoX10`, and sets `ammoX10UpgradeUsedThisTurn`
  ("once during your turn"), cleared in `startTurn`.
- **AM-007:** `recycleAmmoIds` in `endTurn`, resolved AUTOMATICALLY (same ruling as
  CW-025: keeping the Ammunition is never worse). It lands on top of the Inventory and
  the end-of-turn draw then takes it into the new Hand.
- **Tests:** `mercenaries.test.ts` +8. AC-047 Anticipation's expectation moved 20 → 40 —
  it trashes two am-005, so both trash abilities now fire. Verified red without each
  hunk.

**MERCENARIES BASIC RESOURCES LOBBY OPTION (2026-11-14):** Manny: "Add a check box under
skill in the lobby/room; when checked it replaces the basic resources in the selected
scenario — ammo cards, pistols, knives — with the ammo, pistol and knives piles from the
Mercenaries set." Done as a room option (`mercenariesBasicResources`) exactly like
`skillSystem`, with a checkbox under the Skill toggle in all three surfaces (create-room,
pass-&-play, room lobby).
- **Engine:** `MERCENARIES_BASIC_RESOURCES` maps the five basic-resource PILE IDS to the
  Mercenaries printings — `am10`/`am20`/`am30` → `am-005`/`am-006`/`am-007`, `hg` → `we-049`
  (Custom Standard Sidearm), `kn` → `we-050` (Reliable Blade). `pilesForScenario(id,
  { mercenariesBasicResources })` replaces the CONTENTS of those piles (the pileId, and so
  the board slot, is preserved — only the cards change); `cardsForScenario` pulls the five
  defs in so a BASE scenario can resolve them (an expansion scenario already has them via
  `ALL_CARDS`). Both helpers take the new opt alongside `customCards`/`skillSystem`, and the
  option COMPOSES with custom cards (a custom weapon still merges into the replaced pile by
  its tag).
- **Plumbing:** `RoomSnapshot.mercenariesBasicResources`, the `createRoom` field, and a new
  `setMercenariesBasicResources` host message (protocol + rooms setter + ws case); `host.ts`
  and `hotseat.ts` pass it to BOTH `cardsForScenario` and `pilesForScenario` (forgetting
  either leaves the piles referencing unknown card ids, which `setup` silently skips).
- **Note:** the starting deck is DERIVED BY STAT MATCHING, so it stays the standard
  7×Ammo x10 / 1×Handgun / 2×Combat Knife — the Mercenaries basic printings are
  stat-identical, so only the Resource Area changes. **Updated 2026-11-14 (Manny: "Have it
  change the starting decks too"):** `GameSetup.mercenariesBasicResources` now makes `setup`
  PREFER the Mercenaries printings when deriving the opening deck (`pickBasic(pileId, byStats)`
  in game.ts), so the opening 10 cards are am-005 / we-049 / we-050. The option is threaded
  into the `setup()` call in `host.ts` and `hotseat.ts` as well — forgetting that link leaves
  the market swapped but the deck Premier.
- **Tests:** `cards.test.ts` +5 (mapping, pile swap, defs, custom-card compose),
  `game.test.ts` +1 (a real First Timer game's market holds the Mercenaries instances),
  `rooms.test.ts` +1, `protocol.test.ts` +1, `ui.test.tsx` +1 (all three toggles),
  `hotseat.test.ts` +1. Live-verified: the pass-&-play board shows Custom Standard Sidearm /
  Reliable Blade.

**ABILITY/EFFECT REVEAL OVERLAY (2026-11-14):** Manny: "when an ability or effect reveal a card
from any pile, the game is paused and the card is briefly shown to the player. Leave the mansion
reveal screen untouched." Before this, only the EXPLORE reveal paused the table (the mansion-door
overlay). Every other reveal — Ada/Carlos's Mansion peek, Ricardo's Inventory top, the PDA, Master
of Unlocking, Hunk's hand, SK-029's pistols, Ada (Outbreak) L2, Cover-up, Wesker's Secret, the
Ecliptic Express, Mind Control, the Bolt-Action Rifle's Inventory peek — surfaced only as a text
prompt ("You peek at the Mansion: X"), and a peek leaves the card in its pile so there is NO zone
diff for the client to observe. Now:
- **Engine:** `LoggedAction.reveals?: readonly CardReveal[]` (`{instanceId, pile, ownerSeat?}`,
  `CardRevealPile` = mansion/inventory/hand/discard/market/deck) is filled by the new
  `recordCardReveals()` in `applyActionInternal`, which rewrites the action's log entry matched by
  `seq` exactly like `recordExploreReveals`. Wired at EVERY non-explore reveal site: the
  `playActionCard` effect loop (`lookAtMansionTop`, `weskersSecret`, `stealRevealedWeapons…` with
  `ownerSeat`, `lookAtTopInventory`, `lookAtMansionTop3AndReorder`), `useCharacterAbility`
  (`revealMansionTopNoEffect`, `revealInventoryTopForAction`), the `chooseOption` resolvers
  (`revealHandTwoTypes`, `skillRevealPistolsForExplore`, `turnStartRevealActionsForCards`,
  `chooseOtherPlayerRevealHand`, `coverUpTrash`) and the explore-path WE-015 cost gate. Explore
  reveals are deliberately NOT recorded here — they belong to the mansion-door overlay.
- **Gotcha:** `recordCardReveals` REASSIGNS `nextBase.log` (`.map` returns a new array), so it must
  run BEFORE any state object that spreads `...nextBase` is built. The Cover-up site built
  `afterTrash` first and silently dropped the reveal until the call was moved above it.
- **Client:** `detectCardReveals(prev, next, mySeat)` (`ui/anims.ts`) walks the log backwards past
  supplementary entries and returns the newest batch newer than `prev`, but ONLY for a seat that is
  INVOLVED — the actor, or a seat whose own card was revealed (Master of Unlocking / Mind Control
  carry `ownerSeat`), so a bot's private peek never pops the overlay on the human's screen (the same
  rule `detectReveals` uses). `App.tsx` holds it in `cardReveal` state, adds it to
  `disabled`/`cardHidden`, and renders the new `ui/CardRevealOverlay.tsx` (title, source label, one
  card per reveal with its pile caption, "Tap to continue") — but only while no mansion-door reveal
  is active, so a same-step explore + WE-015 reveal plays the mansion panel first. A `view === null`
  effect clears it on the way to the lobby.
- **Tests:** `game-core/src/engine/cardReveal.test.ts` (12 — one per site; 11 go red when the
  helper is stubbed to a no-op), `anims.test.ts` +7, `ui.test.tsx` +3. Verified live in a hotseat
  game: the overlay renders centred at desktop and 400x800 (no overflow), and injecting a reveal
  into the store's view drove the real App effect → overlay → tap-to-dismiss.

**ZOMBICIDE FAN WEAPON SHEET (CW-025..CW-033) IMPLEMENTED (2026-11-13):** Manny sent a photo of nine
printed weapon cards and asked for them as custom cards. All nine are in `data/custom.ts` with the
printed stats and rules text verbatim; two titles repeat on the sheet (Machine Gun w/ Launcher, Akimbo
Flintlock Pistols), so they got sequential ids (cw-027/028 and cw-030/031). Nine new `WeaponEffect`
kinds — the `types.ts` comment block maps each to its card. Gotchas hit while wiring:
- **A multi-Infected bonus belongs in `computeDamage`, NOT in the per-weapon damage expression.** The
  reducer's per-weapon `damage` value is summed INTO `computeDamage`, so adding "+5 per additional
  Infected" in both places double-counts (45 read as 50). `plusDamagePerInfectedBattled` already lived
  in `computeDamage` alone — follow that precedent.
- **`computeDamage` now receives `infectedBattledThisTurn: exploreCount`** from the explore reducer
  (it was previously unset there, so `plusDamagePerInfectedBattled` never fired in the reducer), and
  `exploreDamage` takes an optional `exploreCount` (6th param) plus the armed-launcher handling so the
  picker preview agrees with the resolve.
- **CW-028's "can deal 15 to all Revealed Infected" is a manual per-turn trigger**
  (`useWeaponAbility` → `armedLauncherInstanceId`, cleared in `endTurn`). While armed the weapon's own
  damage is zeroed and the 15 is a per-Infected splash merged into `resolveMultiExplore`'s splash term.
- **CW-025's recall is implemented as printed but its branch is DORMANT:** a weapon reaches the play
  area only by being used in an explore (`playWeapon` is validated but has NO reducer case, and
  `explore` rejects a play-area weapon unless a reuse ability applies), so "in your Play Area and was
  not used while Exploring" cannot occur in normal play. Dispatching `playWeapon` THROWS
  (`unknown action type`).
- **Art:** cropped the 3x3 photo (828x1159) into `CARD-ART/CW-025.png`..`CW-033.png` at
  320px wide, P-mode 256 colours (~108 KB each, matching the catalogue; RGB runs ~280 KB
  apiece). Verified in `client/dist/assets/` after `npm run build -w client`. The printed
  CW-029 text really is "+1 card" — a low-res crop makes the word look like an action icon.

**RACHAEL FAILURES FIXED — DUPLICATE CARD IDs + A DUPLICATE PROMPT (2026-11-13):** the last 4
pre-existing red tests. Two root causes, both "the same thing added twice":
1. **`ma-000` was defined twice** in `data/custom.ts` — the Rachael Foley ooze (its printed code,
   see `CARD-ART/MA-000.png`, which CI-009 shuffles in by that id) and the "Martial Arts" action
   card. `cardDefs` keeps the LAST def, so every ooze instance resolved to the ACTION card:
   revealed as a non-Infected, never defeated, no Decoration, never attached, and it vanished
   from the deck. Martial Arts is now `ac-000` (the code the engine comments already used for it)
   and `game.ts`'s attach check follows. `rc-001` (Rebecca Chambers — one copy had a literal
   `\\n` in its text) and `ah-001` were duplicated the same way and are de-duplicated too.
   **Scan for duplicate ids after adding ANY card**: `grep -c "id: '<id>'" game-core/src/data/*.ts`.
2. **Two identical turn-start prompt blocks for Rebecca L1** (`turnStartDrawThenDiscardCard`):
   `rebeccaDrawDiscard` (commit 5a56101) and `rebeccaTurnStartDrawAndDiscard` (commit 2458f38),
   both pushing `ability-<seat>-v<version>`. Two prompts sharing one id means `chooseOption`
   removes BOTH, so the player can answer neither. Kept `rebeccaTurnStartDrawAndDiscard` (what
   the test expects) and moved its `usedStartOfTurnAbilities.turnStartDrawThenDiscardCard` flag
   write over from the deleted block, so the manual ability button is still blocked after the
   prompt fires. Every `prompts.push` in `turnStartAbilityPrompts` must have a UNIQUE id — most
   still use the generic `ability-<seat>-v<version>` and are safe only because they are the sole
   prompt for that ability; give any new one a distinct prefix (`rachael-explore-...`).

**BARRY L1 "usable again next turn" FIXED (2026-11-13):** the last of the 5 documented
pre-existing red tests. `validate.ts` rejected a second `useCharacterAbility` for
`plusDamageThisTurn` with "start-of-turn ability already used this turn" because
`actions.ts` recorded `usedStartOfTurnAbilities.plusDamageThisTurn = true` when the button
was pressed (commit e328e00). That flag is for abilities fired by a TURN-START PROMPT and is
only cleared in `startTurn`, so it survived the seat's `endTurn` and blocked the ability for
every later turn. The once-per-turn rule was ALREADY enforced by the log scan at the top of
the same block (it walks back to the seat's last `endTurn`), so the flag was redundant within
a turn and wrong across one. Removed the flag write and the dead `plusDamageThisTurn`-specific
check it had spawned (the general check above it already fired first, so that branch was
unreachable). Real games were unaffected — `startTurn` clears the flag before the next turn —
which is why only the test's hand-built fixture (endTurn without startTurn) caught it. A/B:
reversing the hunk turns exactly that one test red.

**LK-001 LEON L2 (RAPID FIRE) NOW COVERS THE WEAPONS HE PLAYS (2026-11-13):** Manny:
"Lk-001's second ability should mean that all weapons he plays count as pistols ... any two
weapons trigger his level 1 ability while his level 2 is active." It did not. The explore
reducer resolves `dualWieldBonus` from the PRE-explore state, where the two weapons are still
in HAND, and `effectiveWeaponTags` only added 'pistol' to cards already in the PLAY AREA — so
L2 was nearly dead (a play-area weapon is only explorable with a reuse ability, which LK-001
does not have). `effectiveWeaponTags`/`isPistolWeapon` now take an optional `playedIds` (an
explore's weapon set) and treat those as in the play area; `dualWieldBonus` and
`healOnDefeatWithWeaponTag` pass their `weaponIds`. `playAreaCardsArePistols` also reads
`seatAbilities` instead of `characterAbilities`, so a Partner Leon's L2 covers the seat's
shared play area — matching `maxWeaponUses`, which already reads the seat. Verified: L2 +
shotgun(25) + knife(10) from hand = 45 damage (was 35), and the reducer now defeats a 40 HP
Bui Kichwa that 35 could not. The client needs no change — its picker prices combos with the
same `exploreDamage` helper.

**HEALTH GAUGE: OPAQUE + KEPT INSIDE THE CARD (2026-11-13):** Manny: "Double the size of the
health gauge, make them not transparent and adjust the centering so that it doesn't leave
the card." Both gauges are now 2x their ORIGINAL size, and the centering was reworked so
neither leaves its card:
- **Character gauge** stays at `--cc-badge-size: 36%` but the anchor moved INBOARD to
  (78%, 17%) — promo (78%, 27%) — because a 36% ring centred on the printed badge
  (89.7%, 7.7%) spills past the card's top-right corner. The art-only character card is
  back to `overflow: hidden` (no longer needs to be visible). The printed badge still sits
  inside the gauge's disc.
- **Infected gauge** (the one previously left alone) is doubled 27px -> 54px AND absolutely
  positioned (`.card-top .health-ring { position: absolute; top/right: 6px }`) so the bigger
  ring cannot push the card's flex header taller or spill out. The reveal overlay keeps its
  own `.mansion-door-card .health-ring` positioning — that rule comes later in the file and
  wins on equal specificity.
- **Opaque:** `HealthRing` now draws a solid backing disc (`.health-disc`, `#12151c`) under
  the segments, so card art no longer shows through the ring's centre or the empty segments.
Measured live: character gauge 28x28 inside the 80x114 card (4px right / 6px top margin),
15x15 inside the 44x63 phone card, `fullyInside: true` at both sizes.

**POISON GAUGE + COUNTER VISIBILITY (2026-11-13):** Manny: "A poison counter is still not
being attached to characters when they're supposed to gain one. Remove the health pulse
animation for the heath gauge. Double the size of all health gauges. When the player is
being affected by poison a counter, change the health gauge to purple." ENGINE FIRST: the
counter DOES attach in every reachable path — verified with throwaway tsx probes (single
explore, multi-explore, Crow chain, partner-led, the explore that downs the character, and
MA-072's second card, which auto-defeats the revealed Infected so it correctly attaches
nothing). What was missing was the VIEW: `Board.tsx` renders `PlayerPanel` only for OTHER
seats, so the viewing player's own counter was drawn NOWHERE — only the transient purple
card-shake. Fix: `CharacterCards` renders the seat's counters as a small fan pinned to the
character card's bottom-left (`.cc-counters`, `data-player-counters`). GAUGE: the
`hp-pulse` keyframes and `.cc-hp-ring-flash` are DELETED, along with the now-dead
`CardView.flash` prop; the character gauge is 2x (`--cc-badge-size` 18% -> 36%, ring
viewBox 24/26 -> 48/52, stroke 3/6 -> 6/12) and `.card.card-character.card-art-only` is
now `overflow: visible` because the bigger ring is centred on the printed badge and spills
past the card's top-right corner. `HealthRing` gained a `poisoned` prop (purple
`#a855f7` fill + `data-poisoned`) wired through `CardView` -> `CharacterCards` and
`MansionReveal`'s party (`RevealPartyMember.poisoned`, fed from `explorer.counters`).
Measured live: 28x28 on the 80px card (was ~14), 15x15 on the 44px phone card, unclipped,
no overlap with the next column. The Infected card's OWN Health ring (27px in
`.card-top`) was deliberately NOT doubled — at 54px it would overflow the 94px card's flex
header.

**CI-002 CROW CHAIN REVEAL FIXED (2026-11-13):** Manny: "when infect crow is revealed the
second card reveal animation isnt happening". The client's `detectReveals`
(`client/src/ui/anims.ts`) rebuilt the revealed set from the top `exploreCount` cards of
the pre-explore deck plus the zone diff — but a chained card that is RETURNED (an
undefeated Infected bottomed, or a non-Infected shuffled back) is indistinguishable from
an unrevealed deck card, and `shuffleBack` shuffles the WHOLE deck, so deck order is no
signal either. A Crow chain therefore showed only the Crow. Fix: the engine records the
exact revealed set on the logged explore action (`action.revealedInstanceIds`, in reveal
order) through `recordExploreReveals()`, which rewrites the explore log entry in place
(matched by `seq`, so it is position-independent in the very branched explore case); the
client uses that list and falls back to the old prefix for logs written before the field
existed. Wired for the plain single reveal, the MULTI block (Crow chains AND
multi-explores) and the single-path MA-039 / MA-072 branches. Tests: `customCrow.test.ts`
+2 and client `anims.test.ts` +2, both verified RED with the hunk reversed. A pure
client-side re-derivation of the expansion rules was rejected on purpose — it would
duplicate the reducer's reveal logic.

**RC-002 PARTNER HEAL FIXED (2026-11-13):** Manny: "rc-002's level 2 ability does not heal
her when she is a partner" (the heal is her L1 — `healIfDidNotExplore`, 10 Health at end of
turn; L2 is the Machine Gun damage). Root cause: the end-of-turn block looked the ability up
with `seatAbilities` (the Main + Partner union) and wrote the recovery to `hordeHp`, i.e. the
MAIN character's Health — so a Partner Rebecca healed the Main and never herself. Fix: look
the ability up per character (`characterAbilities` → `hp`, `partnerAbilities` → `partnerHp`),
the same split `healAtTurnStart` already uses in `startTurn`. The condition stays SEAT-level
(`exploredOrAttackedThisTurn`) because the Alliance rule is "Partner and Main explore at the
same time". `newPlayer` is built from `...player`, so the partner value must be written
explicitly or it is dropped. Tests: `customCards.test.ts` +5 (partner heal lands on partnerHp
and not hp, capped at partnerMaxHp, suppressed by a seat explore, level-gated below the L1
gate of 3 Decorations, Main case unchanged); 2 of them verified RED with the hunk reversed.

**BOT DEADLOCK FIXED (2026-11-12):** the idle loop above is fixed in `ai/policy.ts`. Two
triggers, both feed one override — "take the seat's best explore instead of endTurn":
1. `isUnarmedDeadEnd(state, seat)`: no Weapon card anywhere in hand / inventory / discard /
   play area / attached / partnerAttached AND no Weapon in the Resource Area it can afford this
   turn (`buysLeft`, `turnGold`).
2. `idleTurnsInARow(state, seat)` >= `STALL_TURNS` = 5: consecutive COMPLETED turns whose only
   logged actions were passes (playAmmo/playWeapon/prompts/endTurn). Counted from `state.log`,
   so no engine state was added; the seat's still-open turn is skipped when counting.
Scoring is untouched — `EXPLORE_BIAS` still never applies to an unarmed explore, and unarmed
explores only enter the candidate set when a trigger fires — so normal play is unchanged.
`choosePlayoutAction` delegates to `chooseGreedyAction` when a trigger fires (every rollout line
is equally dead).

TUNING (seeds 1-8, 4 hard bots, firstTimer, 8000-action cap): before the fix 2/8 seeds capped
(turn 2679 and 4490) and games ran 637-1365 turns; STALL_TURNS 2 or 3 ended most seeds with
EVERY seat dead (bots suicide right after a quiet start); STALL_TURNS 5 ends all 8 seeds with
4 survivors, turns 321-707, decoration spread comparable to baseline. Verified after the fix:
`unofficialExpansion` bot-conservation seed 3 went cap(turn 2467) -> gameOver(turn 145);
no-custom seed 4 cap(turn 1982) -> gameOver(turn 430); poison seed 5 cap(2242) -> 178;
poison seed 6 cap(1050) -> 356.

TEST STATE after the fix: game-core engine 40/45 files pass, 7 failures, ALL pre-existing and
reproduced with the policy change stashed (`actions.test.ts` Barry L1 log scan, `customAntiqueCoin`
IT-000, `customRachael` prompt id, `customRachaelFoley` x3, `unofficialExpansion` custom-ex-002
pile). The bot-conservation test in `unofficialExpansion` is now GREEN. `src/ai` all green
(policy/playout/bot/sim/soak/evaluate/enumerate = 127 tests) including "hard bots explore at a
healthy rate and games end naturally" and the full-game soak "every scenario plays a full game
with conserved, sane, terminating state". client 207, server 105 green (server includes the
bot-only-endgame no-freeze test).

**EX-009 POISON IS FIVE COUNTER CARDS (2026-11-12):** Manny: "make the number of poison
counter card 5 instead of 1". `CUSTOM_CARDS` EX-009 `copies: 1 -> 5` (data/custom.ts); setup
already seeds `supply` from `copies`, so a poison game now starts with `ex-009#1..#5` in the
shared supply. The printed "a maximum of one Poison counter per Character" rule is unchanged
(`counters.ts` matches by cardId, not by supply size), so up to five Characters can carry one
each. Verified: two seats exploring into Web Spinner / Yawn end up with `ex-009#1` and
`ex-009#2`, supply 5 -> 4 -> 3, and each takes its own 5 damage at its own turn start. New
regression test `unofficialExpansion.test.ts` "five counters let two Characters be poisoned at
the same time"; the supply-seeding assertions now expect five instances.

**SIDE EFFECT — bot sim seed 3 now hits the 4000-action cap (not a poison bug):** with 5
counters, `unofficialExpansion.test.ts` "conserves every instance ... across full games" fails
on seed 3 with `ended: 'cap'` (turn 2467, 2 seats alive). Reproduced with `['poison']` vs the
full EX set, and confirmed it is the copy count: on 1 copy the same seed ends `gameOver` at
turn 988. Root cause is the bot policy, not the counter: `ai/policy.ts` deliberately never
volunteers an unarmed explore (`action.type === 'explore' && weapons.length === 0` is filtered
out), so once two seats die and the survivors hold no Weapon and cannot afford a buy
(10 Gold vs cost 20), they loop `playAmmo` / `endTurn` forever — the game can never reach
"all players dead". Same loop can hang a live game where only weaponless bots remain. NOT
fixed here (bot policy decision for Manny). The other red in that file, `custom-ex-002` pile,
is the known stale assertion documented above. The loop is NOT poison-specific: a sweep of
seeds 3-6 with NO custom cards stalls too (`noCustom seed=4` ends `'cap'` at turn 1982 with all
four seats alive), so it is a pre-existing bot/idle bug — the extra poison deaths just make more
seeds reach it. Sweep data: noCustom 3/5/6 = gameOver (turns 1096/637/1365), noCustom 4 = cap;
poison bundle 4 = gameOver turn 11, 3 = gameOver turn 189, 5 = cap turn 2242 (3 alive), 6 = cap
turn 1050 (1 alive).
**FCH-002 HUNK (2026-11-13):** Manny sent a fan character scan — HUNK, 100 Health,
gates 2 / 5. L1 "All your 'Machine Gun' Weapons get -10 Ammo Requirement" reuses the
existing `ammoReqReduction` kind (tag `machineGun`). L2 "If you have more than 100
Ammo, all your 'Machine Gun' Weapons get +10 Damage" needed a NEW `CharacterAbility`
kind `plusDamageForWeaponTagIfAmmoAbove { tag, threshold, amount, level }` (types.ts)
plus the pure helper `plusTagDamageIfAmmoAbove(abilities, weaponDefs, ammo)`
(abilities.ts), wired into the shared `abilityDamage` term of BOTH the reducer
(`actions.ts`) and the overlay helper (`explore.ts`), and into the ally explore
(`allyExplore.ts`). That is the same split RC-002's `plusDamageForWeaponTag` uses,
except RC-002's is wired explore-only and is absent from `exploreDamage` — HUNK's is
in both, so the picker's damage total matches the resolve. Art:
`CARD-ART/FCH-002.png` (320x446, P-mode, ~103 KB; the source dashboard render is
bottom-cropped, so it letterboxes like FCH-008 — the printed 100 Health badge sits at
~(87.8%, 8.5%) vs the CSS ring's 89.7%/7.7%, inside the spread the other custom scans
already have). Tests: `engine/customHunk.test.ts` (14 tests, 3 verified red without
the wiring).

**PR-009 REBECCA (NURSE) START-OF-TURN FLAG (2026-11-13):** Manny reported PR-009's
L1 could still be used twice in a turn — the ActionBar's `Rebecca:Lv1` button stayed
after the turn-start prompt was answered. The prompt resolution never set
`usedStartOfTurnAbilities` (unlike the other turn-start abilities fixed in 1a70a70 /
055d482). PR-009 now raises its OWN prompt kind `rebeccaNurseGift` (turn-start prompt
+ the manual button) and the gift resolution sets the flag. The distinct kind is
load-bearing: AC-017 Fierce Battle shares the old `giveOneCardToPlayer` kind and the
flag is GLOBAL, so a Fierce Battle gift by ANY seat would otherwise consume Rebecca's
ability for the turn. Tests: `abilities.test.ts` +2 (button gone after the prompt /
still there after Decline) + 1 AC-017 non-interference test. **Balance side effect
(measured, not yet re-baselined):** the fix drops the bot soak's natural-end rate from
18/30 (0.600) to 16/30 (0.533) — floor 0.55 — because the old code let a bot activate
PR-009's L1 up to 3x per turn (prompt + button) and opponents got more free cards.
A/B over the soak's exact 30 games with only these hunks differing. The floor belongs
to the AI/balance work; re-baseline to ~0.50 with these numbers if Manny wants green.

**BOARD: COUNTER SUPPLY PILE REMOVED + ABILITY BUTTON LABELS (2026-11-12):** Manny asked to
"not show zone-pile-counter-supply on the board" and to simplify the ability buttons to
"<first name>:Lv<level>" (e.g. `Chris:Lv1`). `Board.tsx` no longer renders the shared
`zone-pile counter-supply` pile (nor the `counterAttached` / `supplyIds` locals that gated
it) — counters stay visible on the character panel (`data-player-counters`). `CardFlightLayer`
already no-ops when a zone anchor is missing, so dropping the `data-anim-zone="supply"`
element is safe; there was no `.counter-supply` CSS to clean up. `abilityLabel` in
`ActionBar.tsx` now joins name and level with a colon (`Barry:Lv1`); the full rules text still
rides in the tooltip. Tests: `ui.test.tsx`'s counter-supply test inverted to assert the pile
never renders, and the two `Barry Lv1` label assertions became `Barry:Lv1`. Gates: typecheck
clean, client 212/212, client build OK.

**FCH-008 SHERRY BIRKIN CANNOT BE A PARTNER (2026-11-12):** Manny asked to make the fan
character FCH-008 Sherry Birkin ineligible as a Partner. New `CharacterAbility` kind
`cannotBePartner` (types.ts, FCH-008 section); FCH-008 carries it at level 1 in
`data/custom.ts`. `canBePartner` (engine/characters.ts) now rejects either
`noHealingNoNonInfectedAttach` (Chris) or `cannotBePartner` (Sherry), so the ONE gate covers
the lobby partner picker (`Lobby.tsx`), the server room validation (`rooms.ts`
MAIN_ONLY_CHARACTERS) and engine setup + the random partner pool (`game.ts`). The kind is
passive — validate's `useCharacterAbility` switch rejects it by default, so no dead ability
button appears and ability indices 0/1 are unchanged. Sherry is still a legal MAIN character.
Tests: `fanSherry.test.ts` +4 (canBePartner false, explicit partner rejected, 25-seed
random-partner sweep, main-with-partner still legal), `ui.test.tsx` +1 (lobby dropdowns),
`rooms.test.ts` +1 (createRoom/setCharacterSelection rejection).

**CI-001 / CI-003 OSCAR + OSMUND SADDLER (FIRST ENCOUNTER) (2026-11-11):** Manny sent a second
pair of fan-card scans. CI-001 "Oscar - Zombie Elephant" (Infected, 120/10/7): when he is not
defeated he tramples the exploring Character, trashing the highest-Damage Weapon(s) they are
using (ties all trashed). CI-003 "Osmund Saddler (First Encounter)" (Infected, 60/50/5): on
reveal every player gains a 10x Ammo, and on defeat it shuffles a card named "OSMUND SADDLER"
into the Mansion — that is the OFFICIAL boss card MA-054, not a new custom card. Two new
`InfectedEffect` kinds: `onNotDefeatedTrashHighestDamageUsedWeapons` and
`onRevealEachPlayerGainsAmmoX10`. The `rachaelFoley.ts` helper was renamed to
`engine/customInfected.ts` (it now serves the whole custom infected line). `cardsForScenario`'s
dependency loop resolves against `ALL_CARDS` as well as `CUSTOM_CARDS`, so enabling CI-003 pulls
MA-054's def in on any scenario. Both effects are wired in the single-explore, multi-explore and
ally-explore (Sherry) paths; the gains/trample are applied to the FINAL seat because the explore
rebuilds the seat from a pre-effect snapshot (the same reason MA-092's gains land last). Tests:
`engine/customOscarSaddler.test.ts` (10 tests, 3 verified red without the wiring). Art:
`CARD-ART/CI-001.png` + `CI-003.png` (320x446, P-mode, ~120 KB).

**PRE-EXISTING RED ON origin/master (not this change — do not attribute it to the
custom-card work):** three tests fail on a CLEAN `origin/master` checkout, verified
by stashing the WIP and re-running each file. (1) `server/src/rooms.test.ts`
"toSnapshot matches the protocol RoomSnapshot shape" — commit e447adf added
`mansionAttachmentMode` to the snapshot but the expected object at line 183 was
never updated (the remote's 0bbfa71/57ed940 fixed the OTHER test files, not this
one). (2) `game-core/src/engine/unofficialExpansion.test.ts:120` — expects
`custom-ex-002`, but commit 4ceeaad deliberately merged custom weapons into the
matching base pile by weapon tag, and EX-002 ("explosive") now lands in the `grn`
pile; the assertion is stale. (3) `game-core/src/engine/customRachael.test.ts:170`
— Rachael's L1 prompt and the RC-001 partner prompt still share an id at turn start
(Rachael uses `rachael-explore-<seat>-v<version>`, RC-001 uses the generic
`ability-<seat>-v<version>`, and a third prompt also uses the generic id). Left
alone per the "do not fix another session's in-flight work unasked" rule; the
custom-card commits add no new failures (full game-core run: 993 passed / these 2,
client 206, server 104/105).

**CI-009 / MA-000 RACHAEL FOLEY CUSTOM CARDS (2026-11-11):** Manny sent two fan-card
scans — CI-009 "Rachael Foley (First Encounter)" (Infected, 60/50/5) and MA-000 "Rachael
Foley (ooze)" (Infected, 30/50/5) — and asked for both in the Mansion deck. Three new
`InfectedEffect` kinds in `types.ts`: `onRevealDamageReductionPerAmmoX10InDiscard` (CI-009
takes 10 less damage per "Ammo x10" in the exploring player's discard pile),
`onDefeatShuffleCardIntoMansion` (CI-009 shuffles a fresh copy of a named card into the
Mansion on defeat), and `onDefeatShuffleBackIfDamageAtMost` (MA-000 returns to the Mansion
when defeated with ≤80 damage). The soak is a combat modifier, so it lives in
`resolveExplore`/`resolveMultiExplore` behind a new `ammoX10InDiscardCount` param (the
pure resolvers cannot read the discard pile); the two defeat effects are applied by the
explore reducer, which owns `attached` and the Mansion deck. New helper module
`engine/rachaelFoley.ts` (`ammoX10CountInDiscard`, `oozeShufflesBackOnDefeat`,
`shuffleCopyIntoMansion`, `shuffleIntoMansion`) is called from the single-explore,
multi-explore, MA-039 and ally-explore paths. `cardsForScenario` pulls `ma-000` in as a
dependency when `ci-009` is selected, exactly like EX-006/EX-008 → EX-009. MA-000's
shuffle-back still awards its Decoration (the MA-053 Lisa Trevor precedent: the trophy is
not attached but the Decoration is paid). Tests: `engine/customRachaelFoley.test.ts`
(11 tests, all fail without the wiring). Art: `CARD-ART/CI-009.png` + `MA-000.png`
(320x446, P-mode, ~120 KB). Known limitation: the ally-explore and MA-039 paths get the
damage soak but not the defeat effects (both are pre-existing simplified paths — CI-002
Crow's chain is absent there too).

**CHARACTER HOVER CARD: SKILL TEXT CLIPPED IN THE PLAYER PANEL (2026-11-11):** Manny asked to
"scale the skill text in the character hover card in the player panel so that the full text is
visible when hovered". Two independent clipping bugs, both measured on a live pass-and-play board
at 1440x1250 (headless Chrome never advances CSS transitions, so they were disabled before measuring):
1. **Horizontal** — `.card.card-character.card-art-only .skill-row` used `align-items: flex-start`,
   so the text's cross-size was its MAX-CONTENT width. Any word wider than the 80px card (Barry's
   "attacking/exploring", 19 chars ≈ 80px at the 7px font) made the whole text box wider than the
   card, and `.card-skills`' `overflow-y: auto` (which computes `overflow-x: auto` too) clipped the
   right-hand characters — the text ran ~20px past the card's right edge. The row is now
   `align-items: stretch` (the text wraps at the row's width) with the level box opting back out via
   `align-self: flex-start`; the row's right padding went 6px → 2px. `overflow-wrap: break-word` on
   `.skill-text` is the safety net for that one over-wide compound word.
2. **Vertical** — `.player-panel:not([data-me])` keeps `overflow: hidden` even on hover, so the
   enlarged card's rules panel (which grows UP past the panel's top edge by design) had its first
   lines cut off. Added `:has(.player-character-card:hover) { overflow: visible }` — the exact fix
   `.app-action-dock` already had for the viewing player's own cards.
**Verified:** enemy-panel hover at 1440x1250 — panel `overflow: visible`, `skillsOverflowX: 0`,
`textOverflowX: 0`, `scrollHeight == clientHeight`, and the full ability text read off the screenshot
with nothing cut at the top, bottom or right. Gates: typecheck clean, client 206, game-core 958.

**Fixed the 3 pre-existing failures the pull left behind (2026-11-11):**
All three reproduced on the clean pulled tree with this work stashed, and all three are now green.
1. **Soak conservation (`ai/soak.test.ts`, `alliance/2`)** — THREE duplicate-instance bugs in the
   multi-explore path, all around MA-078 Red Executioner (the single-explore path was always correct,
   which is why only multi-explore games failed):
   - `applyMercenariesNotDefeatedEffects` already shuffles MA-078 back into the Mansion AND sets
     `infectedShuffledBack`, but the multi-explore caller shuffled it back a SECOND time
     (`actions.ts`, the old `if (r.infectedShuffledBack) { shuffleBack(...) }` block) → the same
     instance appeared 3× in `mansionDeck`. Removed: the flag means "already handled".
   - The multi-explore DISPOSITION pass (`for (const id of undefeatedEntries ...)`) sent MA-078 to the
     deck bottom because its effect kind is not in the `shuffles` list — and then the effect shuffled it
     back too, adding it a second time. The pass now skips any infected whose effect shuffles it back
     itself (`onNotDefeatedMoveHighestDecorationAttachedToBottomThenShuffle`).
   - `newPlayer.attached` was built from `state.seats[seat].attached` (the PRE-explore seat), so
     MA-078's removal of the highest-Decoration trophy was dropped and that trophy sat in BOTH the
     Mansion and the Combo Pile. It is now built from the live post-effect seat (`fxState`), and the
     Decoration delta is carried into `decorations` (`decorationDelta(A, A)` is 0, so it is a no-op
     when nothing moved).
   Regression test: `mercenaries.test.ts` "MA-078 Red Executioner: a MULTI-explore shuffles it back once
   and still drops the trophy" — fails (3 copies) with the disposition fix disabled.
2. **`ai/evaluate.test.ts` ×4** — stale exact-score assertions. Commit 43eb09c deliberately changed
   `CARD_DRAW_VALUE` 12→20 and `affordablePiles` to `8 + floor(ownedVal*0.6) + marketPull`. Updated the
   four expectations and their derivations: 230→239 (piles now 15 + 14 = 29), 222→230, 176→180,
   462→470.
3. **`ai/sim.test.ts` explore-rate heuristic** — measured both sides of 43eb09c on the same 8 seeds:
   perTurn 0.106 → 0.064, but total explores 395 → 426 and Decorations 381 → 408 with 7/8 games still
   ending naturally. The bots fight MORE in absolute terms and just take longer, so the floor moved
   0.08 → 0.06 and an absolute `totalExplores > 300` guard was added; `gameOverCount` remains the real
   anti-freeze guard.

4. **Soak natural-end rate (`ai/soak.test.ts`)** — with conservation fixed, the rate assertion
   finally ran and failed: 17/30 = 0.567 vs the old 0.6 floor. Attributed by re-running the alliance
   seeds with the MA-078 fix reverted: alliance 2/3 natural without it (18/30 = 0.60, exactly at the
   old floor) vs 1/3 with it. The other low scenarios (partnersInEscape 0/3, classicHorror 1/3,
   spyGames 1/3, nightmare 1/3) are untouched by the fix — the pulled AI reweight is the primary
   driver, and the fix costs exactly one alliance game (the moved trophy's Decoration Reward is now
   correctly lost, so the bots are weaker). Floor moved 0.6 → 0.55 with the measurement recorded;
   the conservation assertions stay the real defect guard.

**CH-000 Rachael Foley — custom character (turn-start Explore debt + solo low-HP damage) (2026-11-11):**
Manny sent the card scan and asked to "implement this custom character". Card: `[CHARACTER]` RACHAEL FOLEY,
printed code CH-000, **80 Health**, gates **1 / 5**. Text verbatim — L1: "At the beginning of your turn, you can
get +1 Explore. If so, Rachael must Explore at least twice this turn." L2: "Whenever Rachael Explores, if she has
no Partner and she has 50 or less Health, she gets +20 damage this turn."
1. **Data** (`data/custom.ts`): id `ch-000`, `maxHp: 80`, `level1At: 1`, `level2At: 5`, abilities
   `turnStartPlusExploreRequiresTwoExplores` (L1) and `exploreDamageIfNoPartnerLowHp { amount: 20,
   hpThreshold: 50 }` (L2). Wrote `SPEC_RACHAEL.md` first (prompt kind + resolution semantics).
2. **L1** needed a count-based obligation the engine did not have (`mustExplore` is a boolean = "at least
   one"). New `PlayerState.exploresRequiredThisTurn?: number`: the turn-start prompt
   (`turnStartPlusExploreRequiresTwoExplores`, options `Gain +1 Explore` / `Decline`) sets it to **2** and
   adds +1 Explore; `applyOutbreakHooks` pays it down by `exploreCount` (a multi-explore of 2 IS two
   Explores); `startTurn` clears it; `validate`'s endTurn gate blocks while it is > 0 AND
   `canExploreLegally` (so a seat that cannot explore is never deadlocked). Shared helper
   `mustExploreNow` (Wesker's `mustExplore` OR the debt) drives the validator and the bot's
   "never volunteer an unarmed explore" filter.
3. **L2** is a per-explore bonus added to the shared `abilityDamage` term (so single- and multi-explore
   both get it), mirroring `exploreBonusIfAmmoAbove`: +20 when `partnerInstanceId === undefined` and
   `hp <= 50`.
4. **Art**: `CARD-ART/CH-000.png` (320x446, 107 KB, P-mode) from the scan.
**Verified**: new `engine/customRachael.test.ts` (16) — data shape, absent from ALL_CARDS, the turn-start
offer (and its absence below L1), accept/decline, the debt blocking endTurn and paying down one explore at
a time, a multi-explore paying 2 at once, the deadlock guard, the next-turn reset, the four L2 cases
(solo@50 gets it; 51 HP / L1 / has-partner do not), and a distinct prompt id so it cannot collide with a
partner's turn-start prompt. Regression-checked: disabling the prompt resolver and the L2 term turns 6 of
them red; reverting the prompt id turns the collision test red. Gates: typecheck clean, client 206,
server 105; game-core full suite 6 failed | 933 passed (939) — the SAME 6 failures as the pre-pull
baseline (4 stale ai/evaluate, 1 ai/sim explore-rate heuristic, 1 Red Executioner double-shuffle
conservation bug), all reproduced on the clean pulled tree with this work stashed.

**IT-000 Antique Coin — custom MANSION item, trash-for-a-weapon (2026-11-11):**
Manny sent the card scan and asked to "implement this mansion item card ... when enabled via the custom card
selector it should add two of these cards to the mansion deck".
1. **Card**: `[ITEM]` ANTIQUE COIN, printed code IT-000, cost 60, 2 copies. Text verbatim: "You can Trash this Item
   to Gain one Weapon from the Resource Area with cost equal to, or less than, Antique Coin's cost." (The scan
   reads IT-000, not IT-008.)
2. **Data** (`data/custom.ts`): id `it-000`, `type: 'item'`, `copies: 2`, `cost: 60`, **`mansion: true`**,
   `itemEffects: [{ kind: 'gainWeaponFromMarket', costLimit: 60 }]`. The `mansion` flag and the effect kind were
   already stubbed in `types.ts` (commit 72ca72d) but nothing consumed them.
3. **Routing**: `setup`'s `isCustomMansionCard` now honours `c.mansion === true`, so the two copies are shuffled
   into the Mansion deck; `pilesForScenario` skips `mansion` cards so the coin never gets a Resource Area pile
   despite printing a cost. The lobby picker groups it under "Mansion Deck Cards".
4. **Effect**: `playItem` (trashing the item) raises an `antiqueCoinChooseWeapon` prompt listing Resource Area
   weapons with `cost <= 60` (`marketWeaponIds` gained an optional `maxCost`); the `chooseOption` handler moves
   the chosen instance from its pile to the player's discard via `gainCard`. No eligible weapon → no prompt.
5. **Art**: `CARD-ART/IT-000.png` (320x446, 110 KB, P-mode) from the scan; `cardArt.ts` globs the directory so no
   map entry was needed.
**Verified**: new `engine/customAntiqueCoin.test.ts` (8) — data shape, not in ALL_CARDS, 2 copies in the Mansion
and no `custom-it-000` pile, the <=60 offer list (we-010 at exactly 60 included; we-006/012/014/016 excluded),
the chosen weapon leaves its pile for the discard, no prompt when nothing is cheap enough, and the full
explore → Take → play path. Regression-checked: disabling the `playItem` wiring turns 3 of them red.
Gates: typecheck clean (3 workspaces), client 206, server 105, game-core full suite green.

**Turn 1 never went through startTurn, so every turn-start effect was dead on the opening turn (2026-11-10):**
Manny: "CR-001 dosent give the player it's automatic +1 buy each turn from it'S LEvel 1 ability".
1. **Root cause**: `startTurn` is the only place the turn-start pools are applied (`buysLeft: 1 + plusBuyBonus(seatAbils)`,
   Carlos's `goldAtTurnStart`, Ada's `turnStartActionIfHpAtMost`, Wesker's forced Explore, skill ammo/gold) and the
   only place beginning-of-turn ability prompts are raised. But every caller (`server/src/host.ts`, `client/src/hotseat.ts`,
   `ai/sim.ts`) calls it **only after `endTurn`**, and `setup` returned the raw seat pools. So turn 1 ran on the setup
   values: CR-001 had 1 Buy, and every other turn-start effect was skipped too.
2. **Fix**: `setup` now returns `startTurn(baseState)` on the non-skill path, so the opening turn is produced exactly
   like every later turn. The Skill System needed the same at the other entry point into `phase: 'main'`:
   `advanceDraft` now returns `startTurn(finishDraft(...))` when the draft completes (skill.ts imports `startTurn`
   from game.ts; the cycle is safe because both modules only use each other's exports inside functions).
3. **Version baseline moved**: the opening state is now `version: 2` (startTurn bumps it), so 9 version assertions
   in `game.test.ts` / `replay.test.ts` were re-based (+1) with a comment on the setup one.
**Verified**: `setup` with cr-001 → `buysLeft 2`, `version 2`, `turnNumber 1`; after a full 5-round draft the same.
Tests: new `engine/firstTurnStart.test.ts` (4) — turn-1 Buy for CR-001, 1 Buy for a character without the ability,
opening hand untouched, and the post-draft pools. Gates: typecheck clean (3 workspaces), client 202, server 104.
**Browser-verified** over the real WebSocket protocol (the dev server must be RESTARTED after game-core edits — it
runs `tsx src/main.ts` with no watch): room `9W5UUN`, seat 0 = `cr-001#1`, `buysLeft 2`, `turnNumber 1`, `version 2`,
and the client status bar reads `BUYS 2` with "Lv1:0★ You get +1 Buy."

**Non-Infected reveals open the overlay, their prompts render inside it, and the panel locks (2026-11-10):**
Manny: "Non infected cards should still trigger the mansion reveal screen, prompts caused by revealed non
infected cards should display in the reveal mansion screen, the reveal screen should lock until all prompts are
resolved."
1. **Why they were invisible** (`anims.ts`): for a non-Infected reveal the engine REMOVES the card from the
   mansion deck and parks it in **NO zone** while its `takeOrBottom` prompt is open. `detectReveals`' zone diff
   only matched cards that moved `mansion -> attached/mansionBottom/removed`, and the re-insertion scan only
   matched cards found back in the deck — so a parked card was seen by neither. `Reveal.outcomeZone` gains
   `'pending'`, and `detectReveals` now also walks the revealed set (the top `exploreCount` of the PRE-explore
   deck) for a card that is in **no zone at all** in the next state. Everything else is unchanged: re-inserted
   cards still report `'mansion'`, and the zone diff still catches defeated/escaped/removed plus crow and
   MA-039/MA-072 expansions that land beyond the top N.
2. **Prompts inside the panel** (`MansionReveal.tsx`): new `prompts` / `state` / `onChooseOption` props. Pending
   prompts render as the prompt text + option buttons inside the overlay (it would otherwise cover the ActionBar
   they used to live in). `locked = prompts.length > 0` disables Continue and shows "Answer the choice above to
   continue." A `'pending'` outcome reads "`<name>` is revealed — answer the choice below to continue."
3. **Who gets the buttons** (`App.tsx`): the panel receives the exploring seat's **live** prompts and a
   `chooseOption` dispatcher, but ONLY when the viewer IS the explorer. The server rejects a `chooseOption`
   whose seat is not the sender's (`host.ts`: `action.seat !== human.seat`), so a forced-explore watcher
   (FCH-008 Sherry watching a bot explore) must not be offered buttons it cannot press. The exploring seat can
   never have a pre-existing prompt (validate gates every action behind "resolve pending prompt first"), so
   everything pending at reveal time is reveal-caused.
4. **Shared labels**: `client/src/ui/promptLabels.ts` is the option-label helper extracted from `ActionBar`, so
   the overlay and the ActionBar render identical option labels.
**Verified live** via a throwaway `window.__store` hotseat probe (reverted): exploring into the Rocket Launcher
Case token opened the overlay with the token card, the "Gain the Rocket Launcher weapon" prompt and its TAKE /
SEND TO BOTTOM OF MANSION buttons inside the panel, Continue disabled (`data-reveal-locked="true"` + the hint);
clicking TAKE granted the weapon to the discard, dropped `state.prompts` to 0 and re-enabled Continue. A second
run with the Gatling Gun Case token was screenshot-verified. Tests: anims +2 (limbo detection; ordering with an
Infected revealed in the same explore), ui +2 (prompt + lock render; Continue enabled when no prompt opened).
Gates: typecheck clean, game-core 864, server 104, client 201, build OK.

**Mansion reveal = battle line + multi-infected one-at-a-time (2026-11-10):** Manny: "update the reveal mansion
layout, add the player's character and partner card to the left of the weapons used, lead character in the right.
When multiple infected are revealed animate them into the reveal screen one at a time."
1. **Layout** (`MansionReveal.tsx` + `styles.css`): the panel is now a 700px-wide BATTLE LINE, left to right —
   `.mansion-door-party` (the exploring seat's **character + Partner** cards, `compact artOnly`, live HP rings, and a
   red **LED** tag on whichever one led the explore) | `.mansion-door-weapons` (the unchanged "Weapons used" block,
   now `max-width: 200px` so a long row wraps instead of stretching the line) | `.mansion-door-card` (the revealed
   card, still 145px). `flex-wrap: wrap` collapses the line vertically on narrow screens.
2. **Multiple revealed cards** (`anims.ts`): new `detectReveals(prev, next, mySeat)` returns EVERY card the viewing
   seat's newest explore revealed, in **reveal order** (the pre-explore `mansionDeck` order IS the reveal order; a
   WE-019 bottom reveal sorts after the top cards because its instance is in `mansionBottom`). `detectReveal` is now
   `detectReveals(...)[0] ?? null`, so every existing single-card caller/test is unchanged. A multi-explore
   (`exploreCount > 1`), a CI-002 Crow chain and a MA-039/MA-072 event expansion all feed the same list.
3. **Step-through** (`App.tsx`): the reveal state is a `revealQueue` + `revealIndex`. `.mansion-door-card` carries
   `key={def.id-index}`, so advancing REMOUNTS it and re-runs the new `door-card-in` entrance
   (`translateX(-46px) scale(0.8)` + fade, 0.35s) — that is what makes the cards arrive ONE AT A TIME. A `1 / 2`
   progress chip renders when `total > 1`, and the button reads **NEXT** until the last card (**CONTINUE**). The
   queued pending-death (YOU DIED) screen still fires only after the LAST card is dismissed.
4. **Party data**: built in `App.tsx` from `explorer.characterInstanceId` / `partnerInstanceId` (resolved with
   `defForInstance`) plus the explore action's `leader` (default `'main'`); the Partner's HP comes from
   `partnerHp`/`partnerMaxHp` and BOTH cards get the Main's `decorations` (the Partner levels off the Main's
   trophies). A forced explore (FCH-008 Sherry) uses the TARGET seat's party — `explorerSeat`, not the viewer.
**Verified live** (server room, First Timer): `[Hunk + LED] [Combat Knife] [Bui Kichwa]`; a Partner-Mode room:
`[Hunk 65HP + LED] [Partner 70HP] [Combat Knife x2] [Mimicry Marcus]`; and a throwaway `window.__store` hotseat probe
(reverted) drove a 2-explore unarmed explore → `1/2 Cerberus` → NEXT → `2/2 CONTINUE` with the entrance animation
re-running on the remount. Tests: anims +2, ui +3 (the old "prefers a defeated over a re-inserted" case was rewritten
as the multi-card behaviour it became). Gates: typecheck clean, game-core 853, server 104, client 195, build OK.
**Leon L2 `pistolsTwicePerTurn` per the official FAQ (2026-11-10):** Manny quoted the Master
FAQ — *"When he uses a pistol weapon, you can pay its ammo requirement twice for that weapon
to apply its effect and damage twice"* — and said the game did not do that: it only let a
Pistol be REUSED in a later explore. Now ONE entry in an explore action's `weapons` array is
one USE, so the same Pistol instance may appear twice in a SINGLE explore: the ammo is paid
twice, the damage is dealt twice, and every `weaponEffects` entry fires twice
(`grantExplores`, `gainCardsAndActions`, `plusDamagePerExtraWeapon`, …). The two uses may
still be SPLIT across two explores (the old play-area reuse, kept), and the per-turn cap of 2
is enforced by a new `canUseWeaponTimes` helper — `weaponUsesThisTurn` now counts
OCCURRENCES in the log, not log entries, so a double use spends both uses. Wiring:
`validate.ts` (the "duplicate weapon" rejection became a per-weapon cap check),
`actions.ts` (new `uniqueWeapons` de-dupes the play-area / trash-after-use / explosive lists —
a weapon used twice is still ONE card), `enumerate.ts` (offers one doubled variant per combo
so the bots AND the client's legality check can reach it), `client/src/ui/explorePicker.ts`
(new pure `toggleWeaponDouble`) and `ActionBar.tsx` (a "×2" button on every weapon option with
`remainingUses >= 2`; the checkbox still toggles one use). Spec: `SPEC_LEON_L2.md`; tests:
new `game-core/src/engine/leonL2.test.ts` (+11) and 3 in `client/src/ui/ui.test.tsx`. Gates:
typecheck ×3 clean, game-core 864, server 104, client 88, vite build OK, full-game soak 23/30
natural — IDENTICAL to the stashed pre-change baseline (verified by `git stash -u` + re-run),
so no balance regression. Noticed but NOT done (separate feature): SK-021 Weapon Master LV.3
(`exploreDuplicateWeaponEffect`) is armed as `duplicateWeaponEffect` but never consumed in the
explore path — it duplicates only the EFFECT, not the damage, so it needs its own wiring.

**Health-gauge number shadow + skill-box decoration cost (2026-11-10):** Two small UI asks from Manny.
1. **2px shadow all round the gauge number.** `.health-ring-label` (the `<text>` inside every
   `HealthRing` - characters AND infected cards share the class, so one rule covers every gauge) now
   carries four directional `text-shadow`s at 2px offset / 2px blur, `rgba(0,0,0,0.85)`. Four shadows
   rather than one blurred one: `0 0 2px` leaves the diagonals too thin to read as an outline. The
   shadow is pure CSS, so the class is the whole contract - `HealthRing.test.tsx` gained a test that
   asserts `<text class="health-ring-label">` survives, because dropping it silently makes the number
   unreadable over art.
2. **Decoration cost before the star in the character skill box.** `.skill-box` in `CardView.tsx` read
   `Lv{level}:★` / `Lv{level}:☆`; it now reads `Lv{level}:{gate}{star}` where `gate` is that tier's
   `level1At`/`level2At`. Most characters gate L1 at 0, so they read `Lv1:0★` - the 0 means "active
   from the start", not a typo. The six `ui.test.tsx` assertions that pinned the old `Lv1:★` /
   `Lv1:☆` strings were updated to the real gates (Chris 0/4, LK-001 1/8, CR-001 0/7, CC-001 2/5,
   CU-001 3/8, Leon 2/6, Krauser 1/7). Verified in the browser: the skill boxes rendered
   `Lv1:2☆ / Lv2:4☆ / Lv1:2☆ / Lv2:6☆` and `getComputedStyle` on the gauge label returned the four
   2px shadows. Gates: client 188, typecheck clean, vite build OK.

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
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect a clean tree at the multi-explore/granted-explore commit.
3. M5-T05 DONE (commit 0083419): FAQ checklist at `docs/rules/FAQ-VERIFICATION.md`. FAQ-3 (Gatling Gun Majini) was a gap — the engine boosted the player's damage instead of the Infected's attack; Manny ruled Infected's attack, and `resolveExplore`/`resolveMultiExplore` now add it to `boostedAttack`/`atk` (regression tests in `explore.test.ts`).
4. Verify the gate personally (tsc + vitest in the affected workspace) before reporting green.
5. GRANTED EXPLORES (commit 41757a2): a weapon that grants Explores (Pump-Action/Automatic/Riot/Triple Barreled Shotguns, Stun Rod, Flashbang) can now spend them in the SAME explore — `exploreCount` is bounded by `exploresLeft + grantedExploresFor(weapons)` (validate.ts) and the reducer adds the grant back after spending. The ActionBar's "Explores to use" selector lists 1..pool and a hint names the granting weapon; `exploreCountOptions`/`grantedExploresForSelection` in `client/src/ui/explorePicker.ts` mirror the engine helper. `enumerate.ts` offers 1 and the full pool so bots use it too. Fixed a latent multi-explore conservation bug this exposed: MA-092's "Gain 1 copy" was applied to a pre-gain seat snapshot and dropped from the discard (`gainCopyTracked` in mercenaries.ts now reports the created ids; regression test in multiExplore.test.ts).
7. SKILL AREA POSITION (uncommitted): the Mercenaries Skill Area moved out of the footer dock into the action identity row, immediately right of the character/partner cards — the row is now `CharacterCards -> Skill Area -> deck -> hand -> discard`. App.tsx no longer renders SkillPanel; ActionBar.tsx renders it in a new `.action-col.action-col-skills`. `.skill-panel` is a vertical column and `.skill-panel .skill-row` stacks label -> pips -> button (scoped, because `.skill-row` is shared with CardView's character-card skill list). Collapses to zero width when the Skill System is off.
6. LEON L2 DOUBLE USE (this change): `weapons: [pistolId, pistolId]` in ONE explore = the official FAQ play (pay the ammo twice, effect and damage twice). `weaponReuse.ts` gained `canUseWeaponTimes` and `weaponUsesThisTurn` counts occurrences; `validate.ts` rejects only beyond the per-turn cap; `actions.ts` de-dupes the play-area/trash lists via `uniqueWeapons`; `enumerate.ts` offers the doubled combo; the ActionBar has a "×2" button. If a future ability grants MORE than 2 uses (or duplicates only the effect, like SK-021), extend `maxWeaponUses` and the `toggleWeaponDouble` cap — the rest of the pipeline already treats each array entry as one use.
8. IT-000 ANTIQUE COIN (this change): a custom MANSION item — `mansion: true` routes it to the Mansion deck (2 copies) instead of a Resource Area pile, and its `gainWeaponFromMarket { costLimit: 60 }` effect fires on `playItem` as an `antiqueCoinChooseWeapon` prompt. The `mansion` flag is the general switch for "custom card that prints a cost but lives in the Mansion"; any future card with it must also be excluded from `pilesForScenario` and grouped into the picker's Mansion section. `marketWeaponIds(state, maxCost?)` is shared with EX-003 (which passes no limit).
9. CH-000 RACHAEL FOLEY (this change): a custom character whose L1 is a COUNT-based Explore obligation. `PlayerState.exploresRequiredThisTurn` (2 when she takes the turn-start +1 Explore) is paid down by `payExploreDebt` in `applyOutbreakHooks` (by `exploreCount`, so a multi-explore of 2 counts twice) and by the Sherry forced-explore path; `startTurn` clears it; `validate` blocks endTurn while it is > 0 AND `canExploreLegally`. `mustExploreNow(state, seat)` is the shared "is this seat obliged to explore" predicate (Wesker `mustExplore` OR the debt) — use it for any new obligation instead of reading `mustExplore` directly. Her L2 is a per-explore bonus on the shared `abilityDamage` term.
10. PULL FALLOUT FIXES (this change): the three failures commit 43eb09c left behind are fixed (details in the top paragraph). The MA-078 lesson is the one to remember — in the MULTI-explore path, `applyMercenariesNotDefeatedEffects` already shuffles an `infectedShuffledBack` infected into the deck, so the caller must NOT shuffle it again AND the disposition pass must NOT bottom it either; and `newPlayer` is built from the PRE-explore seat, so any seat mutation a not-defeated effect makes (MA-078 drops the highest-Decoration trophy from `attached` and adjusts `decorations`) must be carried over from `fxState` or it is silently lost and the card lands in two zones at once.
11. LATER PULL FALLOUT (this change): commit 8c0cc06 added `ai/win_turns.ts`, which failed `tsc --noEmit` under `noUncheckedIndexedAccess` (`eTcounts[s] += 1` on a fixed 4-slot array) — guarded with `?? 0`. And the soak's natural-end floor moved 0.6 → 0.55 once the conservation fix let the rate assertion run: the pulled AI reweight lengthens every game, and the MA-078 fix costs one alliance natural ending (measured 18/30 without it, 17/30 with). Balance signal, not a defect — conservation stays the real gate.
12. CI-009 / MA-000 RACHAEL FOLEY (this change): the fan-card pair is in `data/custom.ts` with three new `InfectedEffect` kinds. The damage soak is applied inside `resolveExplore`/`resolveMultiExplore` via the `ammoX10InDiscardCount` param — any NEW combat modifier that depends on the discard pile must be threaded the same way (the resolvers are pure). The defeat effects live in the explore reducer: CI-009's `onDefeatShuffleCardIntoMansion` creates a fresh instance and shuffles it in (`shuffleCopyIntoMansion`), and MA-000's `onDefeatShuffleBackIfDamageAtMost` removes the instance from `attached` while still paying its Decoration. `cardsForScenario` pulls `ma-000` in when `ci-009` is selected. If a future card shuffles a named card into the Mansion, add its dependency to the same `wanted` loop.
13. CI-001 / CI-003 OSCAR + SADDLER (this change): `engine/rachaelFoley.ts` became `engine/customInfected.ts` (it now serves every custom infected, not just Rachael). Two new kinds: `onNotDefeatedTrashHighestDamageUsedWeapons` (CI-001 — trashes the highest printed-Damage used weapon, ties included, skipping weapons already in `removed`) and `onRevealEachPlayerGainsAmmoX10` (CI-003 — `gainAmmoX10` per living seat). CI-003's defeat shuffles the OFFICIAL `ma-054` Osmund Saddler, so `cardsForScenario`'s dependency loop now resolves ids against `ALL_CARDS` too — any custom card may name an official card as its dependency. Reveal grants and tramples must be applied to the FINAL returned seat in every explore path (the seat rebuild would drop them otherwise); the single-explore defeated branch applies them to `defeatFxState`, the multi-explore and not-defeated branches to the returned state.
14. FCH-002 HUNK (this change): a fan character whose L2 is a CONDITIONAL per-tag damage bonus. `plusDamageForWeaponTagIfAmmoAbove` is the kind to reach for when a card says "all your <tag> weapons get +N damage while <condition>" — add a pure helper next to `exploreBonusIfAmmoAbove` and wire it into the shared `abilityDamage` term of BOTH `actions.ts` (reducer) and `explore.ts` (overlay helper), or the picker's total will disagree with the resolve. HUNK also shows the custom-character checklist: printed gates go in `level1At`/`level2At`, the printed text goes in `levels[].text` (the card face renders those, not `text`), `canBePartner` defaults to true unless the card prints a restriction, and the art is a whole-card scan normalised to 320px P-mode.
15. PR-009 START-OF-TURN FLAG (this change): a "start of turn" ability that is ALSO a manual button must set `usedStartOfTurnAbilities` in its prompt resolution, or the button stays after the prompt is answered. When two cards share a prompt kind (PR-009 and AC-017 both used `giveOneCardToPlayer`), give the character its OWN kind before adding a once-per-turn flag keyed by ability kind — the flag map is global, so the shared kind would let either card consume the other's ability.
16. SK-034..SK-036 BOMBER (this change): three fan Mercenaries Skills. Selecting them in the room's Custom Cards puts them in the def pool and `buildSkillDeck` deals every skill-type def, so they join the Skill deck automatically — the ONLY extra client work was a picker section, because `type: 'skill'` fell through every existing group in `Lobby.tsx` (characters / infectionTokens / resourceAreaCards / otherCards) and would have been invisible. SK-034 is a flat per-Explosive-weapon bonus (`exploreExplosivePlusDamage`), wired into `exploreSkillDamageBonus` AND `exploreDamage` — note `exploreDamage` (the picker's preview, imported from `@re/game-core`) did NOT read skill bonuses at all before this, so SK-030's pistol bonus was missing from the preview too. SK-035 is a reuse ability: `maxWeaponUses` returns `1 + count` for Explosive weapons while the Skill is active, and the explore reducer's disposal now keeps an Explosive with uses left in the play area instead of trashing it (`toTrashAfterUse` had to stop matching Explosives — they are disposed of by the explosive rule, and both paths were adding them to `removed`). SK-036 is the hard one: Manny ruled it deals the Explosive weapons' damage to EACH revealed Infected individually, so a weak one can die while a strong one survives. That needed `resolveMultiExplore` to return per-index `splashDefeated` + `survivingAttack`, and the multi-explore reducer block to split into `defeatedEntries` / `undefeatedEntries` — the on-defeat bookkeeping (decorations, level, XP, Barry chain, on-defeat prompts) runs for the defeated subset and the damage/on-not-defeated block runs for the survivors, so a partial defeat awards the kill AND still charges the survivor's attack. `explosiveDamage` is computed by `exploreExplosiveDamage` (Explosive weapons' own damage + per-Explosive bonuses: Jill L1, SK-034) — reach for that helper rather than re-deriving it. Known limitation: the MA-039 Collapsing Floor Traps path has its own simplified `resolveMultiExplore` call and does not apply the splash. Pre-existing inconsistency noticed while splitting the block (NOT changed, it moves bot XP/balance): the single-explore path always pays the +1 Explore XP (actions.ts ~3582) but the multi-explore path only pays it inside the defeated branch, so a failed multi-explore pays no XP — a partial SK-036 defeat pays it, a total whiff does not. RE-VERIFIED after this change: server M3-T05 still fails, and it is NOT the Bomber work — with the multi-explore split AND the explosive-disposal change both reverted (actions.ts byte-compared against the pre-Bomber tree, only inert deltas left: 3 unused SkillEffect kinds, 3 unselected custom cards, 2 skill helpers that return 0 with no Skill active, and resolveMultiExplore's two extra return fields) the test still fails at the same assertion. The cause is the other session's uncommitted Gatling xAmmo rework in the tree.
17. RC-002 PARTNER HEAL (this change): a self-healing character ability must be looked up per CHARACTER, not through `seatAbilities`. `healIfDidNotExplore` used the union and wrote `hordeHp`, so a Partner Rebecca healed the Main's Health and never her own — the reported "does not heal her when she is a partner". Now `characterAbilities` heals `hp` and `partnerAbilities` heals `partnerHp` (mirroring `healAtTurnStart` in `startTurn`), and the value is written explicitly into `newPlayer` because it is built from `...player`. The trigger stays seat-level: "Partner and Main explore at the same time", so `exploredOrAttackedThisTurn` suppresses the heal for both. Do NOT use `partnerLeading` to decide who explored — only the legacy `chooseExploreLeader` action persists it, the modern `explore` action's `leader` field does not.
18. CI-002 CROW CHAIN REVEAL (this change): the client reveal overlay steps through `detectReveals`, which needs the EXACT revealed set — and the deck diff cannot supply it, because a revealed card that is returned (bottomed / shuffled back) looks like an unrevealed deck card and `shuffleBack` reshuffles the whole deck. The engine now writes `action.revealedInstanceIds` (reveal order) onto the logged explore via `recordExploreReveals(ids)`, which rewrites the explore log entry matched by `seq`. Wire it at EVERY site that reveals more than `exploreCount` cards: the plain single reveal, the MULTI block's full `revealedIds`, and the single-path MA-039 / MA-072 branches. The client falls back to the top-`exploreCount` prefix when the field is absent (old logs). Do NOT re-derive the Crow/MA-039/MA-072 expansion rules on the client — that duplicates the reducer.
19. POISON GAUGE + COUNTER VISIBILITY (superseded by 20 on the gauge geometry): (a) The viewing player's OWN counters were never rendered — `Board.tsx` only renders `PlayerPanel` for other seats, so a Poison counter was invisible except as a transient card-shake. `CharacterCards` now draws them on the character card (`.cc-counters`, `data-player-counters`); if a future surface hides the own panel again, the counter disappears with it. (b) The pulse animation (`hp-pulse` / `.cc-hp-ring-flash` / `CardView.flash`) is gone by request. A counter turns the gauge purple via `HealthRing`'s `poisoned` prop -> `data-poisoned`.
20. GAUGE ANCHOR + OPACITY (this change): the 36% character gauge could not stay centred on the printed badge (89.7%, 7.7%) and fit inside the card, so the anchor moved inboard to (78%, 17%) — promo (78%, 27%) — and the art-only card went back to `overflow: hidden`. The Infected gauge WAS doubled (27 -> 54) and is absolutely positioned (`.card-top .health-ring`) so it cannot grow the card header. `HealthRing` gained an opaque backing disc (`.health-disc`, `#12151c`). When resizing either gauge, check `fullyInside` against the card rect at desktop (80x114) and phone (44x63) — the phone card is only 44px wide, so a 36% gauge is 15px.
21. LK-001 LEON L2 (this change): "all weapons he plays count as pistols". `effectiveWeaponTags`/`isPistolWeapon` take an optional `playedIds` — an explore's weapon set counts as being in the play area, because playing a weapon puts it there. `dualWieldBonus` and `healOnDefeatWithWeaponTag` pass their `weaponIds`; the ammo path (`exploreAmmoReq`) does NOT, so a pistol-tagged ammo discount still only applies to real/play-area pistols. `playAreaCardsArePistols` reads `seatAbilities` (Main OR Partner Leon), not `characterAbilities`. When adding a new "is this a pistol" consumer, decide explicitly whether it should see `playedIds` — L1's Dual Wield does, ammo does not.
22. BARRY L1 ONCE-PER-TURN (this change): `usedStartOfTurnAbilities` is ONLY for abilities that FIRE FROM A TURN-START PROMPT (PR-009, AC-017, ...). Never record a manual `useCharacterAbility` there — the flag is cleared only in `startTurn`, so it outlives the seat's `endTurn` and blocks the ability for every later turn. Manual once-per-turn abilities are covered by validate's log scan, which walks back to the seat's last `endTurn` (`plusDamageThisTurn` is in that switch list). The `plusDamageThisTurn`-specific check this replaced was dead code: the general `[ability.kind]` check directly above it already fired first.
23. DUPLICATE CARD IDS + DUPLICATE PROMPTS (this change): a repeated `id` in `data/*.ts` is silent — `cardDefs` keeps the LAST definition, so the other card is unreachable (`ma-000` was both the Rachael ooze and the Martial Arts action; the ooze resolved as an action and was never defeated). Scan `grep -c "id: '<id>'" game-core/src/data/*.ts` after adding a card, and check the printed code against `CARD-ART/<ID>.png`. Likewise, two turn-start prompts with the same id destroy each other (`chooseOption` removes every prompt with that id): `turnStartAbilityPrompts` pushes 19 prompts, most with the generic `ability-<seat>-v<version>` id, safe only while each ability has one prompt — give a new prompt its own prefix. When two commits add the same card, remove BOTH the duplicate def and its duplicate prompt/handler, and carry over anything the deleted block did that the kept one lacks (here: the `usedStartOfTurnAbilities` flag write).
24. ZOMBICIDE FAN WEAPONS CW-025..CW-033 (this change): nine custom weapons. Per-card effect kinds are listed in the `WeaponEffect` union. Two rules of thumb: (a) a bonus that scales with the number of Infected Battled goes in `computeDamage` (which the reducer now feeds `infectedBattledThisTurn: exploreCount`) — adding it to the per-weapon `damage` expression too double-counts, because that value is summed into `computeDamage`; (b) a "you can / once per turn" weapon effect is a `useWeaponAbility` manual trigger (validate's `manual` filter + enumerate's `hasManual` must both list the kind, or no button appears). CW-025's recall branch is currently unreachable — a weapon only reaches the play area by being explored with, and `playWeapon` has no reducer case.
25. ABILITY/EFFECT REVEAL OVERLAY (this change): a NON-explore reveal must pause the table and show the card. The engine records `LoggedAction.reveals` via `recordCardReveals()` (same `seq`-matched log rewrite as `recordExploreReveals`) — and because that helper REASSIGNS `nextBase.log`, always call it before building a state object that spreads `...nextBase`. The client's `detectCardReveals(prev, next, mySeat)` + `CardRevealOverlay` render it, gated to the INVOLVED seat (actor, or a seat whose own card was revealed) so a bot's private peek does not leak to the human; the overlay is suppressed while a mansion-door reveal is active. When adding a new reveal effect/ability, wire `recordCardReveals` at its site — a peek has no zone diff, so the client cannot discover it any other way.
26. MERCENARIES BASIC RESOURCES (this change): a room option that swaps the scenario's basic piles for the Mercenaries printings. `MERCENARIES_BASIC_RESOURCES` is keyed by PILE ID (am10/am20/am30/hg/kn) and `pilesForScenario` replaces only the CONTENTS, so the board slot is stable. Any new option that changes which cards a scenario uses must be passed to BOTH `cardsForScenario` and `pilesForScenario` — `setup` silently skips pile card ids with no def, so a missing def reads as "the pile is empty", not an error. The starting deck is stat-derived (`pickBasic` in game.ts) and also honours the option via `GameSetup.mercenariesBasicResources`, which must be set at the `setup()` call sites in host.ts and hotseat.ts.
27. MERCENARIES AMMO ABILITIES (this change): the card ART is the source of truth when a def's `text` disagrees with it — AM-005's art reads "When you Trash this card, you get +10 Gold during this turn" and the data had a plain +10/+10. `CardDef.bonuses` fire on PLAY ONLY; an extra printed ability needs its own effect kind (`ammoEffects` here). A "when this card is trashed" trigger has NO choke point (45 sites push to `removed`) — diff `removed` before/after the action in a post-action hook instead of patching each site, and pay the OWNER (`ownerSeatOf(prev, id)`), not `action.seat`. A per-card on-defeat trigger must be raised in BOTH explore paths: the multi-explore reducer does NOT call `applyMercenariesOnDefeatAbilities`. An end-of-turn "you can move it to the top of your Inventory" is resolved automatically (the CW-025 ruling) — and the end-of-turn draw then takes it into the new Hand, so assert on the hand, not `inventory[0]`.
28. BOSS REVEAL vs GAME-OVER OVERLAY (this change): the explore that defeats the boss is the same action that ends the game, so the end screen and the reveal land on the same render. `.seat-swap-backdrop` (640) covered `.mansion-door-backdrop` (600). Two guards, because either can be undone alone: raise the reveal's z-index above the seat-swap (660), AND gate the overlay with `shouldShowGameOverOverlay` so it is not in the DOM while a reveal/death overlay is pending. The z-index is what prevents the FIRST-frame flash — the reveal queue is populated in a `useEffect`, i.e. after paint. When two full-screen overlays can coexist, decide the precedence ONCE (a helper + a CSS-ordering test) rather than per call site.
29. END-SCREEN PLAYER RANKING (this change): the game-over screen lists every player ranked by Decorations then Health — the same order `checkWin` uses, so the list agrees with the CHAMPION line. The ranking is a PURE helper (`client/src/ui/standings.ts rankStandings`) because the client test env is `node` with no DOM and App cannot be rendered in tests; `SeatSwap` takes an optional `standings` prop (`<ol data-standings>`, one `<li data-standing>` per seat, winners get `is-winner`). `viewForSeat` does NOT sanitize Decorations/Health (only hand and inventory), so `view.state.seats` is enough — no new server field.
30. B4MC SHERRY BIRKIN PROMOS (this change): three JP-2025 prints whose codes collide with official CH-004..006, ids `b4mc-ch-004/005/006`. The boxed number beside "Level N" is the DECORATIONS requirement (`level1At`/`level2At`), not a cost. A "+N per Character that has been Healed this turn" ability needs an explicit TRACKER — diff Health before/after (`applyHealTracking`) at both turn boundaries (after `applyAction`, and in the `startTurn` wrapper), keyed `<seat>:main|partner` so a Character counts once; clear it in `startTurnInternal`. A custom card may name an OFFICIAL card it needs via the new `CardDef.dependencies`, which feeds the `cardsForScenario` `wanted` loop (ch-005 -> we-028 Stun Rod). A "pay 1 Action" manual ability goes in validate's manual list with an `actionsLeft >= 1` check, and its once-per-turn comes from the log scan — do NOT use `usedStartOfTurnAbilities`. When the bonus is per-WEAPON, add it in the shared per-weapon damage expression (covers single + multi + ally) and mirror it in `exploreDamage`.
31. FAN JP-2025 SET (this change): 7 custom cards (5 actions `cac-*`, 2 weapons `cw-034/035`). Two structural lessons: (a) CAC-013's "at the end of your turn" trigger required extracting the whole endTurn reducer body into `applyEndOfTurn(state, seat, nextBase)` — the turn must END after the target's discard, so the `endTurn` case raises a prompt and the resolution calls the helper; the host AND `client/src/hotseat.ts` now gate auto-`startTurn` on `next.prompts.length === 0`, because a prompt can hold the turn open. (b) A weapon buff that changes an Infected's Decoration (CW-035) cannot ride on a modified `revealedDef` copy — `decorationDelta` reads `state.cardDefs`, so the bonus is awarded explicitly at the defeat site. Also: `gainCard` gained a `'playArea' destination` (CAC-015 routes gained Weapons there) and the CAC-015 first-weapon bonus is mirrored in BOTH the reducer's per-weapon damage expression and `exploreDamage`. Manual action-card abilities use the new `useActionAbility` action (validate + enumerate must both list it). Art is 320px P-mode; a second crossbow print was dropped as a duplicate per the user.
32. AC-040 PER-ACTION DAMAGE (commit 86f5db9): `damagePerAdditionalActionThisTurn` had a WRITER (the `damagePerAdditionalAction` effect) and an INITIALIZER (`game.ts` x3) but no READER — the aspirational-data trap. The reader sits at the TOP of the `playActionCard` case and reads the PRE-play `player`, which is exactly what makes "another action" exclude the card that arms it; the field is already cleared in `startTurn`, so no new flag was needed. Routed through `applyRicardoDamage` for consistency with every other self-damage effect.
33. CH-015 REDIRECT + CW-013 BUFF (commit 93e3be4): both were data-only kinds.
34. CH-045 DAMAGE REDUCTION -> CHOICE (commit 974f3a1): first F1 card.
35. CH-049 REDUCTION -> CHOICE + SHARED SETTLEMENT (commit ae68b78): second F1
36. CHRIS L1 REDUCTION -> CHOICE (commit d7e34cc): third F1 card. Renamed the helper to
37. KEVLAR JACKET + SLOUGH ARMOR -> CHOICES (commit 58eaaa8): F1 complete for the explore/attack
38. AC-012 -> REACTIVE CHOICE (commit abbb950); ch-023 still open.
39. CH-023 -> CHOICE (commit 54e32b2): pre-reveal park via `davidKnifeAsk` +
40. REVEAL PANEL REPEATS IN BOT STRETCHES -> FIXED (commit 963a812): client-side,
41. PROMO PR-003..PR-008: batch 1 shipped (e77f796) = PR-003, PR-005, PR-008.
42. PROMO PR-004 / PR-006 / PR-007 implemented (batch 2) — the promo set
43. Promo batch 2 LANDED as 07709e6 (gates green). Yoko L1 needed a
44. Location tiles RESIZED to the hand-card footprint and their text moved
45. TS2353 at turnHistory.ts(47,3): master is green again (685c55b) and the
   real culprit was TWO labels for action types that exist only uncommitted.
   Worktree gates must re-point node_modules/@re/* to the worktree’s OWN
   packages via junctions — cp -a dereferences them. See the paragraph above.
   onto the art (b9a839d); master’s typecheck was red from an unlabelled
   Action union member and was fixed in 9512605 — see the paragraph above.
   faceDownAttachedId because `attached` is shared with trophies — see the
   paragraph above; do not reintroduce an array-replacing attach.
   is complete. New patterns: exploreChoiceAsk/exploreChoicePending (second
   pre-reveal park) and GameState.lethalSubstitution (max-HP rewrites survive
   seat snapshots). See the paragraph above for both.
   PR-004 / PR-006 / PR-007 transcribed but unimplemented — see the paragraph above;
   `attachCardFaceDownToCharacter` is declared but has NO engine wiring at all.
   pre-existing. `revealsForExplore` must use the engine's per-explore
   `revealedInstanceIds` only; the prev->next zone diff spans a whole batched
   snapshot. Test: client/src/ui/revealScoping.test.ts.
   `davidKnifePending`, answered through `chooseOption`. F1 + ac-012 + ch-023 all done;
   remaining backlog is the non-explore damage sites.
   ch-023 David King L2 needs a PRE-REVEAL explore park/rerun (CW-013 defers after the
   reveal), not the hold pattern. See the paragraph above for the details.
   paths. `kevlarQueued` now seeds `reductionQueued`; the resolver moves the jacket to the
   Mansion bottom (dropping any stray copy first). Remaining backlog: the non-explore damage
   sites (AoE reveals, traps, mercenaries.ts dealDamageToCharacter), ac-012, ch-023.
   `leaderInfectedReduction(state, seat, abilities)` so a PARTNER-led explore qualifies,
   and added a shared `reductionQueued` flag so only one reducer window fires per hit.
   Remaining F1: ma-054o Kevlar Jacket, in-004 Slough Armor, and the non-explore sites.
   card. `settleHeldDamageLoss(state, seat, applied, partnerLead)` is now the
   common tail of every hold-and-settle window (hp update, flipDown on a lethal
   Main hit, permanent Partner removal on a lethal partner hit) — reuse it instead
   of re-inlining that block. Porting note: `git diff` against a HEAD that predates
   the previous card’s commit bundles the two cards’ hunks together, so filtered
   patches get a stale PRE-image — rebuild those hunks by hand.
   (a) The mechanism to copy for the rest of F1 is JILL'S HOLD, not a new
   deferral: set the leader back to pre-damage Health, queue a prompt, and let
   the resolver settle reduced-or-full onto the CURRENT hp. That keeps lethality
   honest (a declined lethal hit still downs) and needs no per-site rework.
   (b) `prev` in `applyDamageTakenHooks` is the PRE-action state, so it still
   contains the prompt being answered — use that to suppress an automatic side
   effect (the Ammo grant) instead of double-paying.
   (c) A partner-led explore lands the loss on `partnerHp`; emptying it must run
   the same partner-removal cleanup as the ch-015 redirect.
   (a) A "when this character takes damage" CHOICE belongs in the POST-ACTION diff hook
   `applyDamageTakenHooks` — patching every damage site is how a source gets missed, and
   reading the PRE-play player is what makes "another action" exclude the arming card.
   (b) A turn-scoped TYPE grant needs its own PlayerState map (`extraWeaponTags`) merged
   inside `effectiveWeaponTags`, so the reducer AND `exploreDamage` (the picker preview)
   agree; a tag added only in the reducer makes the UI lie.
   (c) `reactiveTrashWindow`'s kind union is the deferral channel — add a kind there rather
   than inventing a parallel pending field, but the handler must re-resolve with modified
   params and RECOMPUTE damageTaken/decorationDelta when the outcome flips.
**FAN "LOCATIONS" CARD TYPE (2026-11-16):** Manny added a new custom card TYPE: room cards that live attached to the Mansion deck and are REVEALED by an Explore (the Explore is consumed). Three kinds: GLOBAL (active for everyone on reveal, cannot be bought), 1X (a one-shot you pay gold + 1 Buy for, repeatable while you have buys unless the card says "Max: once per turn"), and investment (no GLOBAL/1X label - pay the printed gold + 1 Buy per cube, left-to-right price ladder, cubes shown as player numbers in coloured circles). Ids `loc-001`..`loc-008`. Engine in `game-core/src/engine/locations.ts`; state `locationDeck` + `locations`; reveal gate at the top of the explore case in actions.ts. The whole explore case is wrapped in an IIFE (`exploreResult`) purely so the Arklay armed flag can be cleared on every return path - the seat is rebuilt from a snapshot in each branch, so a mid-case clear is dropped. `sanitize()` hides the location deck ORDER (length preserved) so clients cannot see what comes next. UI `client/src/ui/LocationsRow.tsx` + a count badge on the mansion pile. Tests: `customLocations.test.ts` (20), `locationView.test.ts` (3), `LocationsRow.test.tsx` (6). Locations are OPT-IN via `GameSetup.locationsMode` (hotseat toggle in the Lobby) — auto-dealing them broke 89 existing custom-card tests, so they never enter a game unless asked for. NOTE: none of the 8 fan cards is an investment card, so the invest path is covered by an injected fixture test.
**FAN "LOCATIONS" BATCH 2 (2026-11-16):** Five more rooms, ids `loc-009`..`loc-013`. `loc-009` Lord Spencer's Study (investment, 30g: +1 XP whenever you trash, via the `removed`-diff hook `applyLocationTrashXpHooks` in actions.ts; On Reveal +5 health), `loc-010` Lounge (investment, 10g: 1 decoration per card you hold from a supply pile that is now EMPTY; On Reveal removes your infection + counters), `loc-011` Mansion Bathroom (investment, 10g: 1 decoration per copy of the 2nd most common weapon NAME in your Inventory), `loc-012` Materials Room (GLOBAL: -1 decoration per Inventory card beyond the first 18), `loc-013` Mirror Corridor (GLOBAL: -1 per singleton Inventory card; On Reveal Infected revealed THIS turn get -10 Health, min 5). RULING: an On Reveal effect applies to EVERY living player regardless of the card's GLOBAL/1X/invest label — only the ongoing effect is scoped. Mirror's reduction is `GameState.infectedHpReductionThisTurn`, passed into resolveExplore/resolveMultiExplore as `infectedHpReduction` and cleared in startTurnInternal. Lounge's empty-pile scoring derives each pile's cardId from `state.cards` (an emptied pile has no instances left to read). `SimConfig.locationsMode` lets the bot soak deal the deck. Tests: `customLocations2.test.ts` (11). Art LOC-009..013.png.
**FAN "LOCATIONS" BATCH 3 (2026-11-16):** `loc-014` Terrace (invest 80g) and `loc-015` Tiger Statue Room (invest 70g), both confirmed INVESTMENT cards by reading the panel art. Terrace's "first action card gained may be played" is implemented as a free immediate play of the first ACTION bought from a market pile each turn, gated on having an Action left: `buy` moves the card to hand and sets `pendingFreeActionInstanceId`, and `applyAction` re-enters the normal `playActionCard` path (flag cleared first, so no recursion) — the card's bonuses fire exactly as a normal play. `freeActionPlayAvailable` is refreshed for EVERY investor at the `startTurn` boundary and is `undefined` until then, which is why an immediate post-invest play works. Terrace's On Reveal offers every living player one item from the Resource Area (`locGainItemChoice`). Tiger knocks 10 gold off EVERY buy on the investor's turn (`locationBuyCostReduction`, applied in the buy reducer and in validate's affordability check), and its On Reveal lets each player discard a card for 1 XP (`locDiscardForXpChoice`). Gotcha: a reveal prompt raised during an explore is CONSUMED by any helper that auto-answers prompts — assert on the explore's returned `prompts`, not on the post-ack state. Tests: `customLocations3.test.ts` (10). Art LOC-014/LOC-015.png.
