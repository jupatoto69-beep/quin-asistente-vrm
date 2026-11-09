import { createAvatar } from './avatar.mjs';
import { createStreamPlayer, record, toWhisperWav } from './audio.mjs';
import { tones, liveSamples, softVoiceTones, wakePhrases, validTone, speechText, speechReaction } from './voice.cjs';
import { initializeMemoryPanel } from './memory-panel.mjs';
import { initializeProfilePanel } from './profile-panel.mjs';
import { handCue } from './hand-cues.cjs';
import { containsInterruption, watchWake } from './wake-listener.mjs';
import { createCompanion } from './companion.cjs';

const api = window.assistant;
initializeProfilePanel(api);
const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const avatarNote = byId('avatar-note');
const prompt = byId('prompt');
const mic = byId('mic');
const send = byId('send');
const voice = byId('voice');
const wake = byId('wake');
const companionMode = byId('companion');
const messages = byId('messages');
const file = byId('file');
const pick = byId('pick');
const resetAvatar = byId('reset-avatar');
const voicePreview = byId('voice-preview');
const toneButtons = [];
for (const [tone, profile] of Object.entries(tones)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.tone = tone;
  button.textContent = profile.label;
  toneButtons.push(button);
  byId('voice-samples').append(button);
}
const labels = {
  idle: 'Lista',
  opening: 'Abriendo micrófono…',
  listening: 'Grabando · pulsa Terminar',
  transcribing: 'Transcribiendo con Whisper…',
  thinking: 'Pensando con Qwen3…',
  responding: 'Escribiendo respuesta…',
  gesturing: 'Moviéndose…',
  preparing: 'Preparando la voz…',
  speaking: 'Hablando',
  interrupted: 'Respuesta pausada…',
};
let ready = {};
let state = 'idle';
let context;
let analyser;
let samples;
let capture;
let wakeListener;
let wakeArmed = false;
let wakeReplies = [];
let lastWakeReply;
let wakePlayback;
let avatar;
let avatarId;
let replyText;
let speakingTone;
let speakingReaction;
let voicePacket;
let activeSpeech;
let pendingCorrection;
const companion = createCompanion();
let companionInterval;
let companionPrompt;
let companionVisible = true;

function canSend() {
  return ready.chat && (state === 'idle' || (state === 'listening' && pendingCorrection));
}

function update(next) {
  state = next;
  if (state !== 'idle') companion.pause();
  document.body.dataset.state = state;
  let label = state === 'idle' && !ready.chat ? 'Falta preparar Ollama y Qwen3' : labels[state];
  if (state === 'idle' && wake.checked && wakeListener) label = 'Activa · di «Hey, Quin»';
  if (state === 'listening' && wakeArmed) label = 'Te escucho…';
  if (state === 'speaking' && wakeArmed) label = 'Quin te oyó…';
  if (state === 'speaking' && speakingTone) label += ' · ' + tones[speakingTone].label;
  const canInterrupt = state === 'speaking' && activeSpeech && !activeSpeech.controller.signal.aborted;
  byId('status').textContent = label;
  send.disabled = !canSend();
  mic.disabled = !canInterrupt && (!ready.chat || !ready.transcribe || !(wakeArmed || ['idle', 'listening'].includes(state)));
  mic.textContent = canInterrupt ? 'Interrumpir' : wakeArmed ? 'Terminar charla' : state === 'listening' ? 'Terminar' : 'Hablar';
  mic.setAttribute('aria-pressed', String(wakeArmed || state === 'listening'));
  wake.disabled = !ready.chat || !ready.transcribe || (state !== 'idle' && (!wake.checked || !wakeListener));
  if (canInterrupt && !containsInterruption(activeSpeech.text)) wakeListener?.listenForInterruption();
  else wakeListener?.setEnabled(wakeArmed || (wake.checked && state === 'idle'));
  for (const button of toneButtons) button.disabled = state !== 'idle' || !ready.expressiveVoice;
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

async function openMicrophone() {
  await api.microphone(true);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } finally {
    await api.microphone(false);
  }
}

