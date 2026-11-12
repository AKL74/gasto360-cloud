param(
  [string]$RutaHub = 'C:\App_CAMACHO\CAMACHO_APP_HUB',
  [string]$RutaGasto360 = ''
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Estado($mensaje) { Write-Host $mensaje -ForegroundColor Cyan }
function Fallo($mensaje) { Write-Host ('[NO INSTALADO] ' + $mensaje) -ForegroundColor Yellow; exit 3 }

$origen = Join-Path $PSScriptRoot 'WEB'
$archivos = @(
  'index.html','app.js','styles.css','scanner.js','sw.js','manifest.webmanifest',
  'scanner-r86-core.js','ocr-r87.js','desglose-r814.js','rescate-r815.js',
  'interpretacion-r816.js','esenciales-r817.js','revision-r818.js'
)
Estado 'GASTO360 R8.18 - ACTUALIZACION SEGURA DEL MODULO WEB DEL HUB'
Estado ('HUB: ' + $RutaHub)
if (-not (Test-Path -LiteralPath $RutaHub -PathType Container)) {
  Fallo 'No se ha encontrado la carpeta HUB. No se ha modificado nada.'
}
$app = if ($RutaGasto360) { $RutaGasto360 } else { Join-Path $RutaHub 'apps\Gasto360' }
if (-not (Test-Path -LiteralPath $app -PathType Container)) {
  Fallo 'No se encuentra apps\Gasto360. No se ha modificado nada.'
}
if (-not (Test-Path -LiteralPath $origen -PathType Container)) {
  Fallo 'No aparece WEB junto al instalador. Descarga y descomprime el ZIP completo.'
}
foreach ($nombre in $archivos) {
  if (-not (Test-Path -LiteralPath (Join-Path $origen $nombre) -PathType Leaf)) {
    Fallo ('Falta un archivo de la version: ' + $nombre)
  }
}
$checks = Join-Path $PSScriptRoot 'SHA256_WEB.txt'
if (Test-Path -LiteralPath $checks) {
  foreach ($linea in @(Get-Content -LiteralPath $checks)) {
    if ($linea -notmatch '^([a-fA-F0-9]{64})\s{2}WEB/(.+)$') { continue }
    $expected = $Matches[1].ToUpperInvariant()
    $name = $Matches[2].Replace('/','\')
    $file = Join-Path $origen $name
    if (-not (Test-Path -LiteralPath $file)) { Fallo ('Archivo de verificacion ausente: '+$name) }
    $actual=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $expected) { Fallo ('No coincide SHA256: '+$name) }
  }
  Estado '[OK] Integridad SHA256 de recursos comprobada.'
}
# No editar nunca apps.json, ejecutables, el backend, las bases de datos o Supabase.
# Instalar solo si se identifica de manera inequivoca el frontend Cloud existente.
$carpetas = @($app)
foreach ($sub in @('web','www','wwwroot','static','frontend','frontend\static','public','dist','app','gasto360-cloud')) {
  $carpetas += Join-Path $app $sub
}
$encontrados = @()
foreach ($carpeta in ($carpetas | Select-Object -Unique)) {
  $h = Join-Path $carpeta 'index.html'
  $j = Join-Path $carpeta 'app.js'
  $s = Join-Path $carpeta 'scanner.js'
  if (-not ((Test-Path -LiteralPath $h) -and (Test-Path -LiteralPath $j) -and (Test-Path -LiteralPath $s))) { continue }
  $html=Get-Content -LiteralPath $h -Raw -Encoding UTF8
  $codigo=Get-Content -LiteralPath $j -Raw -Encoding UTF8
  if ($html.Contains('id="scannerView"') -and $codigo.Contains('saveScannedExpense') -and $codigo.Contains('gasto360Cloud')) {
    $encontrados += $carpeta
  }
}
if ($encontrados.Count -ne 1) {
  # No sustituir a ciegas una instalacion FastAPI u otra frontend distinta.
  $staging = Join-Path $app 'actualizaciones\R8.18_PENDIENTE_COMPATIBILIDAD'
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  $dest = Join-Path $staging 'WEB'
  if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Path $dest -Force | Out-Null }
  foreach ($name in $archivos) { Copy-Item -LiteralPath (Join-Path $origen $name) -Destination (Join-Path $dest $name) -Force }
  $aviso = 'No se ha identificado con seguridad el frontend Cloud en Gasto360 local. R8.18 queda preparada, SIN activar; el backend existente y puerto 8877 siguen intactos.'
  Set-Content -LiteralPath (Join-Path $staging 'ESTADO_INSTALACION.txt') -Value $aviso -Encoding UTF8
  Fallo ($aviso + ' Carpeta: '+$staging)
}
$destino=$encontrados[0]
Estado ('[OK] Modulo compatible encontrado: '+$destino)
$marca=Get-Date -Format 'yyyyMMdd_HHmmss'
$backup=Join-Path $RutaHub ('backups\Gasto360\ANTES_R818_'+$marca)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$copiados=@()
try {
  foreach ($name in $archivos) {
    $dst=Join-Path $destino $name
    $existed=Test-Path -LiteralPath $dst -PathType Leaf
    if ($existed) { Copy-Item -LiteralPath $dst -Destination (Join-Path $backup $name) -Force }
    $copiados+=@{Name=$name;Existed=$existed}
  }
  $registro=@{
    Version='R8.18';Timestamp=(Get-Date).ToString('o')
    Hub=$RutaHub;App=$app;Destination=$destino;Backup=$backup;Files=$copiados
    AppCatalogChanged=$false;DataBasesChanged=$false;BackendChanged=$false
  }
  $registro|ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $backup 'INSTALACION.json') -Encoding UTF8
  foreach ($name in $archivos) { Copy-Item -LiteralPath (Join-Path $origen $name) -Destination (Join-Path $destino $name) -Force }
  foreach ($name in $archivos) {
    $digest=(Get-FileHash -LiteralPath (Join-Path $destino $name) -Algorithm SHA256).Hash
    $original=(Get-FileHash -LiteralPath (Join-Path $origen $name) -Algorithm SHA256).Hash
    if ($digest -ne $original) { throw ('Verificacion fallida: '+$name) }
  }
  Estado '[OK] Instalacion y comparacion SHA256 completadas.'
  Estado ('[OK] Copia de seguridad: '+$backup)
  Estado '[OK] No se han modificado config.js, apps.json, el backend ni las bases de datos.'
  Estado '[OK] Gasto360 mantiene su entrada de HUB y el puerto 8877.'
  Start-Process 'http://127.0.0.1:8877/'
} catch {
  Write-Host ('[ERROR] '+$_.Exception.Message) -ForegroundColor Red
  foreach ($f in $copiados) {
    $dst=Join-Path $destino $f.Name
    if ($f.Existed) { Copy-Item -LiteralPath (Join-Path $backup $f.Name) -Destination $dst -Force }
    elseif (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }
  }
  Write-Host '[OK] Archivos recuperados desde copia de seguridad.' -ForegroundColor Yellow
  exit 1
}
exit 0
