import { createAvatar } from './avatar.mjs';
import { record, toWhisperWav } from './audio.mjs';

const api = window.assistant;
const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const avatarNote = byId('avatar-note');
const prompt = byId('prompt');
const mic = byId('mic');
const send = byId('send');
const voice = byId('voice');
const messages = byId('messages');
const file = byId('file');
const pick = byId('pick');
const resetAvatar = byId('reset-avatar');
const labels = {
  idle: 'Lista',
  opening: 'Abriendo micrófono…',
  listening: 'Grabando · pulsa Terminar',
  transcribing: 'Transcribiendo con Whisper…',
  thinking: 'Pensando con Qwen3…',
  responding: 'Escribiendo respuesta…',
  preparing: 'Preparando la voz…',
  speaking: 'Hablando',
};
let ready = {};
let state = 'idle';
let context;
let analyser;
let samples;
let capture;
let avatar;
let replyText;

function update(next) {
  state = next;
  document.body.dataset.state = state;
  byId('status').textContent = state === 'idle' && !ready.chat ? 'Falta preparar Ollama y Qwen3' : labels[state];
  send.disabled = state !== 'idle' || !ready.chat;
  mic.disabled = !ready.chat || !ready.transcribe || !['idle', 'listening'].includes(state);
  mic.textContent = state === 'listening' ? 'Terminar' : 'Hablar';
  mic.setAttribute('aria-pressed', String(state === 'listening'));
}

function addMessage(author, value, style = '') {
  messages.querySelector('.hint')?.remove();
  const row = document.createElement('p');
  row.className = style;
  const title = document.createElement('strong');
  title.textContent = author + ' · ';
  const content = document.createTextNode(value);
  row.append(title, content);
  messages.append(row);
  if (messages.children.length > 30) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
  return content;
}

function report(error) {
  const detail = error.name === 'NotAllowedError'
    ? 'Windows bloqueó el micrófono. Revisa el acceso al micrófono para aplicaciones de escritorio.'
    : error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
  addMessage('Aviso', detail, 'error');
}

async function unlockAudio() {
  context ??= new AudioContext();
  if (context.state !== 'running') await context.resume();
}

function mouthLevel() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(samples);
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.min(0.95, Math.max(0, Math.sqrt(energy / samples.length) * 5 - 0.045));
}

async function play(wav) {
  const audio = await context.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  const source = context.createBufferSource();
  analyser = context.createAnalyser();
  analyser.fftSize = 512;
  samples = new Float32Array(analyser.fftSize);
  source.buffer = audio;
  source.connect(analyser);
  analyser.connect(context.destination);
  update('speaking');
  try {
    await new Promise((resolve) => {
      source.addEventListener('ended', resolve, { once: true });
      source.start();
    });
  } finally {
    source.disconnect();
    analyser.disconnect();
    analyser = undefined;
  }
}

async function answer(text) {
  update('thinking');
  addMessage('Tú', text);
  let reply;
  try {
    reply = await api.chat(text);
    if (replyText) replyText.data = reply;
    else addMessage('Asistente', reply);
  } finally {
    replyText = undefined;
  }
  if (voice.checked && ready.speak) {
    update('preparing');
    await unlockAudio();
    await play(await api.speak(reply));
  }
}

api.onReplyChunk((chunk) => {
  if (state === 'thinking') {
    replyText = addMessage('Asistente', chunk);
    update('responding');
  } else if (state === 'responding' && replyText) {
    replyText.appendData(chunk);
    messages.scrollTop = messages.scrollHeight;
  }
});

voice.addEventListener('change', async () => {
  const enabled = voice.checked;
  voice.disabled = true;
  try {
    await api.setVoice(enabled);
  } catch {
    voice.checked = !enabled;
    report(new Error('No se pudo guardar la preferencia de voz.'));
  } finally {
    voice.disabled = false;
  }
});

byId('chat').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || state !== 'idle' || !ready.chat) return;
  prompt.value = '';
  try {
    await answer(text);
  } catch (error) {
    report(error);
  } finally {
    update('idle');
  }
});

