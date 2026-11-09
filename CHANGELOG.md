# Cambios en Quin

Historial reconstruido a partir de las copias de cada etapa. Las versiones siguen el orden en el que incorporé las funciones.

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
