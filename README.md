# Quin · v0.4.0

Quin es mi asistente de escritorio para Windows con avatar VRM y conversación local en español.

## Animaciones de reposo y apoyo de pies

- Mezclé animaciones VRMA de reposo con gestos procedurales de respiración, estiramiento y movimiento del cabello.
- Ajusté el apoyo de los pies y la postura de los brazos para que la cadera pueda moverse sin arrastrar todo el cuerpo.

## Instalación

Uso Windows de 64 bits, Node.js 22.12 o superior y Python 3.12 x64 con el lanzador `py`. Para usar NVIDIA, instala el controlador de tu tarjeta. Cierra Quin mientras preparas otra copia porque ambas usan el mismo puerto local.

Desde la carpeta del proyecto, abre PowerShell y ejecuta lo siguiente.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Preparar.ps1
.\Iniciar.cmd
```

La preparación descarga los motores y los modelos. Después, el chat y el audio se procesan en el PC.

La opción `-VozRapida` añade VoxGen para usar la voz Pícara.

Esta versión pertenece al [historial reconstruido](CHANGELOG.md).

[Créditos](CREDITOS.md)
