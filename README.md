# Quin

Quería tener un personaje anime en mi escritorio y hablarle en español. Empecé con un avatar VRM en una ventana transparente, y de ahí salió Quin. Corre en Windows y puedo conversar con ella sin una API de pago.

## Qué puedo hacer con ella

- Escribirle o usar el micrófono. Con **Activación por voz** puedo decir «Hola, Quin», «Buenas, Quin», «Oye, Quin» o «Hey, Quin» y seguir la charla sin repetir el nombre. Si se me quedó algo por decir, puedo pulsar **Interrumpir**.
- Cargar mi propio VRM, girarlo con el ratón y acercarlo con la rueda. Puedo pedir «Levanta el pie izquierdo» y seguir con «Ahora el otro». El avatar también reacciona al tono y cambia de postura durante la espera.
- Abrir **Memoria** para ver las conversaciones, las fichas personales, los momentos, los chistes y las historias pendientes. Quin puede aprender datos de la charla. Puedo editar las fichas, quitar recuerdos o activar **Charla temporal**.
- Decir «Anota que quiero probar ese juego», «Mañana a las diez recuérdame regar las plantas» o «¿Qué tengo pendiente?». La lista se conserva al cerrar la app y los recordatorios vencidos aparecen al volver a abrirla.
- Poner temporizadores, abrir Calculadora, controlar el volumen y pausar la reproducción. En **Archivos** elijo dónde puede buscar para pedidos como «Búscame la captura de ayer».
- Elegir **Tranquila**, **Conversadora** o **En partida**. «Acompáñame mientras juego» activa el último modo. «Dame un rato» pausa las ocurrencias.
- Usar **Mira esto** para confirmar un recorte, o decir «Mira mi pantalla» para analizar una captura del monitor donde está Quin. Puedo pedir «Guíame paso a paso» y recorrer las marcas de la vista previa.
- Activar **Web** para preguntas que necesitan datos recientes. Quin anuncia la búsqueda y muestra los enlaces con la respuesta.

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
- **Visión.** Qwen3-VL 4B Instruct analiza el recorte confirmado o la captura pedida por voz. Las marcas son aproximadas.

Ollama escucha en `127.0.0.1:11485` con las funciones de nube desactivadas. El perfil, la memoria y el avatar elegido se guardan en `.local/profile`. Las capturas se mantienen en memoria hasta cerrar la vista y las respuestas de visión quedan fuera del historial persistente. **Web** envía consultas de búsqueda a Internet cuando está activada. La charla temporal pausa esa opción.

## Versiones

Reconstruí las primeras doce versiones con copias que quedaron durante las pruebas. La v0.13.0 reúne los cambios que hice después de incorporar «Mira esto». El [registro de cambios](CHANGELOG.md) cuenta qué añadí en cada etapa.

[Créditos y licencias de los recursos](CREDITOS.md)
