# Cambios en Quin

Historial reconstruido a partir de las copias de cada etapa. Las versiones siguen el orden en el que incorporé las funciones.

## v0.2.0 · Voz expresiva y memoria local

- Elegí la voz Pícara y probé cómo mantener el timbre entre emociones. Pasé a Qwen3 4B Instruct y a audio por bloques para reducir la espera.
- Guardé las conversaciones en SQLite y añadí una vista para buscar y borrar intercambios.

## v0.1.0 · La primera ventana de Quin

- Monté una ventana transparente y siempre visible. Se puede cambiar el VRM, mover la ventana y dejar pasar los clics al escritorio.
- Conecté el chat a Qwen3 8B y probé el primer ciclo por voz con Whisper y Piper.
