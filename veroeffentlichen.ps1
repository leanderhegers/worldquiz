# Ausliefern und sichern in einem Schritt (gleiches Muster wie beim Kundendienst-Portal).
#
# Deploy zuerst: Scheitert er, wird nichts eingecheckt, und die Git-Historie behauptet nie
# etwas, das nie live war. GitHub deployt NICHT -- dort liegt nur der Code als Sicherung.
#
#   .\veroeffentlichen.ps1 "Kurze Beschreibung der Aenderung"
#   .\veroeffentlichen.ps1 "..." -Nur firestore:rules
#   .\veroeffentlichen.ps1 "..." -OhneSicherung     (nur ausliefern)
#   .\veroeffentlichen.ps1 "test" -Vorschau         (Test-URL, Live-Seite bleibt unberuehrt)

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Beschreibung,
    [string]$Nur = "hosting",
    [switch]$OhneSicherung,
    [switch]$Vorschau
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Schritt($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }

Schritt "Syntax pruefen"
$fehler = @()
Get-ChildItem *.js -ErrorAction SilentlyContinue | ForEach-Object {
    node --check $_.FullName 2>&1 | Out-Null
    if (-not $?) { $fehler += $_.Name }
}
if ($fehler.Count -gt 0) {
    Write-Host "Abbruch -- Syntaxfehler in: $($fehler -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "   in Ordnung"

Schritt "Tests"
npm test --silent 2>&1 | Select-Object -Last 6
if ($LASTEXITCODE -ne 0) {
    Write-Host "Abbruch -- Tests fehlgeschlagen." -ForegroundColor Red
    exit 1
}

if ($Vorschau) {
    Schritt "Vorschau-Kanal 'test' (7 Tage gueltig)"
    firebase hosting:channel:deploy test --expires 7d
    exit $LASTEXITCODE
}

Schritt "Ausliefern an Firebase ($Nur)"
firebase deploy --only $Nur
if ($LASTEXITCODE -ne 0) {
    Write-Host "Abbruch -- Deploy fehlgeschlagen. Es wurde nichts eingecheckt." -ForegroundColor Red
    exit 1
}

if ($OhneSicherung) {
    Write-Host "`nFertig (ohne Sicherung)." -ForegroundColor Green
    exit 0
}

# Git schreibt harmlose Hinweise (z. B. Zeilenenden-Warnung) nach stderr; PowerShell 5.1 wuerde das
# bei ErrorActionPreference=Stop als Fehler werten und das Sichern abbrechen. Echte Fehler erkennt
# das Skript weiter an $LASTEXITCODE.
$ErrorActionPreference = "Continue"
Schritt "Sichern in Git"
$version = (Select-String -Path app.js -Pattern "BUILD_ID='(.+)'").Matches.Groups[1].Value
git -c core.safecrlf=false add -A 2>$null
if ((git status --porcelain).Length -eq 0) {
    Write-Host "   nichts zu sichern -- Stand unveraendert"
} else {
    git commit -q -m "$Beschreibung" -m "Ausgeliefert als Build $version am $(Get-Date -Format 'dd.MM.yyyy HH:mm')."
    Write-Host "   eingecheckt"
}

Schritt "Hochladen zu GitHub"
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "Hochladen fehlgeschlagen. Live ist der neue Stand trotzdem. Spaeter: git push" -ForegroundColor Yellow
    exit 1
}
Write-Host "`nFertig. Build $version ist live und gesichert." -ForegroundColor Green
