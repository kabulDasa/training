#!/usr/bin/env python3
"""Local server for Q2-2026.html: keeps progress in progress.md and commits every change to git.

Run: python3 server.py [--port N] [--no-open]
"""
import argparse
import hashlib
import http.client
import json
import math
import os
import re
import subprocess
import sys
import threading
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROGRESS = ROOT / "progress.md"
PAGE = ROOT / "Q2-2026.html"
DEFAULT_PORT = 5200
PORT_TRIES = 10
SIGNATURE = "training-progress"

MAX_BODY = 5_000_000
MAX_MESSAGE = 200
STATE_FIELDS = ("weight", "reps", "sets")
HISTORY_FIELDS = ("date", "exercise", "result", "outcome", "weight", "volume")
OUTCOMES = {"hold", "normal", "double"}
KEY_RE = re.compile(r"[a-z][a-z0-9]*")

HEADER = """# Q2 2026 progress

Written by `server.py` whenever a session is logged in `Q2-2026.html`; each change is a git commit.
Hand edits are fine while the page is closed (keep the table layout).
"""


# ---------- markdown format ----------

def _num(text):
    text = text.strip()
    if not text:
        return None
    n = float(text)
    if not math.isfinite(n):
        raise ValueError(f"not a finite number: {text!r}")
    return int(n) if n.is_integer() else n


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _fmt(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v)


def _cell(text):
    return str(text).replace("\\", "\\\\").replace("|", "\\|").replace("\n", " ")


def _split_row(line):
    """Split a markdown table row into cells, honouring \\| and \\\\ escapes."""
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    cells, cur, i = [], "", 0
    while i < len(body):
        c = body[i]
        if c == "\\" and i + 1 < len(body):
            cur += body[i + 1]
            i += 2
            continue
        if c == "|":
            cells.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    if cur.strip():  # text after the last pipe (row written without a closing |)
        cells.append(cur.strip())
    return cells


def _tables(text):
    """Return {section heading: [row cells...]} for each '## ' section's table (header rows skipped)."""
    out, section, seen_header = {}, None, False
    for line in text.splitlines():
        if line.startswith("## "):
            section, seen_header = line[3:].strip(), False
            out[section] = []
            continue
        if section is None or not line.strip().startswith("|"):
            continue
        if not seen_header:
            seen_header = True
            continue
        if re.fullmatch(r"\|?[\s:|-]+\|?", line.strip()):
            continue
        out[section].append(_split_row(line))
    return out


def parse(text):
    tables = _tables(text)
    state = {}
    for row in tables.get("Current working sets", []):
        key = row[0]
        if not KEY_RE.fullmatch(key):
            raise ValueError(f"bad exercise key: {key!r}")
        entry = {}
        for name, cell in zip(STATE_FIELDS, row[1:]):
            v = _num(cell)
            if v is not None:
                entry[name] = v
        state[key] = entry
    history = []
    for row in tables.get("Session log", []):
        row = (row + [""] * len(HISTORY_FIELDS))[: len(HISTORY_FIELDS)]
        date, exercise, result, outcome, weight, volume = row
        history.append({
            "date": date, "exercise": exercise, "result": result, "outcome": outcome,
            "weight": _num(weight), "volume": _num(volume),
        })
    return {"state": state, "history": history}


def serialize(data):
    lines = [HEADER, "## Current working sets", "",
             "| Key | Weight (kg) | Reps | Sets |", "|---|---|---|---|"]
    for key, entry in data["state"].items():
        lines.append("| " + " | ".join([key] + [_fmt(entry.get(f)) for f in STATE_FIELDS]) + " |")
    lines += ["", "## Session log", "",
              "| Date | Exercise | Result | Outcome | Weight (kg) | Volume (kg × reps) |",
              "|---|---|---|---|---|---|"]
    for h in data["history"]:
        cells = [_cell(h["date"]), _cell(h["exercise"]), _cell(h["result"]), h["outcome"],
                 _fmt(h.get("weight")), _fmt(h.get("volume"))]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines) + "\n"


def validate(data):
    """Raise ValueError unless data looks like {state: {key: {...}}, history: [...]}."""
    if not isinstance(data, dict) or not isinstance(data.get("state"), dict) \
            or not isinstance(data.get("history"), list):
        raise ValueError("expected {state: {...}, history: [...]}")
    for key, entry in data["state"].items():
        if not KEY_RE.fullmatch(key) or not isinstance(entry, dict):
            raise ValueError(f"bad state entry: {key!r}")
        for f, v in entry.items():
            if f not in STATE_FIELDS or not _is_num(v):
                raise ValueError(f"bad field {key}.{f}")
    for h in data["history"]:
        if not isinstance(h, dict) or h.get("outcome") not in OUTCOMES:
            raise ValueError("bad history entry")
        for f in ("date", "exercise", "result"):
            if not isinstance(h.get(f), str) or not h[f]:
                raise ValueError(f"history entry missing {f}")
        for f in ("weight", "volume"):
            v = h.get(f)
            if v is not None and not _is_num(v):
                raise ValueError(f"bad history {f}")


