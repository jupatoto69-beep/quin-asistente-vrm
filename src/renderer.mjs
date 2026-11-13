import { createAvatar } from './avatar.mjs';
import { createStreamPlayer, record, toWhisperWav } from './audio.mjs';
import { tones, liveSamples, softVoiceTones, wakePhrases, searchPhrases, validTone, speechText, speechReaction, speechParts } from './voice.cjs';
import { initializeMemoryPanel } from './memory-panel.mjs';
import { initializeProfilePanel } from './profile-panel.mjs';
import { handCue } from './hand-cues.cjs';
import { containsInterruption, watchWake } from './wake-listener.mjs';
import { createCompanion, companionCommand } from './companion.cjs';
import { createVisionPanel, visionCommand } from './vision-panel.mjs';
import { replyActing } from './acting-cues.cjs';
import { memoryScopeRequest } from './memory-scope.cjs';
import { desktopRequest } from './desktop-actions.cjs';
import { reminderRequest } from './reminders.cjs';
import { initializePendingPanel } from './pending-panel.mjs';
import { fileRequest } from './file-query.cjs';
import { createFilesPanel } from './files-panel.mjs';
import { screenCommand } from './screen-command.cjs';

const api = window.assistant;
initializeProfilePanel(api);
const byId = (id) => document.getElementById(id);
const stage = byId('stage');
const avatarNote = byId('avatar-note');
const prompt = byId('prompt');
const mic = byId('mic');
const send = byId('send');
const voice = byId('voice');
const web = byId('web');
const wake = byId('wake');
const companionMode = byId('companion');
const temporaryEnd = byId('temporary-end');
const gamesOpen = byId('games-open');
const gamesDialog = byId('games-dialog');
const visionOpen = byId('vision-open');
const visionDialog = byId('vision-dialog');
const visionStop = byId('vision-stop');
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
  searching: 'Buscando en Internet…',
  responding: 'Escribiendo respuesta…',
  gesturing: 'Moviéndose…',
  looking: 'Mirando el recorte…',
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
let speakingActing;
let voicePacket;
let activeSpeech;
let pendingCorrection;
const companion = createCompanion();
let companionInterval;
let companionPrompt;
let companionVisible = true;
let companionChecking = false;
let companionRevision = 0;
let gameActive = false;
let temporaryChat = false;
let visualSpeaking = false;
let savingWeb = false;
let searchClips;
let lastSearchClip;
let searchPlayback;
let searchNotice;
const files = createFilesPanel(api, report);

const vision = createVisionPanel(api, {
  available: () => ready.vision,
  onOpen: endVoiceConversation,
  onClose() {
    if (visualSpeaking) interruptReply();
    update(state);
  },
  onPoint() { void avatar?.gesture({ kind: 'point', target: 'vision-mark' }); },
  async onStep(text, row) {
    visualSpeaking = true;
    try { await deliverReply({ text, tone: 'dulce' }, row); }
    finally { visualSpeaking = false; update('idle'); }
  },
  async analyze(question, image, show) {
    update('looking');
    try {
      const reply = await api.look(question, image);
      if (!reply || !show(reply)) return;
      const row = addMessage('Quin', reply.text).parentElement;
      visualSpeaking = true;
      const first = reply.steps?.[0]?.text;
      await deliverReply(first ? { ...reply, text: reply.text + '\n' + first } : reply, row);
    } finally {
      visualSpeaking = false;
      update('idle');
    }
  },
});
visionOpen.addEventListener('click', () => { if (state === 'idle') void vision.open(); });
visionStop.addEventListener('click', () => interruptReply());

function canSend() {
  return !visionDialog.open && (state === 'idle' || (state === 'listening' && pendingCorrection));
}

