const { truths, dilemmas, mysteries, premises } = require('./game-cards.cjs');

const decks = { truth: truths, dilemma: dilemmas, mystery: mysteries, story: premises };
const command = {
  truth: /^(?:dos|2) verdades y (?:una|1) mentira$/,
  dilemma: /^(?:un )?dilemas?(?: absurdos?)?$/,
  mystery: /^(?:un )?misterio(?: corto)?$/,
  story: /^(?:una )?historias? por turnos$/,
};
const numbers = ['Uno', 'Dos', 'Tres'];
const labels = {
  1: 0, uno: 0, una: 0, primera: 0, primero: 0, a: 0,
  2: 1, dos: 1, segunda: 1, segundo: 1, b: 1,
  3: 2, tres: 2, tercera: 2, tercero: 2, c: 2,
};
const stop = /^(?:sal(?:ir|gamos)? (?:del|de este) juego|(?:termina(?:r|mos)?|deja(?:r|mos)?|para(?:r|mos)?) (?:el juego|la partida|de jugar|juego)|(?:ya )?no quiero (?:seguir jugando|jugar)(?: mas)?)$/;
const storyLead = /^\s*[¿¡]?(?:(?:(?:oye|olle|hey)[ ,]+)?quin[,\s]+)?(?:mi turno(?: es)?|sigue con|contin[uú]a con)[,:.\s]+(.+)$/isu;
const join = new Intl.ListFormat('es', { type: 'disjunction' });

function plain(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(?:(?:oye|olle|hey) )?quin(?: |$)/, '').replace(/ (?:porfa|por favor|quin)$/, '');
}

function chosenAnswer(words, options = []) {
  const pick = words.replace(/^(?:creo que |yo digo |yo creo que )?/, '')
    .replace(/^(?:elijo |escoge |escojo |me quedo con |prefiero |(?:la mentira|el culpable|la culpable|la respuesta) es |fue |es |digo )/, '')
    .replace(/^(?:la nota|el engranaje) (?:esta|estaba) en /, '')
    .replace(/^(?:la |el )?(?:opcion |numero |cajon |banco (?:de la |del ))?/, '')
    .split(/ porque /, 1)[0].replace(/ (?:(?:saco|tomo) la llave|la (?:saco|tomo))$/, '');
  const named = options.findIndex((option) => option.toLowerCase() === pick);
  if (named >= 0) return named;
  if (Object.hasOwn(labels, pick)) return labels[pick];
  if (/^\d+$/.test(pick)) return Number(pick) - 1;
}

