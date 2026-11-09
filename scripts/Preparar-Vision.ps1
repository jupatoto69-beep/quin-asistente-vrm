$ErrorActionPreference = 'Stop'
$Runtime = Join-Path (Split-Path -Parent $PSScriptRoot) '.local'
$Ollama = Join-Path $Runtime 'ollama/ollama.exe'
$Modelo = 'qwen3-vl:4b-instruct'
$Puerto = 11486

if (!(Test-Path -LiteralPath $Ollama -PathType Leaf)) {
    throw 'Prepara primero Quin con scripts\Preparar.ps1.'
}
if (Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue) {
    throw "El puerto local $Puerto está ocupado."
}

$EntornoAnterior = @{}
foreach ($Nombre in 'OLLAMA_HOST', 'OLLAMA_MODELS', 'OLLAMA_NO_CLOUD') {
    $EntornoAnterior[$Nombre] = [Environment]::GetEnvironmentVariable($Nombre, 'Process')
}
$Servicio = $null
try {
    $env:OLLAMA_HOST = "127.0.0.1:$Puerto"
    $env:OLLAMA_MODELS = Join-Path $Runtime 'ollama-models'
    $env:OLLAMA_NO_CLOUD = '1'
    $Servicio = Start-Process -FilePath $Ollama -ArgumentList 'serve' -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $Runtime 'vision-install-out.log') `
        -RedirectStandardError (Join-Path $Runtime 'vision-install-error.log')
    $Listo = $false
    for ($Intento = 0; $Intento -lt 40 -and !$Servicio.HasExited; $Intento++) {
        try {
            $null = Invoke-RestMethod "http://127.0.0.1:$Puerto/api/version" -TimeoutSec 1
            $Listo = $true
            break
        } catch { Start-Sleep -Milliseconds 250 }
    }
    if (!$Listo) { throw 'No se pudo iniciar Ollama para descargar el modelo de visión.' }
    & $Ollama pull $Modelo
    if ($LASTEXITCODE -ne 0) { throw "La descarga de $Modelo falló con código $LASTEXITCODE." }
    Write-Host 'Visión instalada. Si Quin está abierta, vuelve a abrirla.'
} finally {
    if ($Servicio -and !$Servicio.HasExited) { Stop-Process -Id $Servicio.Id }
    foreach ($Nombre in $EntornoAnterior.Keys) {
        [Environment]::SetEnvironmentVariable($Nombre, $EntornoAnterior[$Nombre], 'Process')
    }
}