function update(next) {
  state = next;
  if (state !== 'idle') pauseCompanion();
  document.body.dataset.state = state;
  let label = state === 'idle' && !ready.chat ? 'Lista · funciones locales' : labels[state];
  if (state === 'idle' && wake.checked && wakeListener) label = 'Activa · di «Hey, Quin»';
  if (state === 'listening' && wakeArmed) label = 'Te escucho…';
  if (state === 'speaking' && wakeArmed) label = 'Quin te oyó…';
  if (state === 'speaking' && speakingTone) label += ' · ' + tones[speakingTone].label;
  if (temporaryChat) label += ' · Temporal';
  const canInterrupt = state === 'speaking' && activeSpeech && !activeSpeech.controller.signal.aborted;
  byId('status').textContent = label;
  send.disabled = !canSend();
  web.disabled = temporaryChat || savingWeb || state !== 'idle' || !ready.chat || !ready.web;
  temporaryEnd.hidden = !temporaryChat;
  temporaryEnd.disabled = !canSend();
  gamesOpen.disabled = !canSend();
  visionOpen.disabled = state !== 'idle' || visionDialog.open;
  visionStop.hidden = !visualSpeaking || !canInterrupt;
  mic.disabled = visionDialog.open || (!canInterrupt && (!ready.transcribe || !(wakeArmed || ['idle', 'listening'].includes(state))));
  mic.textContent = canInterrupt ? 'Interrumpir' : wakeArmed ? 'Terminar charla' : state === 'listening' ? 'Terminar' : 'Hablar';
  mic.setAttribute('aria-pressed', String(wakeArmed || state === 'listening'));
  wake.disabled = visionDialog.open || !ready.transcribe || (state !== 'idle' && (!wake.checked || !wakeListener));
  if (visionDialog.open) wakeListener?.setEnabled(false);
  else if (canInterrupt && !containsInterruption(activeSpeech.text)) wakeListener?.listenForInterruption();
  else wakeListener?.setEnabled(wakeArmed || (wake.checked && state === 'idle'));
  for (const button of toneButtons) button.disabled = state !== 'idle' || !ready.expressiveVoice;
}

