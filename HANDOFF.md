# HANDOFF — resume here

**Current state (2026-11-07 ~11:10):** M1 ✅ 16/16, M2 ✅ 5/5 + bot-logic v2, M3 ✅ 5/5 (T01–T05), M4 ✅ client complete. **M5 ✅ T01–T04.** All 47 characters have engine behaviour. **Mercenaries (52 cards) ✅, Nightmare (50 cards) ✅.** **Duplicate card ids RESOLVED — `ALL_CARDS` is now 304 cards with 0 duplicate ids.** **Downed/revive wired into the damage path.** Suites: **game-core 666, server 96, client 131** — all green, typecheck clean (3 workspaces), client build OK, soak green. **Next: M5-T05 — rules verification checklist vs the official FAQ** (needs Manny's rulings on any gaps found).

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
- **M5 NEXT**: hardening & release (PLAN.md is scope authority) — README + run scripts, production build verification, reconnect torture test, deploy smoke test.

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

## Resume checklist
1. Server healthy? `curl :11434/api/ps`; if empty list: `export OLLAMA_MODELS="F:\ollama\models" && ollama serve`.
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect a clean tree at the downed/revive wiring commit.
3. M5-T05: rules verification checklist vs the official FAQ (`docs/rules/RE1_Rulebook.pdf` has a clean text layer; `re1_rulebook.txt` is OCR'd and column-mangled — use `pdftotext -layout`). Every gap found needs Manny's ruling before it becomes a contract change.
4. Verify the gate personally (tsc + vitest in the affected workspace) before reporting green.