function mouthLevel() {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(samples);
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.min(0.95, Math.max(0, Math.sqrt(energy / samples.length) * 5 - 0.045));
}

function connectVoiceOutput(input, tone) {
  if (!softVoiceTones.has(tone)) {
    input.connect(context.destination);
    return;
  }
  const shelf = context.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 3500;
  shelf.gain.value = -3.5;
  input.connect(shelf).connect(context.destination);
  return shelf;
}

async function play(wav, tone, referenceSample = false, signal) {
  const audio = await context.decodeAudioData(wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength));
  if (signal?.aborted) return;
  update('speaking');
  const playback = startBufferedAudio(audio, tone, referenceSample);
  signal?.addEventListener('abort', playback.stop, { once: true });
  try {
    await playback.ended;
  } finally {
    signal?.removeEventListener('abort', playback.stop);
  }
}

function startBufferedAudio(audio, tone, referenceSample = false) {
  const source = context.createBufferSource();
  const meter = analyser = context.createAnalyser();
  meter.fftSize = 512;
  samples = new Float32Array(meter.fftSize);
  source.buffer = audio;
  if (tone && ready.voiceEngine === 'kokoro') {
    const { pitch, lift } = tones[tone];
    const now = context.currentTime;
    source.detune.setValueAtTime(pitch, now);
    source.detune.linearRampToValueAtTime(pitch + lift, now + audio.duration * 0.35);
    source.detune.linearRampToValueAtTime(pitch, now + audio.duration * 0.8);
  }
  source.connect(meter);
  const output = connectVoiceOutput(meter, referenceSample ? undefined : tone);
  const ended = new Promise((resolve) => {
    source.addEventListener('ended', resolve, { once: true });
    source.start();
  }).finally(() => {
    source.disconnect();
    meter.disconnect();
    output?.disconnect();
    if (analyser === meter) analyser = undefined;
  });
  return { ended, stop: () => source.stop() };
}

api.onVoiceChunk((chunk) => voicePacket?.(chunk));

async function playStream(text, tone, signal) {
  analyser = context.createAnalyser();
  analyser.fftSize = 512;
  samples = new Float32Array(analyser.fftSize);
  const output = connectVoiceOutput(analyser, tone);
  const player = createStreamPlayer(context, analyser, () => update('speaking'));
  let stop;
  const playback = new Promise((resolve) => {
    stop = () => {
      voicePacket = undefined;
      player.dispose();
      resolve();
    };
    signal?.addEventListener('abort', stop, { once: true });
    voicePacket = (chunk) => {
      if (chunk === null) resolve(player.finish());
      else player.push(chunk);
    };
  });
  try {
    const fallback = await api.speakStream(text, tone);
    if (fallback === null && !signal?.aborted) await playback;
    return fallback;
  } finally {
    signal?.removeEventListener('abort', stop);
    voicePacket = undefined;
    player.dispose();
    analyser.disconnect();
    output?.disconnect();
    analyser = undefined;
  }
}

async function speak(text, tone, preview = false, signal) {
  speakingTone = validTone(tone);
  speakingReaction = speechReaction(speechText(text));
  update('preparing');
  try {
    await unlockAudio();
    if (signal?.aborted) return;
    if (preview && (tone === 'picara' ? ready.picaraSample : !liveSamples.has(tone) && ready.voiceSamples)) {
      const response = await fetch(`/muestra-${tone}.wav`);
      if (!response.ok) throw new Error('No se pudo abrir la muestra de voz.');
      await play(new Uint8Array(await response.arrayBuffer()), speakingTone, true);
    } else if (ready.voiceStream) {
      const fallback = await playStream(text, tone, signal);
      if (fallback && !signal?.aborted) await play(fallback, speakingTone, false, signal);
    } else {
      const wav = await api.speak(text, tone);
      if (wav && !signal?.aborted) await play(wav, speakingTone, false, signal);
    }
  } finally {
    speakingTone = undefined;
    speakingReaction = undefined;
  }
}

