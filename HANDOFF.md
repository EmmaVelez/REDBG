# HANDOFF — resume here

**Paused (2nd time):** 2026-10-14 late — Manny is installing a FASTER local Ollama model.
Previous pause reason (bigger model) was resolved: `qwen3.8:27b` is now installed and
wired into the harness, but it runs at ~8.7 tok/s (2000-token file ≈ 4 min; 3 attempts
blew past the 420s foreground cap once — background runs are mandatory at this speed).

## Resume checklist
1. Check what's on Ollama now: `curl -s http://localhost:11434/api/tags` — ask Manny which
   model to use. Speed-test it first: tiny chat completion, note wall time + eval tokens/s.
2. If the model changed from qwen3.8:27b: update `DEFAULT_MODEL` in `tools/coder.py` and
   `"model"` in every `docs/tasks/*.json` (there's a one-liner python snippet pattern in git
   history; or sed the JSON files).
3. ALWAYS run `python tools/orchestrate.py <task.json> --fresh` as a BACKGROUND terminal job
   (never foreground) — coder calls routinely exceed the 420s tool cap.
4. Current mid-flight task: **M1-T03** (deck.ts pile ops). Its previous broken deck.ts/deck.test.ts
   were deleted; the orchestrator run was killed mid attempt-1 (27b was still generating).
   Re-run it fresh: `python tools/orchestrate.py docs/tasks/M1-T03.json --fresh`.
   Next queued spec: **M1-T04** (resources.ts) — already written in docs/tasks/.
5. After T03 lands green, validate whole suite: `cd game-core && npx tsc --noEmit && npx vitest run`.
6. With a faster/smarter model, consider relaxing chunking (PLAN.md): bigger files per task,
   fewer micro-specs. Retest assumptions on M1-T03/T04 results first.

## State at pause (all committed through 9ef85c0 EXCEPT below)
- Working tree has UNCOMMITTED changes: coder.py DEFAULT_MODEL=qwen3.8:27b, task JSONs
  updated to 27b/num_ctx 32768, docs/tasks/M1-T04.json (new), deleted deck.ts/deck.test.ts.
  -> First action on resume: review `git status`/`git diff`, then commit as
  "resume-prep: switch harness to <model>, queue M1-T04".
- rng.ts hand-fix is VALIDATED: tsc clean + 7/7 rng tests pass (verified 23:22 before pause).
- LEDGER.jsonl: last entry is the old M1-T03 3-attempt failure (4b era) — stale, ignore.

## Harness facts learned (baked into tools/)
- Small models drop `===END===` markers -> coder.py splits on `===FILE:` markers only.
- Small models omit files / break state-threading in pure-functional signatures -> always
  run the full validate gate; NEVER commit on coder.py success alone (it only checks the file set).
- orchestrate.py = coder -> tsc -> vitest -> feedback-retry (max 3) -> git commit + LEDGER.
  Stale feedback from a previous run is reused on attempt 1 unless `--fresh` is passed.
- Killed orchestrator runs leave partial .coder-cache/*.txt; harmless — coder.py rewrites files
  only on a complete response.
