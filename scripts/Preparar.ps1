param([switch]$VozRapida)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Confirmar-Comando {
    param([string]$Descripcion)
    if ($LASTEXITCODE -ne 0) { throw "$Descripcion falló con código $LASTEXITCODE." }
}

function Test-Archivo {
    param([string]$Ruta, [string]$Sha256)
    (Test-Path -LiteralPath $Ruta -PathType Leaf) -and
        ((Get-FileHash -LiteralPath $Ruta -Algorithm SHA256).Hash -eq $Sha256)
}

function Guardar-Archivo {
    param([string]$Uri, [string]$Ruta, [string]$Sha256)
    if (Test-Archivo $Ruta $Sha256) { return }
    curl.exe -fsSL --retry 2 $Uri -o "$Ruta.part"
    Confirmar-Comando "Descargar $Uri"
    if (!(Test-Archivo "$Ruta.part" $Sha256)) { throw "El SHA-256 no coincide para $Ruta." }
    Move-Item -LiteralPath "$Ruta.part" -Destination $Ruta -Force
}

function Instalar-Zip {
    param([string]$Uri, [string]$Nombre, [string]$Sha256, [string]$Ejecutable)
    $Destino = Join-Path $Runtime $Nombre
    if (Test-Path -LiteralPath (Join-Path $Destino $Ejecutable)) { return }
    $Archivo = Join-Path $Runtime "$Nombre.zip"
    Guardar-Archivo $Uri $Archivo $Sha256
    Expand-Archive -LiteralPath $Archivo -DestinationPath $Destino -Force
    if (!(Test-Path -LiteralPath (Join-Path $Destino $Ejecutable))) {
        throw "No se encontró $Ejecutable tras descomprimir $Nombre."
    }
    Remove-Item -LiteralPath $Archivo
}

$Proyecto = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Proyecto '.local'
$Modelos = Join-Path $Runtime 'models'
Push-Location $Proyecto
try {
    node -e "const [a,b] = process.versions.node.split('.').map(Number); if (a < 22 || (a === 22 && b < 12)) process.exit(1)"
    Confirmar-Comando 'Verificar Node.js 22.12 o posterior'
    py -3.12 -c "import struct; assert struct.calcsize('P') == 8"
    Confirmar-Comando 'Verificar Python 3.12 x64'
    if (Get-NetTCPConnection -LocalPort 11485 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Cierra el asistente o el proceso que esté usando el puerto 11485 antes de preparar.'
    }
    New-Item -ItemType Directory -Force -Path $Runtime, $Modelos | Out-Null
    $env:ELECTRON_CACHE = Join-Path $Runtime 'electron-cache'
    npm.cmd ci --no-fund --cache (Join-Path $Runtime 'npm-cache')
    Confirmar-Comando 'Instalar las dependencias de la ventana'
    npm.cmd exec -- install-electron
    Confirmar-Comando 'Instalar el ejecutable de Electron'
    npm.cmd run build
    Confirmar-Comando 'Compilar la ventana'

    Guardar-Archivo 'https://raw.githubusercontent.com/pixiv/three-vrm/v3.5.5/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm' 'assets/avatar.vrm' '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'
    Instalar-Zip 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.7/whisper-bin-x64.zip' 'whisper' 'd9627486e1c34a03745880485593473e047294260ce9a3cb0aa8deaf15b99af6' 'Release/whisper-cli.exe'
    Guardar-Archivo 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' (Join-Path $Modelos 'ggml-base.bin') '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'
    $Voz = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx'
    Guardar-Archivo $Voz (Join-Path $Modelos 'es_MX-ald-medium.onnx') '019b3803293c93e34a206dd2e53a3889209a514e786fd7144f7b70196c579b63'
    Guardar-Archivo "$Voz.json" (Join-Path $Modelos 'es_MX-ald-medium.onnx.json') '5a71498158e04afc8099bfd019c7e87c68eb9d042505a2b1a87e5c1ac2b1a61d'
    $Python = Join-Path $Runtime 'piper/Scripts/python.exe'
    if (!(Test-Path -LiteralPath $Python)) {
        py -3.12 -m venv (Join-Path $Runtime 'piper')
        Confirmar-Comando 'Preparar Python local'
    }
    Instalar-Zip 'https://github.com/ollama/ollama/releases/download/v0.40.15/ollama-windows-amd64.zip' 'ollama' '9ca74a7ab66ec86870b1eecac7df160df08dc4e3a291ab5d2d59bcf9310221c6' 'ollama.exe'
    $Ollama = Join-Path $Runtime 'ollama/ollama.exe'
    $env:OLLAMA_HOST = '127.0.0.1:11485'
    $env:OLLAMA_MODELS = Join-Path $Runtime 'ollama-models'
    $env:OLLAMA_NO_CLOUD = '1'
    $Manifest = Join-Path $env:OLLAMA_MODELS 'manifests/registry.ollama.ai/library/qwen3/8b'
    if (!(Test-Path -LiteralPath $Manifest)) {
        $Servicio = Start-Process -FilePath $Ollama -ArgumentList 'serve' -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $Runtime 'ollama-out.log') `
            -RedirectStandardError (Join-Path $Runtime 'ollama-error.log')
        try {
            $Listo = $false
            for ($Intento = 0; $Intento -lt 40 -and !$Servicio.HasExited; $Intento++) {
                try {
                    $null = Invoke-RestMethod 'http://127.0.0.1:11485/api/version' -TimeoutSec 1
                    $Listo = $true
                    break
                } catch { Start-Sleep -Milliseconds 250 }
            }
            if (!$Listo) { throw 'Ollama no pudo iniciar. Revisa .local/ollama-error.log.' }
            & $Ollama pull qwen3:8b
            Confirmar-Comando 'Descargar Qwen3'
        } finally {
            if (!$Servicio.HasExited) { Stop-Process -Id $Servicio.Id }
        }
    }
    Write-Host 'Preparación completa. Abre Iniciar.cmd.'
} finally {
    Pop-Location
}