def rev_of(text):
    return hashlib.sha1(text.encode()).hexdigest()


# ---------- git ----------

def git(*args):
    # never block on a credential prompt: the server runs unattended
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                          stdin=subprocess.DEVNULL, env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})


def commit(message):
    """Commit progress.md on main and push in the background. Returns a short status note."""
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch.returncode != 0:
        return "not committed (not a git repo)"
    if branch.stdout.strip() != "main":
        return f"not committed (on branch {branch.stdout.strip()})"
    git("add", "progress.md")
    res = git("commit", "-q", "-m", message, "--", "progress.md")
    if res.returncode != 0:
        if "nothing" in (res.stdout + res.stderr):
            return "no change"
        print("git commit failed:", res.stderr.strip(), file=sys.stderr)
        return "commit failed (see server output)"
    if git("rev-parse", "--abbrev-ref", "@{u}").returncode == 0:
        threading.Thread(target=_push, daemon=True).start()
        return "committed, pushing"
    return "committed"


_push_lock = threading.Lock()


def _push():
    with _push_lock:
        res = git("push", "-q")
        if res.returncode != 0:
            print("git push failed:", res.stderr.strip(), file=sys.stderr)


# ---------- HTTP ----------

_write_lock = threading.Lock()


def read_progress():
    if PROGRESS.exists():
        return PROGRESS.read_text(encoding="utf-8")
    return serialize({"state": {}, "history": []})


def write_progress(text):
    """Write via a temp file so a crash never leaves a half-written progress.md."""
    tmp = PROGRESS.with_name(PROGRESS.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, PROGRESS)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj))

    def _host_ok(self):
        """Only answer to our own address: blocks DNS-rebinding pages posing as localhost."""
        port = self.server.server_address[1]
        if self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}"):
            return True
        self._send(403, "forbidden", "text/plain")
        return False

    def do_GET(self):
        if not self._host_ok():
            return
        path = self.path.split("?", 1)[0]
        if path in ("/", "/Q2-2026.html"):
            self._send(200, PAGE.read_bytes(), "text/html")
        elif path == "/api/ping":
            self._send(200, SIGNATURE, "text/plain")
        elif path == "/api/progress":
            text = read_progress()
            try:
                data = parse(text)
            except ValueError as e:
                self._json(500, {"error": f"progress.md: {e}"})
                return
            self._json(200, {**data, "rev": rev_of(text)})
        else:
            self._send(404, "not found", "text/plain")

    def do_PUT(self):
        if not self._host_ok():
            return
        if self.path != "/api/progress":
            self._send(404, "not found", "text/plain")
            return
        # Only the page itself may write: blocks cross-site form posts from other origins.
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self._json(403, {"error": "cross-origin write refused"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= MAX_BODY:
                raise ValueError("bad Content-Length")
            body = json.loads(self.rfile.read(length))
            data = {"state": body["state"], "history": body["history"]}
            validate(data)
            message = str(body.get("message") or "Update progress")[:MAX_MESSAGE]
            base = body.get("rev")
        except (ValueError, KeyError, TypeError) as e:
            self._json(400, {"error": str(e)})
            return
        with _write_lock:
            current = read_progress()
            if base != rev_of(current):
                self._json(409, {"error": "progress.md changed since the page loaded; reload"})
                return
            text = serialize(data)
            write_progress(text)
            note = commit(message)
        self._json(200, {"rev": rev_of(text), "note": note})


def already_running(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1) as r:
            return r.read().decode() == SIGNATURE
    except (OSError, http.client.HTTPException):
        return False


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--no-open", action="store_true", help="don't open the browser")
    args = ap.parse_args()

    server = None
    for port in range(args.port, args.port + PORT_TRIES):
        if already_running(port):
            print(f"already running at http://127.0.0.1:{port}/")
            if not args.no_open:
                webbrowser.open(f"http://127.0.0.1:{port}/")
            return
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        sys.exit(f"no free port in {args.port}-{args.port + PORT_TRIES - 1}")
    url = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"training: {url}  (progress in {PROGRESS})")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
