"""Tests for server.py: progress.md format and the HTTP API (run: python3 -m unittest)."""
import json
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402

SAMPLE = {
    "state": {
        "pullup": {"weight": 25, "reps": 3},
        "latpulldown": {"weight": 12.45, "reps": 18, "sets": 2},
        "squat": {"weight": 107.5},
    },
    "history": [
        {"date": "2026-10-24T15:03:06.790Z", "exercise": "Pull-up",
         "result": "3 reps top @ +23.75 kg, 2×5 backoff @ +18.75 kg",
         "outcome": "normal", "weight": 23.75, "volume": 187.5},
        {"date": "2026-10-24T15:04:00.000Z", "exercise": "OHP",
         "result": "odd | text \\ with escapes", "outcome": "hold", "weight": None, "volume": None},
    ],
}


class FormatTests(unittest.TestCase):
    def test_round_trip(self):
        self.assertEqual(server.parse(server.serialize(SAMPLE)), SAMPLE)

    def test_empty(self):
        empty = {"state": {}, "history": []}
        self.assertEqual(server.parse(server.serialize(empty)), empty)

    def test_hand_edit_without_closing_pipe(self):
        text = server.serialize(SAMPLE).replace("| squat | 107.5 |  |  |", "| squat | 110")
        self.assertEqual(server.parse(text)["state"]["squat"], {"weight": 110})

    def test_bad_key_rejected(self):
        text = server.serialize(SAMPLE).replace("| squat |", "| Squat! |")
        with self.assertRaises(ValueError):
            server.parse(text)

    def test_non_finite_cell_rejected(self):
        text = server.serialize(SAMPLE).replace("| squat | 107.5 |", "| squat | nan |")
        with self.assertRaises(ValueError):
            server.parse(text)

    def test_validate(self):
        server.validate(SAMPLE)
        bad = [
            [],
            {"state": {}, "history": {}},
            {"state": {"pull up": {}}, "history": []},
            {"state": {"pullup": {"weight": "25"}}, "history": []},
            {"state": {"pullup": {"bogus": 1}}, "history": []},
            {"state": {}, "history": [{**SAMPLE["history"][0], "outcome": "maybe"}]},
            {"state": {}, "history": [{**SAMPLE["history"][0], "exercise": ""}]},
            {"state": {}, "history": [{**SAMPLE["history"][0], "volume": True}]},
            {"state": {"pullup": {"weight": float("nan")}}, "history": []},
            {"state": {}, "history": [{**SAMPLE["history"][0], "weight": float("inf")}]},
        ]
        for data in bad:
            with self.subTest(data=data), self.assertRaises(ValueError):
                server.validate(data)


class ApiTests(unittest.TestCase):
    """Runs the server on the test port range (5210-5219) against a temp git repo."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self._saved = (server.ROOT, server.PROGRESS)
        server.ROOT, server.PROGRESS = root, root / "progress.md"
        server.PROGRESS.write_text(server.serialize(SAMPLE))
        run = lambda *a: subprocess.run(["git", *a], cwd=root, check=True, capture_output=True)
        run("init", "-q", "-b", "main")
        run("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init")
        run("config", "user.name", "t")
        run("config", "user.email", "t@t")
        self.httpd = None
        for port in range(5210, 5220):
            try:
                self.httpd = ThreadingHTTPServer(("127.0.0.1", port), server.Handler)
                break
            except OSError:
                continue
        self.base = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        server.ROOT, server.PROGRESS = self._saved
        self.tmp.cleanup()

    def req(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method,
                                   headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def git_log(self):
        return subprocess.run(["git", "log", "--format=%s"], cwd=server.ROOT,
                              capture_output=True, text=True).stdout.split("\n")

    def test_get_then_put_commits(self):
        code, body = self.req("GET", "/api/progress")
        self.assertEqual(code, 200)
        self.assertEqual(body["state"], SAMPLE["state"])
        new = {"state": {**SAMPLE["state"], "squat": {"weight": 110}}, "history": SAMPLE["history"]}
        code, out = self.req("PUT", "/api/progress", {**new, "rev": body["rev"], "message": "Log Squat"})
        self.assertEqual((code, out["note"]), (200, "committed"))
        self.assertEqual(server.parse(server.PROGRESS.read_text()), new)
        self.assertEqual(self.git_log()[0], "Log Squat")
        # the returned rev is valid for the next save
        code, _ = self.req("PUT", "/api/progress", {**SAMPLE, "rev": out["rev"], "message": "Undo"})
        self.assertEqual(code, 200)

    def test_stale_rev_conflicts(self):
        code, body = self.req("PUT", "/api/progress", {**SAMPLE, "rev": "stale"})
        self.assertEqual(code, 409)

    def test_invalid_body_rejected(self):
        _, body = self.req("GET", "/api/progress")
        code, _ = self.req("PUT", "/api/progress", {"state": [], "history": [], "rev": body["rev"]})
        self.assertEqual(code, 400)

    def test_same_origin_put_allowed(self):
        _, body = self.req("GET", "/api/progress")
        code, _ = self.req("PUT", "/api/progress", {**SAMPLE, "rev": body["rev"]},
                           headers={"Origin": self.base})
        self.assertEqual(code, 200)

    def test_page_and_ping(self):
        with urllib.request.urlopen(self.base + "/") as r:
            self.assertIn(b"Q2 2026", r.read())
        with urllib.request.urlopen(self.base + "/api/ping") as r:
            self.assertEqual(r.read().decode(), server.SIGNATURE)

    def test_cross_origin_rejected(self):
        _, body = self.req("GET", "/api/progress")
        code, _ = self.req("PUT", "/api/progress", {**SAMPLE, "rev": body["rev"]},
                           headers={"Origin": "http://evil.example"})
        self.assertEqual(code, 403)

    def test_foreign_host_rejected(self):
        r = urllib.request.Request(self.base + "/api/progress", headers={"Host": "attacker.example"})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(r)
        self.assertEqual(cm.exception.code, 403)

    def test_not_committed_off_main(self):
        subprocess.run(["git", "switch", "-q", "-c", "feat/x"], cwd=server.ROOT, check=True)
        _, body = self.req("GET", "/api/progress")
        code, out = self.req("PUT", "/api/progress", {**SAMPLE, "rev": body["rev"]})
        self.assertEqual(code, 200)
        self.assertIn("not committed", out["note"])


if __name__ == "__main__":
    unittest.main()
