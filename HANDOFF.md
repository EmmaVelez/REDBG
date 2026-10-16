# HANDOFF — resume here

**Current state (2026-10-16 ~01:05):** M1 ✅ 16/16, M2 ✅ 5/5 + bot-logic v2 (ability/action/ammo/thinning rethink + endTurn/discard-reshuffle engine fixes), **M3 in flight — T01 done, T02 next**. Coder model: `gemma4:e4b` on Ollama (localhost:11434), FULL store at `F:\ollama\models` (C: was 100% full — see below).

## OLLAMA MODELS PATH (do not skip)
Models live at `F:\ollama\models` (moved off C: when it hit 233G/233G). Start serve with:
`export OLLAMA_MODELS="F:\ollama\models" && ollama serve`
Symptom of wrong path: `curl :11434/api/tags` shows nothing. `curl :11434/api/ps` shows loaded models. A wedged `ollama serve` hangs coder calls forever — kill all ollama.exe/"ollama app.exe" via taskkill and restart clean.
Model inventory: gemma4:e4b (active coder), qwen2.5-coder:14b, qwen3.8:27b, qwen3.5:4b.

## Milestone status
- **M1 COMPLETE 16/16** (255/255 at close): types/rng/deck/resources/turn/market/mansion/explore/characters/cards/validate/actions/game/replay/data/rules-faq.
- **M2 COMPLETE 5/5** (307/307 at close) + **bot-logic v2** (commit `cea4754`, 323/323):
  - Character-aware action ranking: granular WeaponTag + weaponTagBonus/ammunitionBonus/exploreGoldBonus/actionBonus/trashEffectBonus abilities; Ada + Rebecca encoded from `generic`.
  - Action cards valued by text (held at half, owned at full), ammo by yield, deck-bloat thinning (trash value up, junk penalized past deck 18), explores reweighted 40→10 (transient).
  - **ENGINE BUG FIXED**: endTurn and +Cards draws passed `reshuffledDiscard: []` — rulebook "draw 5 (reshuffle discard if needed)" never implemented → games stalled permanently after ~3 turns (empty deck+hand, endTurn spam). `drawWithReshuffle` in engine/deck.ts, threaded through all draw sites with rngState. Soak now: 500+ turns, 850+ action-plays/game, full market buys. Explores remain low (~12-21/game) — known 1-ply depth limit, documented at M2-T05.
- **M3 IN FLIGHT**: `server/` workspace scaffolded (was missing — M0 only built game-core; package.json/tsconfig/vitest.config.ts, deps ws+tsx+@types/ws). **M3-T01 DONE** (`server/src/protocol.ts` + protocol.test.ts, 36 tests): full ClientMessage/ServerMessage discriminated-union WS schema (create/join/reconnect/leave/seat/bots/start/action/chat/ping ↔ welcome/roomState/gameStarted/stateSync/actionRejected/player events/chat/gameOver/error/pong) + encode/decode/validate.
- **M3-T02 NEXT**: `server/src/rooms.ts` — in-memory room store, 6-char invite codes, seats, bot slots, host controls (per PLAN.md).
- Then T03 host.ts (authoritative engine + per-seat sanitized views), T04 ws.ts (heartbeat, reconnect tokens, spectators), T05 integration tests.

## Harness facts baked into tools/
- orchestrate.py gate: coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER. coder.py: DEFAULT_MODEL = "gemma4:e4b", timeout 1800s, num_predict 16384, num_ctx 32768.
- Enrich stale feedback with the corrected algorithm spelled out in code (`.coder-cache/feedback-M3-TXX.txt`) — proven pattern.
- Small models drop `===END===` sometimes -> coder.py splits on `===FILE:` only (fine).
- Never `git add -A` while probe_*.ts files exist in the repo (they have before — `git reset -q HEAD^` + `git rm --cached` + re-commit).

## Resume checklist
1. Server healthy? `curl :11434/api/ps`; if empty list: `export OLLAMA_MODELS="F:\ollama\models" && ollama serve`.
2. `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `git status --short` — expect clean tree at M3-T01.
3. Write M3-T02 spec (`server/src/rooms.ts` + rooms.test.ts) per PLAN.md; LAUNCH via `python tools/orchestrate.py docs/tasks/M3-T02.json`.
4. Verify the gate personally (tsc + vitest in the server workspace) before reporting green.