const { spawn, execFile } = require('node:child_process');
const { existsSync } = require('node:fs');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { createConnection } = require('node:net');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const model = 'qwen3:8b';
const port = 11485;
const endpoint = `http://127.0.0.1:${port}`;
const system = 'Eres una asistente de escritorio. Habla siempre en español natural. Responde en uno a tres enunciados breves, aptos para leer en voz alta. Usa texto plano. Puedes conversar, pero no tienes acceso a archivos, aplicaciones ni acciones del equipo.';

function portOccupied() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port, timeout: 1000 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', (error) => resolve(error.code !== 'ECONNREFUSED'));
  });
}

function run(file, args, input, signal) {
  return new Promise((resolve, reject) => {
    const process = execFile(file, args, {
      windowsHide: true, timeout: 45_000, maxBuffer: 1024 * 1024, signal,
    }, (error) => error ? reject(error) : resolve());
    process.stdin.on('error', () => {});
    process.stdin.end(input);
  });
}

async function* jsonLines(stream) {
  let pending = '';
  for await (const chunk of stream.pipeThrough(new TextDecoderStream())) {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop();
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (pending.trim()) yield JSON.parse(pending);
}

function createServices(root) {
  const runtime = join(root, '.local');
  const ollama = join(runtime, 'ollama', 'ollama.exe');
  const ollamaModels = join(runtime, 'ollama-models');
  const manifest = join(ollamaModels, 'manifests', 'registry.ollama.ai', 'library', 'qwen3', '8b');
  const whisper = join(runtime, 'whisper', 'Release', 'whisper-cli.exe');
  const whisperModel = join(runtime, 'models', 'ggml-base.bin');
  const python = join(runtime, 'piper', 'Scripts', 'python.exe');
  const voice = join(runtime, 'models', 'es_MX-ald-medium.onnx');
  const shutdown = new AbortController();
  const history = [];
  let server;
  let starting;

  const ready = {
    chat: existsSync(ollama) && existsSync(manifest),
    transcribe: existsSync(whisper) && existsSync(whisperModel),
    speak: existsSync(python) && existsSync(voice) && existsSync(voice + '.json'),
  };

  async function request(path, options = {}) {
    const { timeout = 1000, ...fetchOptions } = options;
    return fetch(endpoint + path, {
      ...fetchOptions, redirect: 'error',
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeout)]),
    });
  }

  async function launch() {
    if (await portOccupied()) throw new Error('El puerto local 11485 está ocupado. Cierra la otra instancia e inténtalo de nuevo.');
    shutdown.signal.throwIfAborted();
    const child = spawn(ollama, ['serve'], {
      env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}`, OLLAMA_MODELS: ollamaModels, OLLAMA_NO_CLOUD: '1' },
      windowsHide: true, stdio: 'ignore',
    });
    server = child;
    let failed = false;
    child.once('error', () => { failed = true; });
    child.once('exit', () => { if (server === child) server = undefined; });
    try {
      for (let attempt = 0; attempt < 80; attempt++) {
        if (failed || server !== child || child.exitCode !== null) break;
        const responding = await request('/api/version').then((response) => response.ok, () => false);
        if (responding && child.exitCode === null && server === child) return;
        await delay(250, undefined, { signal: shutdown.signal });
      }
      throw new Error('Ollama no pudo iniciar en el puerto local 11485.');
    } catch (error) {
      child.kill();
      if (server === child) server = undefined;
      throw error;
    }
  }

  async function chat(prompt, onChunk) {
    if (!ready.chat) throw new Error('Falta Ollama o Qwen3. Ejecuta scripts\\Preparar.ps1 y reinicia la aplicación.');
    if (!server || starting) {
      starting ??= launch().finally(() => { starting = undefined; });
      await starting;
    }
    const message = { role: 'user', content: prompt };
    const response = await request('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 120_000,
      body: JSON.stringify({
        model, messages: [{ role: 'system', content: system }, ...history, message],
        stream: true, think: false, keep_alive: '5m', options: { num_ctx: 4096, num_predict: 220 },
      }),
    }).catch(() => { throw new Error('Ollama no respondió a tiempo o se cerró. Intenta de nuevo.'); });
    if (!response.ok) throw new Error('Ollama no pudo generar la respuesta. Revisa la instalación de Qwen3.');
    let content = '';
    let complete = false;
    try {
      for await (const item of jsonLines(response.body)) {
        if (item.error) break;
        const part = item.message?.content;
        if (typeof part === 'string' && part.length) {
          content += part;
          onChunk(part);
        }
        if (item.done === true) {
          complete = true;
          break;
        }
      }
    } catch {
      throw new Error('La respuesta de Ollama se interrumpió. Intenta de nuevo.');
    }
    if (!complete) throw new Error('La respuesta de Ollama se interrumpió. Intenta de nuevo.');
    content = content.trim();
    if (!content) throw new Error('El modelo devolvió una respuesta vacía.');
    history.push(message, { role: 'assistant', content });
    if (history.length > 10) history.splice(0, 2);
    return content;
  }

  async function withAudio(action) {
    const directory = await mkdtemp(join(tmpdir(), 'asistente-vrm-'));
    try {
      return await action(directory);
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }

  async function transcribe(wav) {
    if (!ready.transcribe) throw new Error('Falta Whisper. Ejecuta scripts\\Preparar.ps1 y reinicia.');
    return withAudio(async (directory) => {
      const source = join(directory, 'entrada.wav');
      const output = join(directory, 'texto');
      await writeFile(source, wav);
      await run(whisper, ['-m', whisperModel, '-f', source, '-l', 'es', '-t', '6', '-ng', '-nt', '-otxt', '-of', output],
        undefined, shutdown.signal).catch(() => { throw new Error('Whisper no pudo transcribir este audio.'); });
      return (await readFile(output + '.txt', 'utf8')).trim();
    });
  }

  async function speak(content) {
    if (!ready.speak) throw new Error('Falta Piper. Ejecuta scripts\\Preparar.ps1 y reinicia.');
    return withAudio(async (directory) => {
      const output = join(directory, 'salida.wav');
      await run(python, ['-X', 'utf8', '-m', 'piper', '-m', voice, '-f', output], content, shutdown.signal)
        .catch(() => { throw new Error('Piper no pudo sintetizar la respuesta.'); });
      return Uint8Array.from(await readFile(output));
    });
  }

  return { ready, chat, transcribe, speak, stop: () => { shutdown.abort(); server?.kill(); } };
}

module.exports = { createServices };
