#!/usr/bin/env python3
"""Orchestrator: run a coder task through the full validate-and-retry loop.

  python tools/orchestrate.py docs/tasks/M1-T03.json [--max-attempts 3]

For each attempt:
  1. tools/coder.py writes the expected files (attempt N passes prior errors as feedback)
  2. validate: `npx tsc --noEmit` + `npx vitest run` in game-core/
  3. green -> commit, append LEDGER, exit 0
     red  -> capture errors, feed back, retry (up to --max-attempts)
  4. exhausted -> append LEDGER with status=failed, exit 1 (Hermes intervenes)
"""
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CODER = REPO / "tools" / "coder.py"
LEDGER = REPO / "LEDGER.jsonl"
WORKSPACE = REPO / "game-core"


def run(cmd: str, cwd: Path) -> tuple[int, str]:
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, shell=True)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def ledger(task_id: str, status: str, attempts: int, note: str) -> None:
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S"), "task": task_id,
           "status": status, "attempts": attempts, "note": note}
    with LEDGER.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")


def validate(task: dict) -> tuple[bool, str]:
    """Return (green, combined_error_text). Runs the task's validate commands
    (each {cwd, cmd}, cwd relative to REPO), defaulting to tsc+vitest in
    game-core when the spec omits a validate list."""
    errs: list[str] = []
    checks = task.get("validate") or [
        {"cwd": "game-core", "cmd": "npx tsc --noEmit"},
        {"cwd": "game-core", "cmd": "npx vitest run"},
    ]
    for check in checks:
        cwd = (REPO / str(check["cwd"])).resolve()
        rc, out = run(str(check["cmd"]), cwd)
        if rc != 0:
            errs.append(f"=== {check['cmd']} (in {check['cwd']}) FAILED ===\n" + out.strip())
    return (len(errs) == 0), "\n\n".join(errs)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    task_path = Path(sys.argv[1])
    if not task_path.is_absolute():
        task_path = REPO / task_path
    task = json.loads(task_path.read_text(encoding="utf-8"))
    task_id = task["id"]
    max_attempts = 3
    if "--max-attempts" in sys.argv:
        max_attempts = int(sys.argv[sys.argv.index("--max-attempts") + 1])

    feedback_file = REPO / ".coder-cache" / f"feedback-{task_id}.txt"
    feedback_file.parent.mkdir(exist_ok=True)

    for attempt in range(1, max_attempts + 1):
        print(f"\n########## {task_id} attempt {attempt}/{max_attempts} ##########")
        cmd = ["python", str(CODER), "run", str(task_path)]
        if feedback_file.exists() and "--fresh" not in sys.argv:
            cmd += ["--feedback", str(feedback_file)]
        rc, out = run(" ".join(f'"{c}"' if " " in c else c for c in cmd), REPO)
        print(out)
        if rc != 0:
            # coder-level failure (missing files, generation timeout, crash):
            # feed the error back and retry — NEVER fall through to validate on
            # a stale tree (a timeout produces no MISSING marker, which used to
            # cause false-green commits on unchanged files).
            feedback_file.write_text(out[-6000:], encoding="utf-8")
            continue

        green, errs = validate(task)
        if green:
            print(f"\n>>> {task_id} GREEN on attempt {attempt}. Committing.")
            run(f'git add -A && git -c user.email=dev@local -c user.name=Orchestrator '
                f'commit -qm "{task_id}: green (attempt {attempt})"', REPO)
            ledger(task_id, "ok", attempt, "auto-validated tsc+vitest")
            return 0
        print(f"\n>>> {task_id} attempt {attempt} FAILED validation:\n{errs[:2500]}")
        feedback_file.write_text(errs[:6000], encoding="utf-8")

    print(f"\n>>> {task_id} EXHAUSTED {max_attempts} attempts. Hermes must intervene.")
    ledger(task_id, "failed", max_attempts, "exhausted retries; see feedback file")
    return 1


if __name__ == "__main__":
    sys.exit(main())
