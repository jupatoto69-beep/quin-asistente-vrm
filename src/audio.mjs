export async function toWhisperWav(context, blob) {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration < 0.35) throw new Error('La grabación es muy corta. Habla un poco más.');
  const samples = await renderWhisperSamples(decoded);
  if (!samples.some((sample) => Math.abs(sample) >= 0.015)) throw new Error('No se detectó voz con suficiente volumen.');
  return encodeWhisperPcm(samples);
}

async function renderWhisperSamples(decoded) {
  const sampleRate = 16000;
  const length = Math.min(sampleRate * 30, Math.floor(decoded.duration * sampleRate));
  const offline = new OfflineAudioContext(1, length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

export async function wakeWav(context, samples) {
  if (context.sampleRate === 16000) return encodeWhisperPcm(samples);
  const decoded = context.createBuffer(1, samples.length, context.sampleRate);
  decoded.copyToChannel(samples, 0);
  return encodeWhisperPcm(await renderWhisperSamples(decoded));
}

function encodeWhisperPcm(samples) {
  const sampleRate = 16000;
  const length = samples.length;
  const wav = new Uint8Array(44 + length * 2);
  const header = new DataView(wav.buffer);
  const ascii = (offset, value) => wav.set(new TextEncoder().encode(value), offset);
  ascii(0, 'RIFF');
  header.setUint32(4, wav.length - 8, true);
  ascii(8, 'WAVEfmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  ascii(36, 'data');
  header.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    header.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return wav;
}

export function record(stream, maxTime) {
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  let timer;
  const result = new Promise((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
    recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType })), { once: true });
    recorder.addEventListener('error', () => reject(new Error('No se pudo grabar el micrófono.')), { once: true });
  }).finally(() => {
    clearTimeout(timer);
  });
  function stop() {
    if (recorder.state === 'recording') recorder.stop();
  }
  recorder.start();
  timer = setTimeout(stop, maxTime);
  return { stop, result };
}

export function createStreamPlayer(context, destination, onStart) {
  const rate = 48000;
  const sources = new Set();
  let pending = [];
  let frames = 0;
  let next;
  let resolveEnded;

  function schedule(samples) {
    const buffer = context.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    sources.add(source);
    source.addEventListener('ended', () => {
      source.disconnect();
      sources.delete(source);
      if (!sources.size) resolveEnded?.();
    }, { once: true });
    source.start(next);
    next += buffer.duration;
  }

  function start() {
    if (!frames) return;
    next = context.currentTime + 0.035;
    onStart();
    for (const samples of pending) schedule(samples);
    pending = [];
    frames = 0;
  }

  function push(bytes) {
    const samples = new Float32Array(bytes.slice().buffer);
    if (next !== undefined && next >= context.currentTime + 0.005) {
      schedule(samples);
    } else {
      next = undefined;
      pending.push(samples);
      frames += samples.length;
      // Buffer a few patches before playback so network and inference jitter do not create gaps.
      if (frames >= rate * 0.55) start();
    }
  }

  function finish() {
    start();
    return new Promise((resolve) => {
      if (!sources.size) resolve();
      else resolveEnded = resolve;
    });
  }

  function dispose() {
    for (const source of sources) {
      source.stop();
      source.disconnect();
    }
    sources.clear();
    pending = [];
    resolveEnded?.();
  }

  return { push, finish, dispose };
}