async function answer(text, request) {
  const view = avatar?.observeBody();
  const starter = companionPrompt;
  companionPrompt = undefined;
  companion.answered();
  update('thinking');
  const userText = addMessage('Tú', text);
  let reply;
  let replyRow;
  let acted = false;
  try {
    reply = await api.chat(request, avatar?.capabilities(), avatarId, view, starter);
    if (reply.action) {
      update('gesturing');
      const performed = await avatar?.gesture(reply.action) ?? false;
      reply = await api.gestureResult(reply.actionId, performed);
      acted = true;
    }
    if (replyText) replyText.data = reply.text;
    else replyText = addMessage('Quin', reply.text);
    replyRow = replyText.parentElement;
    if (reply.memoryId && userText.parentElement && replyText.parentElement) {
      userText.parentElement.dataset.memoryId = reply.memoryId;
      replyText.parentElement.dataset.memoryId = reply.memoryId;
    }
    if (reply.memoryWarning) report(new Error(reply.memoryWarning));
  } finally {
    replyText = undefined;
  }
  const cue = acted ? null : handCue(text, reply.text);
  if (cue) avatar?.gesture(cue);
  return deliverReply(reply, replyRow);
}

async function deliverReply(reply, row, proactive = false) {
  if (voice.checked && ready.speak && (!proactive || reply.speaks)) {
    const speech = activeSpeech = { controller: new AbortController(), text: reply.text, id: reply.memoryId, row, proactive };
    try {
      await speak(reply.text, reply.tone, false, speech.controller.signal);
    } catch (error) {
      if (!speech.controller.signal.aborted) throw error;
    } finally {
      activeSpeech = undefined;
      wakeListener?.setEnabled(false);
    }
    if (speech.controller.signal.aborted) {
      await speech.cancellation;
      return speech;
    }
  } else {
    avatar?.reply(reply.tone, speechReaction(speechText(reply.text)));
  }
}

async function companionTick() {
  const available = ready.chat && !!avatarId && state === 'idle' && !wakeArmed && !pendingCorrection &&
    companionVisible && !document.hidden && !prompt.value.trim() &&
    !document.querySelector('dialog[open]') && !wakeListener?.isChecking();
  const line = companion.tick(performance.now(), available);
  if (!line) return;
  companionPrompt = line.id;
  const row = addMessage('Quin', line.text, 'companion-message').parentElement;
  const plays = line.speaks && voice.checked && ready.speak;
  let interrupted;
  try {
    interrupted = await deliverReply(line, row, true);
  } catch (error) {
    report(error);
  }
  if (plays) update('idle');
  if (interrupted?.addition) await answerInput(interrupted.addition);
}

function setCompanionMode(mode) {
  clearInterval(companionInterval);
  companionMode.value = mode;
  companion.setMode(mode);
  if (mode !== 'off') companionInterval = setInterval(companionTick, 2000);
}

companionMode.addEventListener('change', async () => {
  const mode = companionMode.value;
  if (activeSpeech?.proactive && mode !== 'chatty') interruptReply();
  companionMode.disabled = true;
  const previous = companionMode.dataset.saved;
  setCompanionMode(mode);
  try {
    await api.setCompanion(mode);
    companionMode.dataset.saved = mode;
  } catch {
    setCompanionMode(previous);
    report(new Error('No se pudo guardar el modo compañía.'));
  } finally {
    companionMode.disabled = false;
  }
});

prompt.addEventListener('input', () => companion.pause());
function pauseOnVisibilityChange() {
  companion.pause();
  if ((!companionVisible || document.hidden) && activeSpeech?.proactive) interruptReply();
}
document.addEventListener('visibilitychange', pauseOnVisibilityChange);
api.onCompanionVisibility((visible) => {
  companionVisible = visible;
  pauseOnVisibilityChange();
});

function interruptReply(addition = '') {
  const speech = activeSpeech;
  if (!speech || speech.controller.signal.aborted) return;
  speech.addition = addition;
  speech.controller.abort();
  speech.cancellation = api.interrupt(speech.id).catch(report);
  const author = speech.row?.querySelector('strong');
  if (author) author.textContent = 'Quin (interrumpida) · ';
  update('interrupted');
}

