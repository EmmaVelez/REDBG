# Resident Evil Deck Builder — Online Multiplayer Web App

## Vision
A browser-based, online multiplayer implementation of the Resident Evil Deck Building Game
(Bandai, 2010 — Premier Edition base set), with optional AI-controlled players, online rooms
with invite codes, and local pass-and-play on one device.

**Status: personal/fan project.** Game mechanics and card stats are implemented as data; no
Bandai artwork is distributed (placeholder card rendering only).

## Who does what
- **Hermes (orchestrator):** plans, writes task specs, runs the coder harness, validates every
  artifact (tsc, vitest, builds), fixes or re-splits tasks that fail, keeps `LEDGER.jsonl`,
  checks in with Manny at milestones.
- **Local coder model (`qwen3.5:4b` via Ollama):** writes the code, one small task at a time.
- **Manny:** approves milestones, playtests, decides rules questions.

## Stack (chosen for small-task coding + type safety)
- **Monorepo:** npm workspaces — `game-core/` (pure TS engine + card data + AI), `client/`
  (Vite + React + TS), `server/` (Node + `ws` + `tsx`).
- **Engine:** pure functional reducer — `GameState × Action → GameState`, seeded RNG,
  full action log → deterministic replay. This is what makes the server authoritative,
  the AI easy (it just picks Actions), and pass-and-play free (same engine, no server).
- **Tests:** vitest (game-core), supertest-style WS integration tests (server).
- **No database** in v1 — in-memory rooms (games are short-lived).

## Chunking rules for the 4b coder
Every task given to the model must:
1. Touch **one file** (max two: module + its test).
2. Include the **exact spec** (function signatures, types, edge cases) — no open design questions.
3. Include **context files verbatim** (types it must conform to).
4. Be verifiable by a **command** (`npx vitest run X`, `npx tsc --noEmit`).
5. Data-entry tasks (card lists) are split into batches of ≤ ~15 cards.

## Milestones & task breakdown

### M0 — Scaffold & harness ✅ (done by Hermes directly)
Repo, workspaces, tsconfigs, vitest, `tools/coder.py` harness, PLAN.md, LEDGER.
Smoke test: coder writes `game-core/src/util/rng.ts` + test, validation green.

### M1 — Game core engine (pure TS, no UI)
All tasks land in `game-core/src/` with vitest tests.
- M1-T01 `types.ts` — Card, CardType, Zone, PlayerState, GameState, Action union *(Hermes writes: this is the contract everything else conforms to)*
- M1-T02 `util/rng.ts` — seeded PRNG (mulberry32) + seeded shuffle ✅ smoke task
- M1-T03 `engine/deck.ts` — draw/discard/reshuffle/exile pile ops
- M1-T04 `engine/resources.ts` — ammo & XP tracking per player
- M1-T05 `engine/turn.ts` — turn phases: start → actions → cleanup; turn order
- M1-T06 `engine/market.ts` — the card line (market): display, buy with ammo/XP, refill
- M1-T07 `engine/combat.ts` — damage from weapons/characters vs infected, kill → XP, infected attacks players (damage → infection cards into deck)
- M1-T08 `engine/infection.ts` — infection deck, gaining infection cards, death by damage
- M1-T09 `engine/locations.ts` — location deck: explore, location powers, mansion deck
- M1-T10 `engine/characters.ts` — starting characters, their abilities, level-ups
- M1-T11 `engine/actions.ts` — the root reducer: validate + apply every Action; illegal → reject
- M1-T12 `engine/game.ts` — setup (N players + bots, seed), win conditions (infected deck empty / location objectives), game-over state
- M1-T13 `engine/replay.ts` — serialize action log, replay to identical state (determinism proof)
- M1-T14a..g `data/base-set.ts` — full Premier Edition card data in batches:
  characters, weapons (light/heavy), ammo, items, actions, locations, infected — each batch
  ≤ 15 cards, schema given, source: BGG master card list (research step first → `docs/rules/`)
- M1-T15 `engine/rules-faq.ts` — edge cases from the official Master FAQ (stacking, timing)

### M2 — AI players
- M2-T01 `ai/enumerate.ts` — list legal Actions from a GameState (uses engine validator)
- M2-T02 `ai/evaluate.ts` — heuristic scoring of state (life, deck quality, XP, threats)
- M2-T03 `ai/policy.ts` — pick best action; greedy 1-ply + key combos (play char → attach weapon → attack)
- M2-T04 `ai/bot.ts` — bot interface: given state + seat, return Action; difficulty knob (noise)
- M2-T05 sim test — 4 bots (2 human-proxy random + 2 policy) play 20 full games to completion without illegal moves

### M3 — Server & rooms
- M3-T01 `server/src/protocol.ts` — WS message schema (shared with client): create/join/leave room, seat select, start, action, state-sync, chat, reconnect
- M3-T02 `server/src/rooms.ts` — in-memory room store, 6-char invite codes, seats, bot slots, host controls
- M3-T03 `server/src/host.ts` — authoritative game: engine runs on server, validates actions, broadcasts per-player states (hide other hands)
- M3-T04 `server/src/ws.ts` — WebSocket server, heartbeat, reconnect tokens, spectator support
- M3-T05 integration tests — scripted 2-client game over real WS
- Deploy target later; v1 runs on LAN/localhost.

### M4 — Client (React)
- M4-T01 `client/src/net/ws.ts` — WS client, auto-reconnect, action queue
- M4-T02 `client/src/store.ts` — zustand store fed by server state
- M4-T03 `ui/CardView.tsx` — card render (type-costed placeholder frame, name, cost, text)
- M4-T04 `ui/Hand.tsx`, `ui/Zones.tsx` — hand, deck/discard counts, play area
- M4-T05 `ui/Board.tsx` — table: market line, location row, infected row, other players
- M4-T06 `ui/PlayerPanel.tsx` — character, life, ammo/XP, deck stats
- M4-T07 `ui/ActionBar.tsx` — contextual legal actions (server-provided), confirm dialogues
- M4-T08 `ui/Lobby.tsx` — home: create/join room, seat pick, add bots, start
- M4-T09 `ui/GameLog.tsx` — event log + turn indicator
- M4-T10 pass-and-play mode — hot-seat flow: seat-swap screen, hidden-hand reveal (client-only, engine in browser)
- M4-T11 polish — turn animations, sound hooks, responsive layout

### M5 — Hardening & release
- Rules verification checklist vs official FAQ (docs/rules/), full-game bot soak, reconnect
  torture test, README + run scripts, `npm run build` production bundle.

## Validation gates (every task)
1. `npx tsc --noEmit` clean in the touched workspace.
2. New + existing vitest tests green.
3. Coder output must match the task's file list exactly (harness enforces).
4. Two failed attempts → Hermes re-splits the task or writes it directly (logged).

## Checkpoints with Manny
End of each milestone: short report + a playable demo where possible
(M1: watch bots play via CLI replay; M3+: play in the browser).
