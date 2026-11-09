const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');

const host = '127.0.0.1';
const wavHeaderBytes = 44;

function localPort() {
  return new Promise((resolve, reject) => {
    const reservation = createServer();
    reservation.once('error', reject);
    reservation.listen(0, host, () => {
      const { port } = reservation.address();
      reservation.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function validHeader(header) {
  return header.toString('ascii', 0, 4) === 'RIFF' &&
    header.toString('ascii', 8, 16) === 'WAVEfmt ' &&
    header.readUInt32LE(16) === 16 && header.readUInt16LE(20) === 3 &&
    header.readUInt16LE(22) === 1 && header.readUInt32LE(24) === 48000 &&
    header.readUInt16LE(34) === 32 && header.toString('ascii', 36, 40) === 'data';
}

function createVoxStream(executable, base, acoustic, reference, shutdown, alternate = reference) {
  let child;
  let starting;
  let address;
  let idle;
  let generation = 0;

  function stop() {
    generation++;
    clearTimeout(idle);
    child?.kill();
    child = undefined;
    address = undefined;
  }

  function expireAfterIdle() {
    clearTimeout(idle);
    idle = setTimeout(stop, 15 * 60_000);
    idle.unref();
  }

  function request(url, path, body, timeout) {
    const options = body ? {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {};
    return fetch(url + path, {
      ...options, redirect: 'error', signal: AbortSignal.any([shutdown, AbortSignal.timeout(timeout)]),
    });
  }

  async function start() {
    const current = generation;
    const port = await localPort();
    shutdown.throwIfAborted();
    if (current !== generation) throw new Error('Se canceló la preparación de la voz.');
    const url = `http://${host}:${port}`;
    const process = spawn(executable, [
      '--server', '--host', host, '--port', String(port), '--stream', 'on',
      '--base-lm', base, '--acoustic', acoustic, '--max-context', '1024',
    ], { windowsHide: true, stdio: 'ignore' });
    child = process;
    const disconnected = () => {
      if (child === process) stop();
    };
    process.once('error', disconnected);
    process.once('exit', disconnected);
    try {
      for (let attempt = 0; attempt < 120 && child === process; attempt++) {
        const response = await request(url, '/health', null, 800).catch(() => undefined);
        if (response?.ok && child === process) {
          await response.json();
          const warm = await request(url, '/v1/audio/conditioning/warm', { reference_audio_path: reference }, 8_000);
          if (!warm.ok || !(await warm.json()).ok) throw new Error('No se pudo preparar la referencia de Pícara.');
          if (alternate !== reference) {
            await request(url, '/v1/audio/conditioning/warm', { reference_audio_path: alternate }, 8_000)
              .then((response) => response.json()).catch(() => {});
          }
          if (child !== process) break;
          address = url;
          expireAfterIdle();
          return url;
        }
        await delay(200, undefined, { signal: shutdown });
      }
      throw new Error('VoxGen no inició a tiempo.');
    } catch (error) {
      if (child === process) stop();
      throw error;
    }
  }

  async function warm() {
    if (address) return address;
    starting ??= start().finally(() => { starting = undefined; });
    return starting;
  }

  async function speak(text, control, onChunk, sample = reference) {
    const url = await warm();
    clearTimeout(idle);
    try {
      const response = await request(url, '/v1/audio/speech/stream', {
        input: text, control, reference_audio_path: sample,
        seed: 306, gain: 0.6, inference_timesteps: 6, max_steps: 200,
      }, 75_000);
      if (!response.ok || !response.body) throw new Error('VoxGen no pudo iniciar el audio.');
      let buffered = Buffer.alloc(0);
      let readingAudio = false;
      let sent = false;
      for await (const chunk of response.body) {
        buffered = Buffer.concat([buffered, chunk]);
        if (!readingAudio) {
          if (buffered.length < wavHeaderBytes) continue;
          if (!validHeader(buffered)) throw new Error('Formato de audio inesperado.');
          buffered = buffered.subarray(wavHeaderBytes);
          readingAudio = true;
        }
        const aligned = buffered.length - buffered.length % 4;
        if (aligned) {
          onChunk(Uint8Array.from(buffered.subarray(0, aligned)));
          buffered = buffered.subarray(aligned);
          sent = true;
        }
      }
      if (!sent || buffered.length) throw new Error('VoxGen devolvió audio incompleto.');
    } finally {
      if (child) expireAfterIdle();
    }
  }

  return { warm, speak, stop };
}

module.exports = { createVoxStream };