for (const button of toneButtons) {
  button.addEventListener('click', async () => {
    if (state !== 'idle' || !ready.expressiveVoice) return;
    const tone = validTone(button.dataset.tone);
    try {
      await speak(tones[tone].sample, tone, true);
    } catch (error) {
      report(error);
    } finally {
      update('idle');
    }
  });
}

api.onReplyChunk((chunk) => {
  if (state === 'thinking') {
    replyText = addMessage('Quin', chunk);
    update('responding');
  } else if (state === 'responding' && replyText) {
    replyText.appendData(chunk);
    messages.scrollTop = messages.scrollHeight;
  }
});

voice.addEventListener('change', async () => {
  const enabled = voice.checked;
  if (!enabled) {
    wakePlayback?.stop();
    if (activeSpeech?.proactive) interruptReply();
  }
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

async function answerInput(text, listener) {
  const addition = text.slice(0, 1200);
  const prefix = 'Mi mensaje anterior fue: ';
  const connector = '\nAñado o corrijo: ';
  const room = 1200 - prefix.length - connector.length - addition.length;
  const request = pendingCorrection && room > 0 ? prefix + pendingCorrection.slice(0, room) + connector + addition : addition;
  pendingCorrection = undefined;
  try {
    const interrupted = await answer(addition, request);
    if (interrupted) {
      pendingCorrection = request;
      if (interrupted.addition) return answerInput(interrupted.addition, wakeListener);
      if (!wakeListener && ready.transcribe) {
        update('opening');
        const stream = await openMicrophone();
        try {
          wakeListener = await createVoiceListener(stream);
        } catch (error) {
          stream.getTracks().forEach((track) => track.stop());
          throw error;
        }
      }
      listener = wakeListener;
    }
    if (listener && listener === wakeListener) {
      wakeArmed = true;
      listener.waitForCommand();
      update('listening');
      return;
    }
  } catch (error) {
    report(error);
  }
  if (listener && listener === wakeListener) endVoiceConversation();
  else update('idle');
}

byId('chat').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || !canSend()) return;
  prompt.value = '';
  const listener = state === 'listening' ? wakeListener : undefined;
  if (listener) {
    listener.setEnabled(false);
    finishWakeWait();
  }
  void answerInput(text, listener);
});

async function preloadWakeReplies() {
  if (wakeReplies.length === wakePhrases.length) return;
  const results = await Promise.allSettled(wakePhrases.map(async (name) => {
    const response = await fetch(`/activacion/${name}.wav`);
    if (!response.ok) throw new Error('Falta una respuesta de activación.');
    return context.decodeAudioData(await response.arrayBuffer());
  }));
  wakeReplies = results.filter(({ status }) => status === 'fulfilled').map(({ value }) => value);
}

function acknowledgeWake(canSpeak) {
  wakeArmed = true;
  if (!canSpeak || !voice.checked || !wakeReplies.length) {
    update('listening');
    return;
  }
  const choices = wakeReplies.filter((reply) => reply !== lastWakeReply);
  lastWakeReply = choices[Math.floor(Math.random() * choices.length)] ?? wakeReplies[0];
  const playback = wakePlayback = startBufferedAudio(lastWakeReply);
  update('speaking');
  return playback.ended.finally(() => {
    if (wakePlayback !== playback) return;
    wakePlayback = undefined;
    update('listening');
  });
}

function finishWakeWait() {
  wakeArmed = false;
  const playback = wakePlayback;
  wakePlayback = undefined;
  playback?.stop();
}

function endVoiceConversation() {
  pendingCorrection = undefined;
  finishWakeWait();
  if (!wake.checked) {
    wakeListener?.close();
    wakeListener = undefined;
  }
  update('idle');
}

function disableWake() {
  wakeListener?.close();
  wakeListener = undefined;
  wake.checked = false;
  pendingCorrection = undefined;
  const next = wakeArmed ? 'idle' : state;
  finishWakeWait();
  update(next);
}

