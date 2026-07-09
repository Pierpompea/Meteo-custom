$ErrorActionPreference = "Stop"

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = Get-Command node -ErrorAction SilentlyContinue

if ($node) {
  try {
    & $node.Source server.js
    exit
  } catch {
    if (-not (Test-Path $bundledNode)) {
      throw
    }
  }
}

if (Test-Path $bundledNode) {
  & $bundledNode server.js
} else {
  Write-Host "Node non trovato. Puoi comunque aprire index.html direttamente nel browser."
}
