# HANDOFF — resume here

**Paused (3rd):** night of 2026-10-14 — resuming in the morning. Manny is reinstalling
`qwen3.5:4b` (the original model) because he judged it performed better.
NOTE FROM HERMES: for M1-T03, qwen2.5-coder:14b reproduced the SAME two failure classes as
4b (draw() reshuffle semantics + type sloppiness), so M1-T03 difficulty is spec-side, not
model-side. The feedback file `.coder-cache/feedback-M1-T03.txt` has been ENRICHED by Hermes
with the exact corrected draw() algorithm + type fixes — with it, either model should pass.
Don't read M1-T03 failures as evidence against 4b.

## Resume checklist
1. Verify model is back: `curl -s http://localhost:11434/api/tags` — expect `qwen3.5:4b`.
   Speed-test it (tiny completion). Reference: 4b ≈ 17-21s for a full M1-T03 file pair;
   14b took 428s for the same task; 27b ≈ 8.7 tok/s. 4b is by far the fastest.
2. Repoint harness to qwen3.5:4b (currently set to qwen2.5-coder:14b):
   - `tools/coder.py`: DEFAULT_MODEL = "qwen3.5:4b"
   - every `docs/tasks/*.json`: "model": "qwen3.5:4b" (python json load/dump one-liner).
3. Resume M1-T03 WITH the existing enriched feedback — do NOT pass --fresh (orchestrate.py
   feeds `.coder-cache/feedback-M1-T03.txt` on attempt 1 automatically):
   `python tools/orchestrate.py docs/tasks/M1-T03.json`   (BACKGROUND job — always)
   deck.ts/deck.test.ts on disk are the failed 14b attempt-1 output; coder overwrites wholesale.
4. After T03 green: validate suite (`cd game-core && npx tsc --noEmit && npx vitest run`),
   then run M1-T04 (spec already written in docs/tasks/; its model field gets fixed in step 2).
5. Continue M1-T05+ per PLAN.md. Keep chunking tight for 4b: one small file + test per task,
   exact signatures, spell out the algorithm when non-trivial (proven necessary for draw()).

## State at pause (git: last commit aeb3886 "PAUSE 2")
- UNCOMMITTED: coder.py + 3 task JSONs switched to 14b (switch back in step 2), untracked
  game-core/src/engine/deck.ts + deck.test.ts (failed 14b output — regenerated next run),
  enriched feedback file, this HANDOFF.
- rng.ts hand-fix VALIDATED (tsc clean, 7/7 pass).
- LEDGER last entry = stale 4b-era M1-T03 failure; ignore.

## Harness facts learned (baked into tools/)
- Small models drop `===END===` markers -> coder.py splits on `===FILE:` markers only.
- NEVER commit on coder.py success alone (it only checks the file set). orchestrate.py runs
  the full gate: coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER.
- orchestrate.py reuses a stale feedback file on attempt 1 unless `--fresh` — this resume
  plan deliberately exploits that (step 3).
- Killed orchestrator runs are safe; partial .coder-cache/*.txt harmless.
- Raw tsc/vitest errors alone often aren't enough for small models: enrich feedback with the
  corrected algorithm spelled out in code (worked pattern — see feedback-M1-T03.txt).