function createVoiceListener(stream) {
  return watchWake(context, stream, api, {
    armed: acknowledgeWake,
    command(text) {
      finishWakeWait();
      void answerInput(text, wakeListener);
    },
    idle: endVoiceConversation,
    stop: disableWake,
    interrupt: interruptReply,
    error(error) {
      disableWake();
      report(error);
    },
  });
}

wake.addEventListener('change', async () => {
  if (!wake.checked) { disableWake(); return; }
  if (state !== 'idle') { wake.checked = false; return; }
  update('opening');
  let stream;
  try {
    await unlockAudio();
    await preloadWakeReplies();
    stream = await openMicrophone();
    wakeListener = await createVoiceListener(stream);
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    wake.checked = false;
    report(error);
  } finally {
    update('idle');
  }
});

mic.addEventListener('click', async () => {
  if (state === 'speaking' && activeSpeech) { interruptReply(); return; }
  if (capture) { capture.stop(); return; }
  if (wakeArmed) { wakeListener?.cancel(); return; }
  if (state !== 'idle') return;
  const background = wakeListener;
  update('opening');
  let stream;
  try {
    stream = await openMicrophone();
    capture = record(stream, 29_000);
    update('listening');
    const blob = await capture.result;
    capture = undefined;
    for (const track of stream.getAudioTracks()) track.enabled = false;
    update('transcribing');
    await unlockAudio();
    const transcript = await api.transcribe(await toWhisperWav(context, blob));
    if (!transcript) throw new Error('Whisper no encontró palabras. Intenta de nuevo.');
    if (!background) {
      wakeListener = await createVoiceListener(stream);
      stream = undefined;
    } else {
      for (const track of stream.getTracks()) track.stop();
      stream = undefined;
    }
    await answerInput(transcript, wakeListener);
  } catch (error) {
    report(error);
    update('idle');
  } finally {
    capture = undefined;
    stream?.getTracks().forEach((track) => track.stop());
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
    await loadDisplayedAvatar(data);
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

async function loadDisplayedAvatar(data) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  await avatar.load(data);
  avatarId = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadSample() {
  const response = await fetch('/avatar.vrm');
  if (!response.ok) throw new Error('No está el avatar de muestra.');
  await loadDisplayedAvatar(await response.arrayBuffer());
}

function controlPosition(id) {
  const control = byId(id);
  if (!control?.getClientRects().length) return null;
  const area = stage.getBoundingClientRect();
  const box = control.getBoundingClientRect();
  if (!area.width || !area.height) return null;
  return { x: (box.left + box.width / 2 - area.left) / area.width,
    y: (box.top + box.height / 2 - area.top) / area.height };
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
  const [available, voiceEnabled, hasAvatar, mode] = await Promise.all([api.ready(), api.getVoice(), api.hasAvatar(), api.getCompanion()]);
  ready = available;
  setCompanionMode(mode);
  companionMode.dataset.saved = mode;
  companionMode.disabled = false;
  if (ready.memory) initializeMemoryPanel(api, messages);
  else report(new Error('La memoria local no se pudo abrir. Este chat se recuerda mientras la ventana siga abierta.'));
  voice.disabled = !ready.speak;
  voice.checked = ready.speak && voiceEnabled;
  voicePreview.hidden = !ready.expressiveVoice;
  update('idle');
  if (!ready.chat || !ready.transcribe || !ready.speak) {
    const missing = Object.entries({ chat: 'Ollama/Qwen3', transcribe: 'Whisper', speak: 'motor de voz' })
      .filter(([key]) => !ready[key]).map(([, name]) => name);
    addMessage('Instalación', `Falta ${missing.join(', ')}. Consulta la guía de preparación.`);
  }
  try {
    avatar = createAvatar(stage, () => ({
      state, tone: speakingTone, reaction: speakingReaction, companion: companionMode.value,
    }), mouthLevel, api.pointer, controlPosition);
    if (hasAvatar) {
      resetAvatar.hidden = false;
      try {
        const custom = await fetch('/avatar-personal.vrm');
        if (!custom.ok) throw new Error('El avatar guardado no está disponible.');
        await loadDisplayedAvatar(await custom.arrayBuffer());
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
