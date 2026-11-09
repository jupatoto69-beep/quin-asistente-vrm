# Cambios en Quin

Historial reconstruido a partir de las copias de cada etapa. Las versiones siguen el orden en el que incorporé las funciones.

## v0.11.0 · Juegos de sobremesa

- Añadí Dos verdades y una mentira, dilemas absurdos, historias improvisadas por turnos y misterios cortos.
- Quin celebra los aciertos con un gesto. Las partidas quedan separadas de la memoria personal.

## v0.10.0 · Modo compañía

- Añadí los ritmos Tranquila y Conversadora para las animaciones y las ocurrencias espontáneas.
- El modo deja espacio mientras hay una conversación, un borrador o un panel abierto, y se pausa al minimizar.

## v0.9.0 · Interrupciones y conciencia corporal

- Se puede cortar la voz y añadir una corrección conservando la pregunta anterior. El historial marca la respuesta interrumpida.
- Quin puede describir su postura y encuadre, mostrar partes de su cuerpo y recordar qué lado acaba de mover.

## v0.8.0 · Giro, zoom y apariencia por avatar

- Añadí el giro al arrastrar, el zoom con la rueda y el restablecimiento de la vista.
- La descripción se guarda por archivo VRM. Quin puede describir el avatar activo y aprender una descripción nueva.

## v0.7.0 · Activación y conversación seguida

- Con «Oye, Quin» se puede abrir la charla. Si solo oye su nombre, contesta con una frase corta antes de escuchar.
- Quin vuelve a escuchar al terminar su respuesta. Probé el reconocimiento con Whisper Turbo en la GPU y el formato de hora de 12 horas.

## v0.6.0 · Historias pendientes y chistes internos

- Añadí historias que quedan pendientes y chistes que se pueden recuperar más adelante.
- Ajusté el diálogo para que Quin responda primero a lo que le preguntan y haga seguimiento cuando encaje.

## v0.5.0 · Manos y órdenes de movimiento

- Añadí dedos independientes, señalamiento, saludos y pulgar arriba. Quin puede mover los brazos, levantar un pie, agacharse y bailar.
- Pasé las órdenes a movimientos validados contra el VRM cargado. Las secuencias admiten hasta tres pasos.

## v0.4.0 · Animaciones de reposo y apoyo de pies

- Mezclé animaciones VRMA de reposo con gestos procedurales de respiración, estiramiento y movimiento del cabello.
- Ajusté el apoyo de los pies y la postura de los brazos para que la cadera pueda moverse sin arrastrar todo el cuerpo.

## v0.3.0 · Perfil y actuación de voz

- Separé el perfil editable del historial para que Quin pueda usar contexto sin depender de una conversación antigua.
- Ajusté la interpretación de Pícara y Seria, las pausas y las reacciones. Los emojis quedan fuera del audio.

## v0.2.0 · Voz expresiva y memoria local

- Elegí la voz Pícara y probé cómo mantener el timbre entre emociones. Pasé a Qwen3 4B Instruct y a audio por bloques para reducir la espera.
- Guardé las conversaciones en SQLite y añadí una vista para buscar y borrar intercambios.

## v0.1.0 · La primera ventana de Quin

- Monté una ventana transparente y siempre visible. Se puede cambiar el VRM, mover la ventana y dejar pasar los clics al escritorio.
- Conecté el chat a Qwen3 8B y probé el primer ciclo por voz con Whisper y Piper.
