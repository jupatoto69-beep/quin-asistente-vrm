import { wakeWav } from './audio.mjs';

const silenceMs = 9000;
const speechGraceMs = 27_000; // One 12 s clip plus the local decoder's timeout.
const endConversation = /^\s*[¿¡]?(?:quin[\s,]+)?(?:(deja de escuchar(?:me)?)|termina la charla)(?:[,\s]+quin)?(?:[,\s]+por favor)?[.?!…\s]*$/iu;

export async function watchWake(context, stream, api, callbacks) {
  await context.audioWorklet.addModule('/wake-meter.js');
  const source = context.createMediaStreamSource(stream);
  const meter = new AudioWorkletNode(context, 'quin-wake-meter', { channelCount: 1 });
  const tracks = stream.getAudioTracks();
  let enabled = false;
  let waiting = false;
  let epoch = 0;
  let checking = false;
  let queued;
  let timer;
  let deadline;

  function setEnabled(value, holdoff) {
    if (enabled === value) return;
    enabled = value;
    for (const track of tracks) track.enabled = value;
    meter.port.postMessage({ enabled, epoch: ++epoch, holdoff });
    if (!enabled) {
      queued = undefined;
      waiting = false;
      deadline = undefined;
      clearTimeout(timer);
      if (checking) api.cancelWake().catch(() => {});
    }
  }

  function cancel() {
    setEnabled(false);
    callbacks.idle();
  }

  function expireAt(time) {
    clearTimeout(timer);
    timer = setTimeout(cancel, Math.max(0, time - performance.now()));
  }

  function openListeningWindow() {
    deadline = performance.now() + silenceMs;
    expireAt(deadline);
  }

  function waitForCommand() {
    waiting = true;
    setEnabled(true, 3);
    openListeningWindow();
  }

  async function check(samples) {
    checking = true;
    const attempt = epoch;
    try {
      const wav = await wakeWav(context, samples);
      if (!enabled || attempt !== epoch) return;
      const text = await api.checkWake(wav, waiting);
      if (!enabled || attempt !== epoch) return;
      if (text == null) {
        if (waiting && !queued && deadline !== undefined) expireAt(deadline);
        return;
      }
      if (text) {
        const ending = endConversation.exec(text);
        if (ending) {
          if (ending[1]) callbacks.stop();
          else cancel();
          return;
        }
        setEnabled(false);
        callbacks.command(text);
      } else if (!waiting) {
        waiting = true;
        const confirmation = callbacks.armed(!queued);
        if (confirmation) {
          const paused = ++epoch;
          meter.port.postMessage({ enabled: false, epoch: paused });
          await confirmation.catch(() => {});
          if (!enabled || paused !== epoch) return;
          meter.port.postMessage({ enabled: true, epoch, holdoff: 3 });
        }
        openListeningWindow();
      }
    } catch (error) {
      if (enabled && attempt === epoch) callbacks.error(error);
    } finally {
      checking = false;
      const next = queued;
      queued = undefined;
      if (enabled && next) void check(next);
    }
  }

  meter.port.onmessage = ({ data }) => {
    if (!enabled || data.epoch !== epoch) return;
    if (data.started) {
      if (waiting && deadline !== undefined && performance.now() < deadline) expireAt(deadline + speechGraceMs);
      return;
    }
    if (checking) queued = data.samples;
    else void check(data.samples);
  };
  for (const track of tracks) {
    track.addEventListener('ended', () => callbacks.error(new Error('Se desconectó el micrófono de la activación por voz.')), { once: true });
  }
  meter.addEventListener('processorerror', () => callbacks.error(new Error('Se detuvo el detector de voz.')));
  // The worklet leaves its output silent.
  source.connect(meter).connect(context.destination);
  return {
    setEnabled, waitForCommand, cancel,
    close() {
      setEnabled(false);
      meter.port.close();
      source.disconnect();
      meter.disconnect();
      for (const track of tracks) track.stop();
    },
  };
}
