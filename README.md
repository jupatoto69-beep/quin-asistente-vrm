# Quin · v0.1.0

Mi primera prueba de Quin fue poner un avatar VRM en el escritorio y hablar con ella en español.

## La primera ventana de Quin

- Monté una ventana transparente y siempre visible. Se puede cambiar el VRM, mover la ventana y dejar pasar los clics al escritorio.
- Conecté el chat a Qwen3 8B y probé el primer ciclo por voz con Whisper y Piper.

## Instalación

Uso Windows de 64 bits, Node.js 22.12 o superior y Python 3.12 x64 con el lanzador `py`. Para usar NVIDIA, instala el controlador de tu tarjeta. Cierra Quin mientras preparas otra copia porque ambas usan el mismo puerto local.

Desde la carpeta del proyecto, abre PowerShell y ejecuta lo siguiente.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Preparar.ps1
.\Iniciar.cmd
```

La preparación descarga los motores y los modelos. Después, el chat y el audio se procesan en el PC.

Esta versión pertenece al [historial reconstruido](CHANGELOG.md).

[Créditos](CREDITOS.md)
