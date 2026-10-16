# HANDOFF — resume here

**Current state (2026-10-16 ~07:15):** M1 ✅ 16/16, M2 ✅ 5/5 + bot-logic v2, **M3 ✅ COMPLETE 5/5 (T01 protocol, T02 rooms, T03 host, T04 ws server, T05 integration)**. **Next: M4 (client)**. Coder model: `gemma4:e4b` on Ollama (localhost:11434), FULL store at `F:\ollama\models` (C: was 100% full — see below).

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
- **M4 NEXT**: client (web UI wired to the ws server). PLAN.md is scope authority.

## Harness facts baked into tools/
- orchestrate.py gate: coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER. coder.py: DEFAULT_MODEL = "gemma4:e4b", timeout 1800s, num_predict 16384, num_ctx 32768.
- **The coder model cannot write server modules** (rooms.ts/host.ts/ws.ts all Hermes-written; only the M3-T02 spec file was coder-launched): factory-pattern object literals with `readonly` + defaults break esbuild/TS parsing; tests hit type-error storms. Treat server tasks as Hermes-direct unless the task is data/pure-logic (M4 client work may be the same).
- Enrich stale feedback with the corrected algorithm spelled out in code (`.coder-cache/feedback-MXX-TXX.txt`) — proven pattern.
- Small models drop `===END===` sometimes -> coder.py splits on `===FILE:` only (fine).
- Never `git add -A` while probe_*.ts files exist in the repo (they have before — `git reset -q HEAD^` + `git rm --cached` + re-commit).
- Git identity is repo-local (Orchestrator <dev@local>) — commit failure exit 128 means it was lost; re-set with `git config user.name "Orchestrator"` / `user.email "dev@local"`.

## Test-helper lesson (integration tests)
`nextWithTimeout` racing `next()` leaves a stale waiter that EATS the next real message — any timeout-based ws test helper needs a cancellable waiter that unregisters on cancel (see `nextCancel` in server/src/integration.test.ts). Also: waitFor predicates over queued broadcasts must include the discriminator you actually care about (e.g. `activeSeat === 0 && turnNumber >= 2`, else stale turn-1 views match).

## Resume checklist
1. Server healthy? `curl :11434/api/ps`; if empty list: `export OLLAMA_MODELS="F:\ollama\models" && ollama serve`.
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect clean tree at `b97dcbf` (M3-T05).
3. M4: read PLAN.md M4 section; likely a web client (static HTML/TS or framework) over the ws protocol — decide scope with user or per PLAN.
4. Verify the gate personally (tsc + vitest in the affected workspace) before reporting green.