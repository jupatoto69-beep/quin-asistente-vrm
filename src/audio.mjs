export async function toWhisperWav(context, blob) {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  if (decoded.duration < 0.35) throw new Error('La grabación es muy corta. Habla un poco más.');
  const sampleRate = 16000;
  const length = Math.min(sampleRate * 30, Math.floor(decoded.duration * sampleRate));
  const offline = new OfflineAudioContext(1, length, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
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
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    header.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < 0.015) throw new Error('No se detectó voz con suficiente volumen.');
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
    stream.getTracks().forEach((track) => track.stop());
  });
  function stop() {
    if (recorder.state === 'recording') recorder.stop();
  }
  recorder.start();
  timer = setTimeout(stop, maxTime);
  return { stop, result };
}
