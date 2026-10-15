# HANDOFF — resume here

**Current state (2026-10-15 evening):** M1 game-core engine — **11 of 15 tasks green, 165/165 tests, tsc clean**. Coder model: `qwen2.5-coder:14b` on Ollama (localhost:11434).

## OH REAL PROBLEM — OLLAMA MODELS PATH (do not skip)
An env var `OLLAMA_MODELS=F:\ollama` in this shell is WRONG/stale and points at an EMPTY
directory. The real models (28 GB: qwen2.5-coder:14b, qwen3.8:27b, qwen3.5:4b) live in the
DEFAULT location `C:\Users\Manny\.ollama\models`. Symptom: `ollama list` shows nothing while
~/.ollama/models has all three manifests. When starting a server for the coder, run
`unset OLLAMA_MODELS && ollama serve`. Check what's loaded via `curl /api/ps`. A wedged
`ollama serve` can hang coder calls forever — kill all ollama.exe + "ollama app.exe" via
`taskkill /F /IM ...` and restart clean.

## Milestone status
- M1-T01..T11 GREEN (types/rng/deck/resources/turn/market/mansion/explore/characters/cards/validate).
- **M1-T12 IN FLIGHT** (`engine/actions.ts` apply layer/reducer — the biggest task). Relaunched
  repeatedly because of the Ollama wedge above, NOT model failure. It may be mid-generation or
  may have since resolved: check `.coder-cache/M1-T12-*.txt` for raw output, `git log` for a
  green commit, `LEDGER.jsonl` tail. Last known: orchestrator PID alive on attempt 1.
  IMPORTANT: T12's spec is at `docs/tasks/M1-T12.json` (~21KB, 22 test cases). If it exhausted,
  enrich `.coder-cache/feedback-M1-T12.txt` (proven pattern) or Hermes-fix like T07-T11.
- Remaining after T12: T13 game.ts (setup/turn-loop/win), T14 replay, T15 data, T16 rules-faq.
  See PLAN.md (renumbered after the T11/T12 split).

## Harness facts baked into tools/
- orchestrate.py gate: coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER.
- FIXED today: a coder failure now ALWAYS feeds back + retries (previously only `MISSING` output
  did; a timeout fell through to validate on the STALE tree -> false-green commit). coder.py
  ollama timeout raised 900s -> 1800s.
- Small models sometimes drop `===END===` -> coder.py splits on `===FILE:` only (fine).
- Enrich stale feedback with the corrected algorithm spelled out in code — proven pattern for
  T03..T11 (every task needed 1-3 Hermes patches after 14b's 3 attempts).

## Resume checklist
1. Server healthy? `curl :11434/api/ps`; if empty list, `unset OLLAMA_MODELS && ollama serve`.
2. Check T12 outcome: `git log --oneline -1`, `tail -1 LEDGER.jsonl`, `ls .coder-cache/M1-T12*`.
3. If T12 green -> write T13 spec (`engine/game.ts`: setup, turn start, win conditions) per PLAN.md.
4. If T12 failed -> enrich feedback / Hermes-fix, re-run `python tools/orchestrate.py docs/tasks/M1-T12.json`.
