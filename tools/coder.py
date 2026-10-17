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
DEFAULT_MODEL = "gemma4:e4b"
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
- Prefer simple, explicit code over clever code.

CRITICAL — this project's tsconfig uses `strict` + `noUncheckedIndexedAccess`. Recurring
mistakes you MUST avoid:
1. `arr[i]` has type `T | undefined`. Assign to a local const, check `=== undefined`, then use it.
2. Empty array literals need explicit types: `const xs: string[] = [];` — never leave them
   implicit (TS7034/TS7005 errors).
3. `{ ...obj }` spread copies only the TOP level. If obj contains arrays and the tests check
   reference identity, copy them explicitly: `aliveSeats: [...ctx.aliveSeats]`.
4. Error messages must match the spec EXACTLY, including any interpolated values
   (e.g. 'duplicate seat: ' + seat — the seat number must be appended when specified).
5. Record lookups (`rec[key]`) are also `T | undefined` — check before use.
6. In test files, import types you annotate with: `import type { Foo } from './module';`
7. Never mutate function inputs — always construct new arrays/objects."""


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


def call_ollama(model: str, system: str, user: str, num_ctx: int,
                num_gpu: int | None = None) -> dict:
    options: dict = {"temperature": 0.1, "num_ctx": num_ctx, "num_predict": 16384}
    # num_gpu pins how many layers offload to the GPU; 0 forces CPU-only.
    # Only sent when the task spec sets it (a large model that cannot fit in
    # VRAM OOMs on Ollama's default auto-offload and needs num_gpu: 0).
    if num_gpu is not None:
        options["num_gpu"] = num_gpu
    body = json.dumps({
        "model": model,
        "stream": False,
        "keep_alive": "15m",
        "options": options,
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request(OLLAMA, data=body,
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=1800) as r:
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
    num_gpu = task.get("num_gpu")  # optional: 0 = CPU-only (large models vs VRAM)
    user = build_user_prompt(task, feedback)

    if dry:
        print("=== SYSTEM ===\n" + SYSTEM_PROMPT + "\n=== USER ===\n" + user)
        return 0

    resp = call_ollama(model, SYSTEM_PROMPT, user, num_ctx, num_gpu)
    # Ollama can return HTTP 200 with an in-body error (e.g. std::bad_alloc on
    # oversized num_ctx) and empty content — fail loudly instead of writing
    # zero-byte artifacts.
    if resp.get("error"):
        print(f"OLLAMA ERROR: {resp['error'][:500]}")
        return 1
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
