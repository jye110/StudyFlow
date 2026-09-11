param([int]$Port = 5000, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Assert-Exit { if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
    python -m venv .venv
    Assert-Exit
    & '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
    Assert-Exit
}
if (-not $SkipBuild) {
    Push-Location frontend
    try {
        npm.cmd ci
        Assert-Exit
        npm.cmd run build
        Assert-Exit
    } finally { Pop-Location }
}
& '.\.venv\Scripts\python.exe' -m flask --app wsgi db upgrade
Assert-Exit
Write-Host "StudyFlow is ready at http://127.0.0.1:$Port. Press Ctrl+C to stop."
& '.\.venv\Scripts\waitress-serve.exe' "--listen=127.0.0.1:$Port" --threads=12 wsgi:app
