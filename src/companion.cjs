const modes = {
  quiet: { minutes: 16, variation: 8, speaks: false },
  chatty: { minutes: 5, variation: 3, speaks: true },
  gaming: { minutes: 8, variation: 4, speaks: true },
};
const starters = [
  { tone: 'picara', text: 'Uy, pregunta seria. Si un gato te juzga en silencio, ¿cuenta como crítica constructiva?' },
  { tone: 'dulce', text: 'Se me antojó hablar de comida. ¿Qué cosa rica podrías comer tres días seguidos?' },
  { tone: 'picara', text: 'Je, je. Si los objetos de tu cuarto pudieran hablar, ¿cuál tendría el mejor chisme?' },
  { tone: 'dulce', text: 'Hay canciones que se quedan pegadas hasta sin querer. ¿Cuál se te pegó últimamente?' },
  { tone: 'picara', text: 'Si mañana te levantases con un talento absurdo, yo votaría por doblar sábanas ajustables a la primera. ¿Tú cuál escogerías?' },
  { tone: 'dulce', text: 'A veces el mejor plan es el que salió de la nada. ¿Te acuerdas de alguno así?' },
  { tone: 'picara', text: 'Tengo un dilema importante. ¿Las papas fritas que le robas a alguien saben mejor?' },
  { tone: 'dulce', text: 'Si pudieras volver a jugar un juego por primera vez, ¿cuál elegirías?' },
];
const followUps = [
  'Oye, me quedé con la intriga de un chisme que me contaste. ¿En qué quedó?',
  'Me acordé de un chisme que dejamos a medias. Si te provoca, cuéntame cómo terminó.',
  'Se nos quedó un chisme pendiente. ¿Hubo novedades?',
];

const gameLines = [
  { tone: 'picara', text: 'En una pausa se me ocurre el mejor plan de la partida. Lástima que casi siempre sea buscar algo de comer.' },
  { tone: 'dulce', text: 'Por aquí sigo. ¿Cómo va la partida?' },
  { tone: 'picara', text: 'A veces el botón más difícil de encontrar es el de «guardar y dormir».' },
  { tone: 'picara', text: 'Yo sería buena de copiloto. Siempre puedo decir «yo también iba a hacer eso» después.' },
];
const gamingIdleSeconds = 45;

function companionCommand(text) {
  const words = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(?:(?:oye|olle|hey) )?quin /u, '').replace(/ (?:porfa|por favor|quin)$/u, '');
  if (/^(?:acompaname mientras juego|acompaname a jugar|quedate conmigo mientras juego|activa (?:el )?modo partida)$/u.test(words)) return 'gaming';
  if (/^(?:(?:ya )?(?:termine de jugar|deje de jugar|acabe la partida)|desactiva (?:el )?modo partida)$/u.test(words)) return 'off';
}

function validCompanionMode(value) {
  return Object.hasOwn(modes, value) ? value : 'off';
}

function companionStarter(index) {
  return Number.isInteger(index) ? starters[index] : undefined;
}

function storyInvitation(id, kind) {
  if (kind === 'moment') return { tone: 'dulce', text: 'Me acordé de un plan que me contaste. ¿Te provoca retomarlo?', storyId: id };
  return { tone: 'picara', text: followUps[(id - 1) % followUps.length], storyId: id };
}

function createCompanion(random = Math.random) {
  let mode = 'off';
  let deck = [];
  let previous;
  let deadline;
  let waitingForUser = false;
  let pendingOffer;

  return {
    setMode(value) {
      const next = validCompanionMode(value);
      if (mode !== next) { deck = []; previous = undefined; }
      mode = next;
      deadline = undefined;
      waitingForUser = false;
      pendingOffer = undefined;
    },
    pause() {
      deadline = undefined;
    },
    answered(wait = false) {
      deadline = undefined;
      waitingForUser = wait;
      pendingOffer = undefined;
    },
    cancelled(offer) {
      if (pendingOffer !== offer) return;
      pendingOffer = undefined;
      waitingForUser = false;
      deadline = undefined;
    },
    presented(offer) {
      if (pendingOffer === offer) pendingOffer = undefined;
    },
    tick(now, available, idleSeconds = 0) {
      const pace = modes[mode];
      if (!pace || !available || waitingForUser) {
        deadline = undefined;
        return;
      }
      deadline ??= now + (pace.minutes + pace.variation * random()) * 60_000;
      if (now < deadline || mode === 'gaming' && idleSeconds < gamingIdleSeconds) return;
      deadline = undefined;
      waitingForUser = true;
      const lines = mode === 'gaming' ? gameLines : starters;
      if (!deck.length) deck = lines.map((_, index) => index);
      const choices = deck.filter((index) => index !== previous);
      previous = choices[Math.floor(random() * choices.length)];
      deck.splice(deck.indexOf(previous), 1);
      pendingOffer = { ...lines[previous], id: mode === 'gaming' ? undefined : previous, speaks: pace.speaks };
      return pendingOffer;
    },
  };
}

module.exports = { companionStarter, createCompanion, storyInvitation, validCompanionMode, companionCommand, gamingIdleSeconds };