function addMessage(author, value, style = '') {
  messages.querySelector('.hint')?.remove();
  const row = document.createElement('p');
  if (temporaryChat) row.dataset.temporary = 'true';
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

function addSources(row, sources) {
  if (!sources?.length) return;
  const references = document.createElement('span');
  references.className = 'web-sources';
  references.append('Fuentes · ');
  sources.forEach(({ title, url }, index) => {
    if (index) references.append(' · ');
    const link = document.createElement('a');
    link.href = url;
    link.title = title || url;
    link.textContent = title.length > 48 ? title.slice(0, 45) + '…'
      : title || new URL(url).hostname.replace(/^www\./, '');
    link.addEventListener('click', (event) => {
      event.preventDefault();
      api.openSource(url).catch(report);
    });
    references.append(link);
  });
  row.append(references);
  messages.scrollTop = messages.scrollHeight;
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

function loadSearchClips() {
  context ??= new AudioContext();
  searchClips ??= Promise.allSettled(searchPhrases.map(async (name) => {
    const response = await fetch(`/busqueda/${name}.wav`);
    if (!response.ok) throw new Error('Falta un aviso de búsqueda.');
    return context.decodeAudioData(await response.arrayBuffer());
  })).then((results) => results.flatMap(({ status, value }) => status === 'fulfilled' ? [value] : []));
  return searchClips;
}

async function announceSearch() {
  if (!voice.checked || !ready.speak) return;
  const clips = await loadSearchClips();
  if (state !== 'searching' || !clips.length || !voice.checked) return;
  await unlockAudio();
  if (state !== 'searching' || !voice.checked) return;
  const choices = clips.filter((clip) => clip !== lastSearchClip);
  lastSearchClip = choices[Math.floor(Math.random() * choices.length)] ?? clips[0];
  const playback = searchPlayback = startBufferedAudio(lastSearchClip, 'dulce', true);
  try {
    await playback.ended;
  } finally {
    if (searchPlayback === playback) searchPlayback = undefined;
  }
}

api.onWebSearch(() => {
  if (state !== 'thinking') return;
  update('searching');
  searchNotice = announceSearch().catch(() => {});
});

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
  const rms = Math.sqrt(energy / samples.length);
  // Quiet syllables still need to move the mouth. The curve only affects the avatar.
  return Math.min(0.95, Math.sqrt(Math.max(0, rms - 0.002) * 3.2));
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

async function playBufferedParts(text, tone, signal) {
  for (const part of speechParts(speechText(text, tone))) {
    if (signal?.aborted) return;
    const wav = await api.speak(part, tone);
    if (wav && !signal?.aborted) await play(wav, tone, false, signal);
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
      if (fallback === undefined) await playBufferedParts(text, speakingTone, signal);
      else if (fallback && !signal?.aborted) await play(fallback, speakingTone, false, signal);
    } else {
      await playBufferedParts(text, speakingTone, signal);
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
  let spokeBeforeGesture = false;
  try {
    reply = await api.chat(request, avatar?.capabilities(), avatarId, view, starter);
    if (reply.action) {
      if (reply.before) {
        replyText = addMessage('Quin', reply.before.text);
        spokeBeforeGesture = voice.checked && ready.speak;
        const interrupted = await deliverReply(reply.before, replyText.parentElement);
        if (interrupted) return interrupted;
      }
      update('gesturing');
      const performed = await avatar?.gesture(reply.action) ?? false;
      reply = await api.gestureResult(reply.actionId, performed);
      acted = true;
    }
    if (typeof reply.gameActive === 'boolean') gameActive = reply.gameActive;
    if (reply.companionMode) {
      setCompanionMode(reply.companionMode);
      companionMode.dataset.saved = reply.companionMode;
    }
    if (reply.companionPause) companion.answered(true);
    if (replyText) {
      replyText.data = reply.text;
      replyText.parentElement.querySelector('strong').textContent = 'Quin · ';
    } else replyText = addMessage('Quin', reply.text);
    replyRow = replyText.parentElement;
    addSources(replyRow, reply.sources);
    files.addResults(replyRow, reply);
    if (reply.memoryId && userText.parentElement && replyText.parentElement) {
      userText.parentElement.dataset.memoryId = reply.memoryId;
      replyText.parentElement.dataset.memoryId = reply.memoryId;
    }
    if (reply.memoryWarning) report(new Error(reply.memoryWarning));
  } catch (error) {
    const author = replyText?.parentElement?.querySelector('strong');
    if (author) author.textContent = 'Quin (respuesta incompleta) · ';
    throw error;
  } finally {
    if (temporaryChat) {
      if (userText.parentElement) userText.parentElement.dataset.temporary = 'true';
      if (replyText?.parentElement) replyText.parentElement.dataset.temporary = 'true';
    }
    replyText = undefined;
    await searchNotice;
    searchNotice = undefined;
  }
  const cue = reply.celebrate ? { kind: 'thumb', side: 1 }
    : acted || typeof reply.gameActive === 'boolean' ? null : handCue(text, reply.text);
  if (cue) avatar?.gesture(cue);
  const spoken = spokeBeforeGesture && reply.speechAfterGesture
    ? { ...reply, text: reply.speechAfterGesture } : reply;
  return deliverReply(spoken, replyRow, false, text);
}

async function deliverReply(reply, row, proactive = false, request = '') {
  const reaction = speechReaction(speechText(reply.text));
  const cue = reply.animation ?? replyActing(request, reply.text, reply.tone, reaction);
  if (voice.checked && ready.speak && (!proactive || reply.speaks)) {
    const speech = activeSpeech = {
      controller: new AbortController(), text: reply.text, id: reply.memoryId, row, proactive,
      game: typeof reply.gameActive === 'boolean',
    };
    speakingActing = cue;
    try {
      await speak(reply.text, reply.tone, false, speech.controller.signal);
    } catch (error) {
      if (!speech.controller.signal.aborted) throw error;
    } finally {
      activeSpeech = undefined;
      speakingActing = undefined;
      wakeListener?.setEnabled(false);
    }
    if (speech.controller.signal.aborted) {
      await speech.cancellation;
      return speech;
    }
  } else {
    avatar?.reply(reply.tone, reaction, cue);
  }
}

function companionAvailable() {
  return !temporaryChat && (ready.chat || ready.memory) && !!avatarId && state === 'idle' && !wakeArmed && !pendingCorrection && !gameActive &&
    companionVisible && !document.hidden && !prompt.value.trim() &&
    !document.querySelector('dialog[open]') && !wakeListener?.isChecking();
}

async function companionTick() {
  if (companionChecking) return;
  if (!companionAvailable()) { companion.tick(performance.now(), false); return; }
  const mode = companionMode.value;
  const revision = companionRevision;
  companionChecking = true;
  let invitation;
  try {
    const idleSeconds = mode === 'gaming' ? await api.companionIdle() : 0;
    if (revision !== companionRevision || !companionAvailable()) return;
    invitation = companion.tick(performance.now(), true, idleSeconds);
    if (!invitation) return;
    const story = mode === 'gaming' ? undefined : await api.companionStory();
    if (mode !== companionMode.value || revision !== companionRevision || !companionAvailable()) {
      companion.cancelled(invitation);
      return;
    }
    const line = story ? { ...story, speaks: invitation.speaks } : invitation;
    companionPrompt = line.id;
    const row = addMessage('Quin', line.text, 'companion-message').parentElement;
    companion.presented(invitation);
    if (story) await api.companionPresented(story.storyId);
    if (revision !== companionRevision || !companionAvailable()) return;
    const plays = line.speaks && voice.checked && ready.speak;
    let interrupted;
    try {
      interrupted = await deliverReply(line, row, true);
    } finally {
      if (plays && !['thinking', 'responding', 'gesturing'].includes(state)) update('idle');
    }
    if (interrupted?.addition) await answerInput(interrupted.addition);
  } catch (error) {
    if (invitation) companion.cancelled(invitation);
    report(error);
  } finally {
    companionChecking = false;
  }
}

function setCompanionMode(mode) {
  companionRevision++;
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

function pauseCompanion() {
  companionRevision++;
  companion.pause();
}

prompt.addEventListener('input', pauseCompanion);
stage.addEventListener('pointerdown', pauseCompanion);
stage.addEventListener('wheel', pauseCompanion, { passive: true });
function pauseOnVisibilityChange() {
  pauseCompanion();
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
  if (state === 'thinking' || state === 'searching') {
    replyText = addMessage('Quin (escribiendo)', chunk);
    update('responding');
  } else if (state === 'responding' && replyText) {
    replyText.appendData(chunk);
    messages.scrollTop = messages.scrollHeight;
  }
});

api.onMemoryScope(({ temporary, movedMemoryId }) => {
  if (movedMemoryId) {
    for (const row of messages.querySelectorAll('[data-memory-id="' + movedMemoryId + '"]')) {
      delete row.dataset.memoryId;
      row.dataset.temporary = 'true';
    }
  }
  if (temporary === temporaryChat) return;
  temporaryChat = temporary;
  gameActive = false;
  if (!temporary) {
    for (const row of messages.querySelectorAll('[data-temporary]')) row.remove();
  }
  update(state);
});

api.onTimer((text) => addMessage('Quin', text));
api.onReminder((due, count) => {
  const text = due.map(({ text, id }) => `Pendiente ${id}. ${text}`).join('\n');
  const row = addMessage(count === 1 ? 'Recordatorio' : 'Recordatorios', count > due.length ? text + '\nPuedes ver el resto en Pendientes.' : text).parentElement;
  delete row.dataset.temporary;
});

voice.addEventListener('change', async () => {
  const enabled = voice.checked;
  if (!enabled) {
    wakePlayback?.stop();
    searchPlayback?.stop();
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

web.addEventListener('change', async () => {
  const enabled = web.checked;
  savingWeb = true;
  update(state);
  try {
    await api.setWeb(enabled);
    if (enabled) void loadSearchClips();
  } catch {
    web.checked = !enabled;
    report(new Error('No se pudo guardar la preferencia de búsqueda.'));
  } finally {
    savingWeb = false;
    update(state);
  }
});

async function answerInput(text, listener) {
  const addition = text.slice(0, 1200);
  const screenQuestion = screenCommand(addition);
  if (screenQuestion !== undefined) {
    await vision.open(screenQuestion, addition);
    return;
  }
  const visualQuestion = visionCommand(addition);
  if (visualQuestion !== undefined) {
    await vision.open(visualQuestion);
    return;
  }
  const prefix = 'Mi mensaje anterior fue: ';
  const connector = '\nAñado o corrijo: ';
  const room = 1200 - prefix.length - connector.length - addition.length;
  const direct = memoryScopeRequest(addition) || desktopRequest(addition) || reminderRequest(addition) || fileRequest(addition) || companionCommand(addition);
  const request = !direct && typeof pendingCorrection === 'string' && room > 0
    ? prefix + pendingCorrection.slice(0, room) + connector + addition : addition;
  pendingCorrection = undefined;
  try {
    const interrupted = await answer(addition, request);
    if (interrupted) {
      pendingCorrection = interrupted.game ? true : request;
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

function submitText(text) {
  const listener = state === 'listening' ? wakeListener : undefined;
  if (listener) {
    listener.setEnabled(false);
    finishWakeWait();
  }
  void answerInput(text, listener);
}

temporaryEnd.addEventListener('click', () => {
  if (canSend()) submitText('Termina la charla temporal.');
});

byId('chat').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || !canSend()) return;
  prompt.value = '';
  submitText(text);
});

gamesOpen.addEventListener('click', () => gamesDialog.showModal());
gamesDialog.addEventListener('click', (event) => {
  const game = event.target.closest('button[data-game]')?.dataset.game;
  if (!game || !canSend()) return;
  gamesDialog.close();
  submitText(game);
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
  companion.answered();
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
  const area = stage.getBoundingClientRect();
  if (!area.width || !area.height) return null;
  if (id === 'vision-mark') {
    const mark = vision.pointPosition();
    return mark ? { x: (mark.x - area.left) / area.width, y: (mark.y - area.top) / area.height } : null;
  }
  const control = byId(id);
  if (!control?.getClientRects().length) return null;
  const box = control.getBoundingClientRect();
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
  const [available, voiceEnabled, hasAvatar, mode, webEnabled] = await Promise.all([
    api.ready(), api.getVoice(), api.hasAvatar(), api.getCompanion(), api.getWeb(),
  ]);
  ready = available;
  setCompanionMode(mode);
  companionMode.dataset.saved = mode;
  companionMode.disabled = false;
  if (ready.memory) {
    initializeMemoryPanel(api, messages, () => {
      if (canSend()) submitText('Modo temporal.');
    });
    initializePendingPanel(api);
  }
  else report(new Error('La memoria local no se pudo abrir. Este chat se recuerda mientras la ventana siga abierta.'));
  voice.disabled = !ready.speak;
  voice.checked = ready.speak && voiceEnabled;
  web.checked = ready.web && webEnabled;
  if (web.checked) void loadSearchClips();
  if (!ready.web) web.parentElement.title = 'Falta instalar una dependencia. Ejecuta npm ci en la carpeta de Quin.';
  voicePreview.hidden = !ready.expressiveVoice;
  update('idle');
  if (!ready.chat || !ready.transcribe || !ready.speak) {
    const missing = Object.entries({ chat: 'Ollama/Qwen3', transcribe: 'Whisper', speak: 'motor de voz' })
      .filter(([key]) => !ready[key]).map(([, name]) => name);
    addMessage('Instalación', `Falta ${missing.join(', ')}. Consulta la guía de preparación.`);
  }
  try {
    avatar = createAvatar(stage, () => ({
      state: searchPlayback ? 'speaking' : state, tone: searchPlayback ? 'dulce' : speakingTone,
      actingState: companionVisible && !document.hidden ? state : 'hidden',
      cue: speakingActing, reaction: speakingReaction, companion: companionMode.value,
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
