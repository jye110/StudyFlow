"""Summarize completed local test outputs without inventing acceptance results."""

import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / "docs" / "evidence"
target.mkdir(parents=True, exist_ok=True)
coverage = json.loads((ROOT / "tmp/coverage.json").read_text())
summary = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "totals": coverage["totals"],
    "modules": {
        key.replace("\\", "/"): value["summary"] for key, value in coverage["files"].items()
    },
}
(target / "coverage-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
browser = json.loads((ROOT / "tmp/browser-results.json").read_text())
cases = []
for suite in browser["suites"]:
    for spec in suite["specs"]:
        for test in spec["tests"]:
            cases.append(
                {
                    "case": spec["title"],
                    "browser": test["projectName"],
                    "outcomes": [
                        {"status": result["status"], "duration_ms": result["duration"]}
                        for result in test["results"]
                    ],
                }
            )
(target / "browser-summary.json").write_text(
    json.dumps({"stats": browser["stats"], "cases": cases}, indent=2), encoding="utf-8"
)
shutil.copyfile(ROOT / "tmp/backend.xml", target / "backend.xml")
shutil.copyfile(ROOT / "tmp/accessibility.json", target / "accessibility.json")
manifest = {}
for directory in ["studyflow", "frontend/src", "frontend/e2e", "tests", "migrations"]:
    for file in sorted((ROOT / directory).rglob("*")):
        if file.is_file() and "__pycache__" not in file.parts:
            manifest[file.relative_to(ROOT).as_posix()] = hashlib.sha256(
                file.read_bytes()
            ).hexdigest()
(target / "source-sha256.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Saved summaries for {len(cases)} browser cases and {len(manifest)} source files.")