mic.addEventListener('click', async () => {
  if (capture) { capture.stop(); return; }
  if (state !== 'idle') return;
  update('opening');
  let stream;
  try {
    await api.microphone(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } finally {
      await api.microphone(false);
    }
    capture = record(stream, 29_000);
    update('listening');
    const blob = await capture.result;
    capture = undefined;
    update('transcribing');
    await unlockAudio();
    const transcript = await api.transcribe(await toWhisperWav(context, blob));
    if (!transcript) throw new Error('Whisper no encontró palabras. Intenta de nuevo.');
    await answer(transcript.slice(0, 1200));
  } catch (error) {
    report(error);
  } finally {
    capture = undefined;
    stream?.getTracks().forEach((track) => track.stop());
    update('idle');
  }
});

byId('minimize').addEventListener('click', () => api.minimize());
byId('close').addEventListener('click', () => api.close());
byId('pass').addEventListener('click', () => api.passThrough().catch(report));
api.onPassThrough((enabled) => { byId('pass-note').hidden = !enabled; });
pick.addEventListener('click', () => file.click());
file.addEventListener('change', async () => {
  const selected = file.files[0];
  file.value = '';
  if (!selected || !avatar) return;
  if (!selected.name.toLowerCase().endsWith('.vrm') || selected.size > 64 * 1024 * 1024) {
    report(new Error('Elige un archivo VRM de hasta 64 MB.'));
    return;
  }
  pick.disabled = resetAvatar.disabled = true;
  try {
    const data = await selected.arrayBuffer();
    await avatar.load(data);
    avatarNote.hidden = true;
    resetAvatar.hidden = false;
    try {
      await api.saveAvatar(new Uint8Array(data));
    } catch {
      report(new Error('El avatar se cargó, pero no se pudo guardar para el próximo inicio.'));
    }
  } catch {
    report(new Error('No se pudo cargar el avatar. Usa un VRM válido con recursos incrustados.'));
  } finally {
    pick.disabled = resetAvatar.disabled = false;
  }
});

async function loadSample() {
  const response = await fetch('/avatar.vrm');
  if (!response.ok) throw new Error('No está el avatar de muestra.');
  await avatar.load(await response.arrayBuffer());
}

resetAvatar.addEventListener('click', async () => {
  pick.disabled = resetAvatar.disabled = true;
  try {
    await loadSample();
    await api.resetAvatar();
    resetAvatar.hidden = true;
  } catch {
    report(new Error('No se pudo restaurar el avatar de muestra.'));
  } finally {
    pick.disabled = resetAvatar.disabled = false;
  }
});

async function initialize() {
  const [available, voiceEnabled, hasAvatar] = await Promise.all([api.ready(), api.getVoice(), api.hasAvatar()]);
  ready = available;
  voice.disabled = !ready.speak;
  voice.checked = ready.speak && voiceEnabled;
  update('idle');
  if (!ready.chat || !ready.transcribe || !ready.speak) {
    const missing = Object.entries({ chat: 'Ollama/Qwen3', transcribe: 'Whisper', speak: 'Piper' })
      .filter(([key]) => !ready[key]).map(([, name]) => name);
    addMessage('Instalación', `Falta ${missing.join(', ')}. Consulta la guía de preparación.`);
  }
  try {
    avatar = createAvatar(stage, () => state, mouthLevel);
    if (hasAvatar) {
      resetAvatar.hidden = false;
      try {
        const custom = await fetch('/avatar-personal.vrm');
        if (!custom.ok) throw new Error('El avatar guardado no está disponible.');
        await avatar.load(await custom.arrayBuffer());
        avatarNote.hidden = true;
        return;
      } catch {
        report(new Error('No se pudo abrir el avatar guardado. Se usará el avatar de muestra.'));
      }
    }
    await loadSample();
    avatarNote.hidden = true;
  } catch {
    avatarNote.textContent = avatar ? 'Usa «Cambiar VRM» para elegir un avatar.' : 'WebGL no está disponible.';
  } finally {
    pick.disabled = !avatar;
  }
}

initialize().catch(report);
