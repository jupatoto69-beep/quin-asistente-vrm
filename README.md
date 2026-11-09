# Quin

Quería tener un personaje anime en mi escritorio y hablarle en español. Empecé con un avatar VRM en una ventana transparente, y de ahí salió Quin. Corre en Windows y puedo conversar con ella sin una API de pago.

## Qué puedo hacer con ella

- Escribirle o usar el micrófono. Con **Activación por voz** puedo decir «Oye, Quin» y seguir la charla sin repetir el nombre. Si se me quedó algo por decir, puedo pulsar **Interrumpir**.
- Cargar mi propio VRM, girarlo con el ratón y acercarlo con la rueda. Puedo pedir «Levanta el pie izquierdo» y seguir con «Ahora el otro».
- Guardar conversaciones, chistes e historias pendientes. **Memoria** permite buscar o borrar turnos. **Perfil** sirve para decidir qué datos quiero darle.
- Elegir **Tranquila** o **Conversadora** en Compañía, o empezar una partida desde **Juegos**.
- Usar **Mira esto** para compartir un recorte de una ventana o pantalla. Quin puede comentarlo o señalar algo en la vista previa.

### Dos cosas para probar

- Dile «Juguemos a un misterio». Puedes pedir una pista o intentar resolverlo. En las historias por turnos, empieza tu aporte con «Mi turno» y di «Cierra la historia» al terminar.
- Pulsa **Mira esto**, elige una ventana, captura una vista y arrastra sobre lo que quieres mostrarle. Confirma y pulsa **Analizar recorte**. Si la escena cambia, captura otra vista.

## Instalación

Uso Windows de 64 bits, Node.js 22.12 o superior y Python 3.12 x64 con el lanzador `py`. Para usar NVIDIA, instala el controlador de tu tarjeta. Cierra Quin mientras preparas otra copia porque ambas usan el mismo puerto local.

Desde la carpeta del proyecto, abre PowerShell y ejecuta lo siguiente.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Preparar.ps1
.\Iniciar.cmd
```

La preparación descarga los motores y los modelos. Después, el chat y el audio se procesan en el PC.
Si quieres la voz Pícara con VoxGen, añade `-VozRapida` al comando de preparación. Sin esa opción se instalan Kokoro y Piper como alternativas.

Para habilitar **Mira esto**, descarga por separado el modelo de visión y vuelve a abrir Quin.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Preparar-Vision.ps1
```

Probé el proyecto con una RTX 4070 Ti SUPER de 16 GB y 32 GB de RAM. El modelo de visión ocupa unos 3,3 GB. Reserva espacio adicional para los modelos de chat, voz y dictado. [Modelo de visión](https://ollama.com/library/qwen3-vl:4b-instruct)

## Cómo está armado

- **Ventana y avatar.** Electron, Three.js y three-vrm. El render mueve el esqueleto y las expresiones del VRM cargado.
- **Diálogo.** Qwen3 4B Instruct en Ollama. El texto se muestra por bloques y el historial se guarda en SQLite.
- **Voz.** Whisper.cpp convierte el audio a texto. Para hablar, Quin usa VoxGen y VoxCPM2 cuando están instalados, con Kokoro y Piper como opciones locales.
- **Visión.** Qwen3-VL 4B Instruct recibe solo el recorte confirmado. Las marcas son aproximadas.

Ollama escucha en `127.0.0.1:11485` con las funciones de nube desactivadas. El perfil, la memoria y el avatar elegido se guardan en `.local/profile`. El selector de pantalla toma una captura puntual, detiene la transmisión y libera la imagen al cerrar. Las respuestas de visión no pasan al historial persistente.

## Versiones

Organicé el avance en doce versiones. Reconstruí los commits con copias del proyecto que quedaron durante las pruebas. Las fechas de Git corresponden a esa reconstrucción. El [registro de cambios](CHANGELOG.md) cuenta qué había en cada etapa.

[Créditos y licencias de los recursos](CREDITOS.md)
