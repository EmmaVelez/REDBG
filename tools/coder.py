#!/usr/bin/env python3
"""Coder harness: sends one small task spec to the local Ollama model,
extracts the files it writes, and saves them into the repo.

Usage:
  python tools/coder.py run docs/tasks/M1-T03.json
  python tools/coder.py run docs/tasks/M1-T03.json --feedback errors.txt
  python tools/coder.py run docs/tasks/M1-T03.json --dry-run

Task JSON schema:
{
  "id": "M1-T03",
  "title": "deck pile operations",
  "instructions": "exact spec, signatures, edge cases...",
  "context_files": ["game-core/src/types.ts"],   // included verbatim
  "expected_files": ["game-core/src/engine/deck.ts", "game-core/src/engine/deck.test.ts"],
  "model": "qwen3.5:4b",        // optional override
  "num_ctx": 32768              // optional override
}
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OLLAMA = "http://localhost:11434/api/chat"
DEFAULT_MODEL = "qwen2.5-coder:14b"
CACHE = REPO / ".coder-cache"

SYSTEM_PROMPT = """You are a meticulous TypeScript coder working on one small, fully-specified task.
Rules:
- Implement EXACTLY what the spec says. No extra features, no placeholders, no TODOs.
- Every file you output must be COMPLETE and compile with the given context files.
- Output ONLY file blocks in this exact format, nothing else (no prose, no explanations):

===FILE: relative/path/to/file.ts===
<complete file contents>
===END===

- Output every file listed in EXPECTED FILES, with exactly those paths.
- Prefer simple, explicit code over clever code."""


def build_user_prompt(task: dict, feedback: str | None) -> str:
    parts = [f"# TASK {task['id']}: {task['title']}", "", "## SPEC", task["instructions"], ""]
    ctx = task.get("context_files", [])
    if ctx:
        parts.append("## CONTEXT FILES (already exist — conform to them, do NOT re-emit them)")
        for rel in ctx:
            p = REPO / rel
            if not p.exists():
                raise SystemExit(f"ERROR: context file missing: {rel}")
            parts.append(f"### {rel}\n```ts\n{p.read_text(encoding='utf-8')}\n```")
        parts.append("")
    parts.append("## EXPECTED FILES (emit exactly these paths)")
    for f in task["expected_files"]:
        parts.append(f"- {f}")
    if feedback:
        parts += ["", "## PREVIOUS ATTEMPT FAILED VALIDATION",
                  "Fix ALL of the following and re-emit the COMPLETE corrected files:",
                  feedback.strip()]
    return "\n".join(parts)


def call_ollama(model: str, system: str, user: str, num_ctx: int) -> dict:
    body = json.dumps({
        "model": model,
        "stream": False,
        "keep_alive": "15m",
        "options": {"temperature": 0.1, "num_ctx": num_ctx, "num_predict": 8192},
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(OLLAMA, data=body,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=900) as r:
        resp = json.loads(r.read().decode())
    resp["_wall_s"] = round(time.time() - t0, 1)
    return resp


FILE_RE = re.compile(r"===FILE:\s*(.+?)\s*===")


def strip_fences(content: str) -> str:
    """If the model wrapped a whole file in ```ts fences, remove them."""
    c = content.strip()
    m = re.fullmatch(r"```[a-zA-Z]*\r?\n(.*)\r?\n```", c, re.S)
    return m.group(1) if m else content.rstrip()


def extract_files(text: str) -> dict[str, str]:
    """Split model output at every ===FILE: marker; tolerate missing ===END===."""
    files: dict[str, str] = {}
    marks = list(FILE_RE.finditer(text))
    for i, m in enumerate(marks):
        path = m.group(1).strip().replace("\\", "/")
        path = re.sub(r"^/+", "", path)
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        content = text[m.end():end]
        content = re.sub(r"\r?\n?===END===\s*$", "", content)
        files[path] = strip_fences(content) + "\n"
    return files


def main() -> int:
    if len(sys.argv) < 3 or sys.argv[1] != "run":
        print(__doc__)
        return 2
    task_path = Path(sys.argv[2])
    if not task_path.is_absolute():
        task_path = REPO / task_path
    task = json.loads(task_path.read_text(encoding="utf-8"))
    feedback = None
    dry = "--dry-run" in sys.argv
    if "--feedback" in sys.argv:
        fb_path = Path(sys.argv[sys.argv.index("--feedback") + 1])
        if not fb_path.is_absolute():
            fb_path = REPO / fb_path
        feedback = fb_path.read_text(encoding="utf-8")

    model = task.get("model", DEFAULT_MODEL)
    num_ctx = task.get("num_ctx", 32768)
    user = build_user_prompt(task, feedback)

    if dry:
        print("=== SYSTEM ===\n" + SYSTEM_PROMPT + "\n=== USER ===\n" + user)
        return 0

    resp = call_ollama(model, SYSTEM_PROMPT, user, num_ctx)
    content = resp.get("message", {}).get("content", "")
    CACHE.mkdir(exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    raw = CACHE / f"{task['id']}-{stamp}.txt"
    raw.write_text(content, encoding="utf-8")

    files = extract_files(content)
    expected = {f.replace("\\", "/") for f in task["expected_files"]}
    got = set(files)
    problems = []
    if got != expected:
        missing = sorted(expected - got)
        extra = sorted(got - expected)
        if missing:
            problems.append(f"MISSING files: {missing}")
        if extra:
            problems.append(f"UNEXPECTED files: {extra}")

    for rel, text in files.items():
        if rel in expected:
            dest = REPO / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text, encoding="utf-8")
            print(f"WROTE {rel} ({len(text.splitlines())} lines)")

    print(f"--- model={model} wall={resp.get('_wall_s')}s "
          f"eval_tokens={resp.get('eval_count')} raw_log={raw.name}")
    if problems:
        print("VALIDATION-HARNESS FAILED:")
        for p in problems:
            print("  " + p)
        return 1
    print("OK: all expected files written. Run project validation next.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
