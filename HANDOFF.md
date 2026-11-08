# HANDOFF — resume here

**Current state (2026-11-07 ~15:00):** M1 ✅ 16/16, M2 ✅ 5/5 + bot-logic v2, M3 ✅ 5/5 (T01–T05), M4 ✅ client complete. **M5 ✅ T01–T05 (COMPLETE).** All 47 characters have engine behaviour. **Mercenaries (52 cards) ✅, Nightmare (50 cards) ✅.** **Duplicate card ids RESOLVED — `ALL_CARDS` is now 304 cards with 0 duplicate ids.** **Downed/revive wired into the damage path.** **Every rules-text-only card now has engine behaviour (WE-001/018/018g/019/021/025/030, MA-045/047/048/049/054o/055o/056o/057o).** **No effect kind is dead any more (MA-025/030/036, WE-028, IN-002/004 done; AC-049/035/038 were always prompt/id-handled).** **MULTI-EXPLORE (exploreCount) + PARTNER EXPLORE FIX ✅** (see below). Suites: **game-core 710, server 97, client 141** — all green, typecheck clean (3 workspaces), client build OK, soak green (22/30 natural). **M5-T05 DONE (commit 0083419):** FAQ checklist at `docs/rules/FAQ-VERIFICATION.md` — FAQ-1/FAQ-2/partial-draw PASS; **FAQ-3 Gatling Gun Majini was a real gap, FIXED per Manny's ruling** (the +5 per full 10 total Ammo boosts the Infected's OWN attack, not the player's damage). **M5 COMPLETE — release-ready; next step is Manny's call (deploy / M6 scope).**

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