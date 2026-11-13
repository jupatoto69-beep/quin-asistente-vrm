const tones = Object.freeze({
  dulce: {
    label: 'Dulce', speed: 0.96, pauses: 0.34, pitch: 35, lift: 25,
    sample: 'Qué bueno que llegaste. ¿Cómo te fue hoy?',
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
const liveSamples = new Set(['dulce', 'picara', 'seria']);
const softVoiceTones = new Set(['dulce', 'picara']);
const wakePhrases = ['dime', 'si', 'te-escucho', 'aja'];
const searchPhrases = ['espera', 'revisar', 'investigar'];

function validTone(value) {
  return typeof value === 'string' && Object.hasOwn(tones, value) ? value : defaultTone;
}

const emoji = /[\p{RGI_Emoji}\p{Emoji_Presentation}[\p{Emoji}&&[\u2600-\u27BF]]][\uFE0E\uFE0F\u200D]*/gv;
const laugh = /\bj([aei])(?:[ ,]*j\1)+j?\b/gi;
const reactionStart = /(?:^|[.!?…])\s*[¡¿]?\s*(uf+|ay|ah)(?=[,!.…?]|$)/i;
const clockNumbers = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
];

function spokenMinute(value) {
  const number = Number(value);
  if (number === 0) return ' en punto';
  if (number === 1) return ' y un minuto';
  if (number < 30) return ' y ' + clockNumbers[number];
  const tens = ['treinta', 'cuarenta', 'cincuenta'][Math.floor(number / 10) - 3];
  const units = number % 10;
  return ' y ' + tens + (units ? ' y ' + clockNumbers[units] : '');
}

function withoutEmoji(text) {
  return text.replace(emoji, ' ');
}

function speechText(text, tone) {
  let spoken = withoutEmoji(text)
    .replace(/^[ \t]*\[[^\]\n]+\]:[ \t]*\S+[^\n]*$/gmu, '')
    .replace(/!?\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/gu, '$1')
    .replace(/\[([^\]\n]+)\]\[[^\]\n]*\]/gu, '$1')
    .replace(/<?(?:https?:\/\/|www\.)[^\s<>«»"]+>?/giu, (url) => /[.!?,;:]$/u.exec(url)?.[0] ?? '')
    .replace(/^[ \t]*~~~[^\n]*$|^[ \t]*\x60{3,}[^\n]*$/gmu, '')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?(?:[ \t]*\|[ \t]*:?-{2,}:?)+[ \t]*\|?[ \t]*$/gmu, '')
    .replace(/^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+)/gmu, '')
    .replace(/(\*\*|__|~~|\x60+)(\S(?:[^\n]*?\S)?)\1/gu, '$2')
    .replace(/(^|[\s(])([*_])(\S(?:[^\n]*?\S)?)\2(?=$|[\s.,!?;:)])/gmu, '$1$3')
    .replace(/^[ \t]*\|([^\n]*?)\|[ \t]*$/gmu, (_, row) => row.split('|').map((cell) => cell.trim()).filter(Boolean).join(', '))
    .replace(/^((?:En [^,\n]+?,? )?(?:es la|son las)) ([1-9]|1[0-2]):([0-5]\d) ([AP]M)\.$/iu, (_, prefix, hour, minutes, period) =>
      prefix + ' ' + (hour === '1' ? 'una' : clockNumbers[Number(hour)]) + spokenMinute(minutes) + (period === 'AM' ? ', a eme.' : ', pe eme.'))
    .replace(laugh, (_, vowel) => `J${vowel.toLowerCase()}, j${vowel.toLowerCase()}`)
    .replace(/[ \t]+/g, ' ').replace(/ +([,.!?;:…])/g, '$1').trim();
  if (softVoiceTones.has(tone)) {
    spoken = spoken.replace(/¡([^!\n]+)!+/gu, (_, phrase) => /[.?…]$/u.test(phrase) ? phrase : phrase + '.')
      .replace(/^ah(?:…|\.{3})(?=\s+\p{L})/iu, 'Ah,');
  }
  if (tone === 'dulce') spoken = spoken.replace(/^(ay|uf)(?:…|\.{3})(?=\s+\p{L})/iu, '$1,');
  return /[\p{L}\p{N}\p{S}]/u.test(spoken) ? spoken : '';
}

function speechReaction(text) {
  if (text.search(laugh) >= 0) return 'laugh';
  const cue = reactionStart.exec(text)?.[1].toLowerCase();
  if (cue) return cue === 'ah' ? 'surprise' : 'sigh';
}

const sentenceBreaks = new Intl.Segmenter('es', { granularity: 'sentence' });
const speechPartLimit = 200;
const maxVoiceText = 16_000;

function speechParts(text) {
  if (!text) return [];
  if (text.length <= speechPartLimit) return [text];
  const parts = [];
  let pending = '';
  for (const { segment } of sentenceBreaks.segment(text)) {
    let sentence = segment.trim();
    if (!sentence) continue;
    if (pending && pending.length + sentence.length + 1 > speechPartLimit) {
      parts.push(pending);
      pending = '';
    }
    while (sentence.length > speechPartLimit) {
      const prefix = sentence.slice(0, speechPartLimit + 1);
      const clause = [...prefix.matchAll(/[,;:…](?=\s)/gu)].at(-1)?.index ?? 0;
      const space = prefix.search(/\s\S*$/u);
      let end = clause >= speechPartLimit / 2 ? clause + 1 : space > 0 ? space : speechPartLimit;
      if (/^[\uDC00-\uDFFF]/u.test(sentence.slice(end))) end--;
      parts.push(sentence.slice(0, end).trimEnd());
      sentence = sentence.slice(end).trimStart();
    }
    if (sentence) pending = pending ? pending + ' ' + sentence : sentence;
  }
  if (pending) parts.push(pending);
  return parts;
}

function voiceStepLimit(text) {
  return text.length > 180 ? 256 : 200;
}

module.exports = { tones, defaultTone, liveSamples, softVoiceTones, wakePhrases, searchPhrases, validTone, withoutEmoji,
  speechText, speechReaction, speechParts, maxVoiceText, voiceStepLimit };
