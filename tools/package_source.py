"""Create a shareable source archive, excluding local databases and credentials."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
target = ROOT / "deliverables" / "StudyFlow_Source.zip"
target.parent.mkdir(exist_ok=True)
directories = ["studyflow", "frontend", "migrations", "tests", "tools", "docs", "deploy", ".github"]
files = [
    "README.md",
    "requirements.txt",
    "pyproject.toml",
    ".gitignore",
    ".dockerignore",
    ".env.example",
    "Dockerfile",
    "compose.yaml",
    "start.ps1",
    "start.sh",
    "wsgi.py",
]
excluded = {"node_modules", "dist", "__pycache__", "test-results", "playwright-report"}
selected = [ROOT / name for name in files]
for directory in directories:
    selected.extend(
        path
        for path in (ROOT / directory).rglob("*")
        if path.is_file() and not excluded.intersection(path.relative_to(ROOT).parts)
    )
with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=6) as archive:
    for path in sorted(selected):
        archive.write(path, "StudyFlow/" + path.relative_to(ROOT).as_posix())
print(f"{target}: {len(selected)} files, {target.stat().st_size:,} bytes")
