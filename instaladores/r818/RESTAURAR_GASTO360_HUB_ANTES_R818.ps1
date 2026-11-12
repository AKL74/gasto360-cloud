param([string]$RutaHub='C:\App_CAMACHO\CAMACHO_APP_HUB')
$ErrorActionPreference='Stop'
Write-Host 'Gasto360 R8.18 - RESTAURAR VERSION ANTERIOR' -ForegroundColor Yellow
$base=Join-Path $RutaHub 'backups\Gasto360'
if (-not (Test-Path -LiteralPath $base)) { throw 'No hay carpeta de copias de seguridad de Gasto360.' }
$dirs=@(Get-ChildItem -LiteralPath $base -Directory |
  Where-Object { $_.Name -like 'ANTES_R818_*' -and (Test-Path (Join-Path $_.FullName 'INSTALACION.json')) } |
  Sort-Object Name -Descending)
if ($dirs.Count -lt 1) { throw 'No existe copia de seguridad compatible con R8.18.' }
$backup=$dirs[0].FullName
$r=Get-Content -LiteralPath (Join-Path $backup 'INSTALACION.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$destino=$r.Destination
$app=Join-Path $RutaHub 'apps\Gasto360'
if (-not $destino.StartsWith($app,[System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La ruta del respaldo no pertenece a Gasto360 del HUB: restauracion cancelada.'
}
if (-not (Test-Path -LiteralPath $destino)) { throw 'La carpeta de destino ya no existe.' }
foreach ($f in $r.Files) {
  $dest=Join-Path $destino $f.Name
  if ($f.Existed) {
    Copy-Item -LiteralPath (Join-Path $backup $f.Name) -Destination $dest -Force
  } elseif (Test-Path -LiteralPath $dest -PathType Leaf) {
    Remove-Item -LiteralPath $dest -Force
  }
}
Write-Host ('[OK] Version anterior restaurada desde '+$backup) -ForegroundColor Green
Write-Host '[OK] Bases de datos, config.js, backend y apps.json permanecen intactos.' -ForegroundColor Green
