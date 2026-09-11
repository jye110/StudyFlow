import json
from pathlib import Path

report = json.loads(Path("tmp/coverage.json").read_text())
for module in ("auth.py", "scheduler.py"):
    entry = next(
        value
        for key, value in report["files"].items()
        if key.replace("\\", "/").endswith("/" + module)
    )
    percentage = entry["summary"]["percent_covered"]
    print(f"{module}: {percentage:.2f}%")
    if percentage < 70:
        raise SystemExit(f"{module} does not meet the 70% statement-coverage requirement.")
