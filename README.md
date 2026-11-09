# Quin · v0.3.0

Quin es mi asistente de escritorio para Windows con avatar VRM y conversación local en español.

## Perfil y actuación de voz

- Separé el perfil editable del historial para que Quin pueda usar contexto sin depender de una conversación antigua.
- Ajusté la interpretación de Pícara y Seria, las pausas y las reacciones. Los emojis quedan fuera del audio.

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
