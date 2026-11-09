const modes = {
  quiet: { minutes: 16, variation: 8, speaks: false },
  chatty: { minutes: 5, variation: 3, speaks: true },
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

function validCompanionMode(value) {
  return value === 'quiet' || value === 'chatty' ? value : 'off';
}

function companionStarter(index) {
  return Number.isInteger(index) ? starters[index] : undefined;
}

function createCompanion(random = Math.random) {
  let mode = 'off';
  let deck = [];
  let previous;
  let deadline;
  let unanswered = false;

  return {
    setMode(value) {
      mode = validCompanionMode(value);
      deadline = undefined;
      unanswered = false;
    },
    pause() {
      deadline = undefined;
    },
    answered() {
      deadline = undefined;
      unanswered = false;
    },
    tick(now, available) {
      const pace = modes[mode];
      if (!pace || !available) {
        deadline = undefined;
        return;
      }
      deadline ??= now + (pace.minutes + pace.variation * random()) * 60_000 * (unanswered ? 2 : 1);
      if (now < deadline) return;
      deadline = undefined;
      unanswered = true;
      if (!deck.length) deck = starters.map((_, index) => index);
      const choices = deck.filter((index) => index !== previous);
      previous = choices[Math.floor(random() * choices.length)];
      deck.splice(deck.indexOf(previous), 1);
      return { ...starters[previous], id: previous, speaks: pace.speaks };
    },
  };
}

module.exports = { companionStarter, createCompanion, validCompanionMode };