function createGames(random = Math.random) {
  let round;
  const lastCards = new Map();

  function reply(text, tone = 'picara', celebrate = false) {
    return { text, tone, gameActive: !!round && !round.done, celebrate };
  }

  function describe() {
    const { mode, card } = round;
    if (mode === 'truth') {
      const lines = round.order.map((index, position) => numbers[position] + '. ' + card.statements[index]);
      return 'Dos verdades y una mentira. ¿Cuál es la mentira?\n' + lines.join('\n');
    }
    if (mode === 'dilemma') return '¿Qué prefieres?\nOpción A. ' + card.options[0] + '\nOpción B. ' + card.options[1];
    if (mode === 'mystery') return card.setup + ' ' + card.question + ' Puedes pedir una pista.';
    return 'Historia inventada por turnos. ' + card + ' Te toca. Empieza con «Mi turno» y añade lo que pasa.';
  }

  function start(mode) {
    const choices = decks[mode].filter((card) => card !== lastCards.get(mode));
    const card = choices[Math.floor(random() * choices.length)];
    lastCards.set(mode, card);
    round = { mode, card, done: false };
    if (mode === 'truth') {
      round.order = [0, 1, 2];
      for (let i = 2; i > 0; i--) {
        const pick = Math.floor(random() * (i + 1));
        [round.order[i], round.order[pick]] = [round.order[pick], round.order[i]];
      }
    }
    if (mode === 'mystery') round.hint = 0;
    if (mode === 'story') round.turns = [];
    return reply(describe(), mode === 'mystery' ? 'seria' : 'picara');
  }

  function storyPlan(text, closing) {
    const messages = [{ role: 'assistant', content: round.card }, ...round.turns];
    return { story: { messages, text, closing } };
  }

  function finishStory(turn, text, tone) {
    round.done = turn.closing;
    round.turns.push({ role: 'user', content: turn.text }, { role: 'assistant', content: text });
    if (round.turns.length > 10) round.turns.splice(0, 2);
    return reply(text, tone);
  }

  function play(text) {
    const words = plain(text);
    const name = words.replace(/^(?:(?:quiero )?jugar|juguemos|vamos a jugar)(?: (?:a las|a|al))? /, '');
    const mode = Object.keys(command).find((key) => command[key].test(name));
    if (mode) return start(mode);
    if (/^(?:juegos|que juegos (?:tienes|podemos jugar)|quiero jugar|juguemos)$/.test(words)) {
      return reply('Podemos jugar Dos verdades y una mentira, Dilemas absurdos, Historia por turnos o Misterio corto. Dime cuál te provoca.');
    }
    if (stop.test(words)) {
      const playing = round && !round.done;
      round = undefined;
      return reply(playing ? 'Listo, dejamos la partida aquí.' : 'Por ahora no hay una partida abierta.', 'dulce');
    }
    if (/^(?:otra ronda|otra partida|otro misterio|otro dilema)$/.test(words)) {
      if (words === 'otro misterio') return start('mystery');
      if (words === 'otro dilema') return start('dilemma');
      if (round) return start(round.mode);
      return reply('Elige un juego y empezamos.');
    }
    if (!round || round.done) return;
    if (/^(?:repite(?: la (?:pregunta|ronda|historia))?|vuelve al juego|que toca)$/.test(words)) {
      return reply(round.mode === 'story' && round.turns.length ? round.turns.at(-1).content : describe());
    }
    const { card } = round;
    if (round.mode === 'story') {
      if (/^(?:cierra|termina|dale un final a) la historia$/.test(words)) return storyPlan('Dale un final a la historia.', true);
      const continuation = storyLead.exec(text)?.[1]?.trim() ??
        (/^(?:entonces|de repente|en ese momento|luego)\b/.test(words) ? text : undefined);
      if (continuation) return storyPlan(continuation, false);
      if (words === 'mi turno') return reply('Te toca. Dime qué pasa a continuación después de «Mi turno».', 'dulce');
      return;
    }
    if (/^(?:(?:dame|quiero|necesito) )?(?:una |otra )?pista$/.test(words)) {
      if (round.mode !== 'mystery') return reply(round.mode === 'dilemma'
        ? 'Aquí vale la opción que más gracia te dé. ¿A o B?'
        : 'Busca el dato que chirría entre las tres frases. Dime uno, dos o tres.');
      const hint = Math.min(round.hint++, card.hints.length - 1);
      return reply('Pista. ' + card.hints[hint], 'seria');
    }
    const reveal = /^(?:(?:dime|muestrame) )?(?:la )?(?:solucion|respuesta)$|^(?:me rindo|no se)$/.test(words);
    if (reveal && round.mode !== 'dilemma') {
      round.done = true;
      const lead = round.mode === 'truth' ? `La mentira era la número ${round.order.indexOf(card.lie) + 1}.` : 'Ahí va la solución.';
      return reply(lead + ' ' + card.explanation, 'dulce');
    }
    const guess = chosenAnswer(words, round.mode === 'mystery' ? card.options : []);
    if (guess === undefined) return;
    const total = round.mode === 'dilemma' ? 2 : 3;
    if (guess < 0 || guess >= total) return reply(round.mode === 'dilemma'
      ? 'Elige A o B.' : 'Elige uno, dos o tres.');
    if (round.mode === 'dilemma') {
      round.done = true;
      return reply(card.reactions[guess] + ' Si quieres otro, di «Otra ronda».');
    }
    const answer = round.mode === 'truth' ? round.order.indexOf(card.lie) : card.answer;
    if (guess === answer) {
      round.done = true;
      return reply('¡Acertaste! ' + card.explanation + ' Di «Otra ronda» si quieres seguir.', 'feliz', true);
    }
    if (round.mode === 'mystery') {
      return reply(`Uy, por ahí no era. Prueba con ${join.format(card.options.filter((_, index) => index !== guess))}. También puedes pedirme una pista.`);
    }
    return reply('Je, je. Esa sí era verdad. Prueba con otra.');
  }

  return { play, finishStory, storyUnavailable: () => reply('Se me enredó ese turno. La historia sigue abierta. Repite tu aporte cuando quieras.', 'dulce') };
}

module.exports = { createGames };
