const tones = Object.freeze({
  dulce: {
    label: 'Dulce', speed: 0.96, pauses: 0.34, pitch: 35, lift: 25,
    sample: 'Hola. Me alegra verte por aquí. Cuéntame, ¿qué quieres hacer hoy?',
  },
  picara: {
    label: 'Pícara', speed: 0.98, pauses: 0.36, pitch: -20, lift: 30,
    sample: 'Mmm… así que volviste. Qué bien. El computador ya se estaba creyendo mi favorito.',
  },
  seria: {
    label: 'Seria', speed: 0.97, pauses: 0.42, pitch: -45, lift: 0,
    sample: 'A ver… primero confirma que la copia abre. Después seguimos con el cambio.',
  },
  feliz: {
    label: 'Feliz', speed: 1.04, pauses: 0.27, pitch: 75, lift: 45,
    sample: '¡Uy, qué buena noticia! Me alegra mucho que te haya salido.',
  },
  triste: {
    label: 'Triste', speed: 0.92, pauses: 0.52, pitch: -45, lift: 5,
    sample: 'Qué pena que haya terminado así. Tómate el tiempo que necesites.',
  },
  enojada: {
    label: 'Enojada', speed: 1.01, pauses: 0.33, pitch: 15, lift: 20,
    sample: 'Eso sí me molesta. Hablemos claro y resolvámoslo.',
  },
  timida: {
    label: 'Tímida', speed: 0.96, pauses: 0.52, pitch: 45, lift: 20,
    sample: 'Mmm… ¿puedo decirte algo? Es que me da un poquito de pena.',
  },
});

const defaultTone = 'dulce';
const liveSamples = new Set(['picara', 'seria']);

function validTone(value) {
  return typeof value === 'string' && Object.hasOwn(tones, value) ? value : defaultTone;
}

const emoji = /[\p{RGI_Emoji}\p{Emoji_Presentation}[\p{Emoji}&&[\u2600-\u27BF]]][\uFE0E\uFE0F\u200D]*/gv;
const laugh = /\bj([aei])(?:[ ,]*j\1)+j?\b/gi;
const reactionStart = /(?:^|[.!?…])\s*[¡¿]?\s*(uf+|ay|ah)(?=[,!.…?]|$)/i;

function speechText(text) {
  const spoken = text.replace(emoji, ' ')
    .replace(laugh, (_, vowel) => `J${vowel.toLowerCase()}, j${vowel.toLowerCase()}`)
    .replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:…])/g, '$1').trim();
  return /[\p{L}\p{N}\p{S}]/u.test(spoken) ? spoken : '';
}

function speechReaction(text) {
  if (text.search(laugh) >= 0) return 'laugh';
  const cue = reactionStart.exec(text)?.[1].toLowerCase();
  if (cue) return cue === 'ah' ? 'surprise' : 'sigh';
}

module.exports = { tones, defaultTone, liveSamples, validTone, speechText, speechReaction };
