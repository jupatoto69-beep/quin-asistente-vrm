# Quin · v0.2.0

Quin es mi asistente de escritorio para Windows con avatar VRM y conversación local en español.

## Voz expresiva y memoria local

- Elegí la voz Pícara y probé cómo mantener el timbre entre emociones. Pasé a Qwen3 4B Instruct y a audio por bloques para reducir la espera.
- Guardé las conversaciones en SQLite y añadí una vista para buscar y borrar intercambios.

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
