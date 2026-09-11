"""Run isolated HTTP performance and process-restart checks with synthetic data.

Default: QA plan TC-16's 60 s warm-up + 300 s measurement, 10 users, 1 s think time.
The local SQLite result is supplemental evidence, not MySQL/class-deployment acceptance.
"""

import argparse
import json
import math
import os
import platform
import socket
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]


class UserClient:
    def __init__(self, url, email, register=True):
        self.url, self.email = url, email
        self.http = requests.Session()
        self.csrf = self.http.get(url + "/api/auth/csrf", timeout=15).json()["csrf_token"]
        payload = {"email": email, "password": "synthetic-system-test-password"}
        if register:
            payload["name"] = "System Test Student"
        response = self.call("POST", "/auth/" + ("register" if register else "login"), payload)
        self.csrf = response.json()["csrf_token"]

    def call(self, method, path, data=None, checked=True):
        response = self.http.request(
            method,
            self.url + "/api" + path,
            json=data,
            headers={"X-CSRF-Token": self.csrf},
            timeout=20,
        )
        if checked:
            response.raise_for_status()
        return response

    def course(self):
        return self.call(
            "POST", "/courses", {"name": "System Test", "code": "SYS", "color": "#2563eb"}
        ).json()

    def assignment(self, course, index, minutes=30):
        due = (datetime.now(timezone.utc) + timedelta(days=35)).isoformat()
        return self.call(
            "POST",
            "/assignments",
            {
                "course_id": course["id"],
                "title": f"Test work {index}",
                "notes": f"Persistence marker {index}",
                "due_at": due,
                "estimated_minutes": minutes,
                "priority": ["High", "Medium", "Low"][index % 3],
                "status": "In Progress" if index % 2 else "Not Started",
            },
        ).json()

    def plan(self, checked=True):
        return self.call(
            "POST",
            "/schedule/generate",
            {"timezone": "UTC", "start_hour": 9, "daily_minutes": 240, "horizon_days": 30},
            checked=checked,
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--warmup", type=int, default=60)
    parser.add_argument("--duration", type=int, default=300)
    parser.add_argument("--output", default="docs/evidence/system-results.json")
    args = parser.parse_args()
    run_dir = ROOT / "tmp" / ("system-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    run_dir.mkdir(parents=True)
    env = os.environ.copy()
    env.update(
        DATABASE_URL="sqlite:///" + str(run_dir / "system.db"),
        APP_ENV="development",
        OPENAI_API_KEY="",
        OPENAI_MODEL="",
    )
    subprocess.run(
        [sys.executable, "-m", "flask", "--app", "wsgi", "db", "upgrade"],
        cwd=ROOT,
        env=env,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    log = (run_dir / "server.log").open("w")

    def start():
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "waitress",
                f"--listen=127.0.0.1:{port}",
                "--threads=12",
                "wsgi:app",
            ],
            cwd=ROOT,
            env=env,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        for _ in range(100):
            try:
                if requests.get(url + "/api/health", timeout=1).status_code == 200:
                    return process
            except requests.RequestException:
                time.sleep(0.1)
        process.terminate()
        raise RuntimeError("Test server did not start")

    process = start()
    result = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "os": platform.platform(),
            "python": platform.python_version(),
            "database": "SQLite",
            "server": "Waitress, 12 threads",
            "transport": "loopback HTTP",
            "cpu_count": os.cpu_count(),
            "ai": "disabled",
        },
        "limitations": ["Local supplemental results; not MySQL or deployed HTTPS evidence."],
    }
    try:
        owner = UserClient(url, "persistence@example.test")
        course = owner.course()
        manifest = [owner.assignment(course, i, i + 1) for i in range(20)]
        owner.call("POST", "/auth/logout", {})
        owner = UserClient(url, "persistence@example.test", register=False)
        assert owner.call("GET", "/assignments").json() == manifest
        process.terminate()
        process.wait(timeout=15)
        process = start()
        owner = UserClient(url, "persistence@example.test", register=False)
        assert owner.call("GET", "/assignments").json() == manifest
        result["TC-19"] = {
            "status": "pass-local",
            "records": 20,
            "compared": "Every serialized field and ownership",
            "process_restarts": 1,
        }
        print("TC-19: 20/20 records retained after logout/login and process restart.", flush=True)

        result["TC-17"] = []
        for size in [1, 50, 200]:
            user = UserClient(url, f"performance-{size}@example.test")
            c = user.course()
            for i in range(size):
                user.assignment(c, i)
            timings = []
            for _ in range(5):
                start_time = time.perf_counter()
                plan = user.plan().json()
                timings.append(time.perf_counter() - start_time)
                total = sum(s["minutes"] for s in plan["sessions"]) + sum(
                    a["minutes"] for a in plan["unallocated"]
                )
                assert total == 30 * size
            result["TC-17"].append(
                {
                    "assignments": size,
                    "seconds": timings,
                    "first": timings[0],
                    "median": statistics.median(timings),
                    "max": max(timings),
                    "status": "pass-local" if max(timings) < 5 else "fail",
                }
            )
        print(
            "TC-17: measured five HTTP generations each for 1, 50 and 200 assignments.", flush=True
        )

        users = []
        for i in range(10):
            user = UserClient(url, f"load-{i}@example.test")
            course = user.course()
            assignment = user.assignment(course, i, 60)
            users.append((user, assignment))

        def exercise(item, duration, collect):
            user, assignment = item
            samples, index = [], 0
            deadline = time.monotonic() + duration
            while time.monotonic() < deadline:
                slot = index % 10
                start_time = time.perf_counter()
                try:
                    if slot < 4:
                        endpoint = "/summary"
                        response = user.call("GET", endpoint, checked=False)
                    elif slot < 7:
                        endpoint = "/courses" if slot == 4 else "/assignments"
                        response = user.call("GET", endpoint, checked=False)
                    elif slot < 9:
                        endpoint = "/assignments/:id"
                        response = user.call(
                            "PATCH",
                            f"/assignments/{assignment['id']}",
                            {"priority": "Medium" if index % 2 else "High"},
                            checked=False,
                        )
                    else:
                        endpoint = "/schedule/generate"
                        response = user.plan(checked=False)
                    status = response.status_code
                except requests.RequestException:
                    status = 0
                elapsed = time.perf_counter() - start_time
                if collect:
                    samples.append({"endpoint": endpoint, "seconds": elapsed, "status": status})
                index += 1
                time.sleep(1)
            return samples

        print(
            f"TC-16: warming up {args.warmup}s, then measuring {args.duration}s with 10 users.",
            flush=True,
        )
        with ThreadPoolExecutor(max_workers=10) as pool:
            list(pool.map(lambda item: exercise(item, args.warmup, False), users))
            groups = list(pool.map(lambda item: exercise(item, args.duration, True), users))
        samples = [sample for group in groups for sample in group]
        timings = sorted(sample["seconds"] for sample in samples)
        errors = sum(not 200 <= sample["status"] < 300 for sample in samples)
        p95 = timings[math.ceil(0.95 * len(timings)) - 1]
        result["TC-16"] = {
            "users": 10,
            "warmup_seconds": args.warmup,
            "measurement_seconds": args.duration,
            "think_seconds": 1,
            "requests": len(samples),
            "p95_seconds_nearest_rank": p95,
            "within_3s_fraction": sum(t <= 3 for t in timings) / len(timings),
            "errors": errors,
            "status": "pass-local" if p95 <= 3 and errors == 0 else "fail",
            "samples": samples,
        }
        print(f"TC-16: {len(samples)} requests, p95 {p95:.3f}s, {errors} errors.", flush=True)
    finally:
        process.terminate()
        process.wait(timeout=15)
        log.close()
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(output, flush=True)


if __name__ == "__main__":
    main()
