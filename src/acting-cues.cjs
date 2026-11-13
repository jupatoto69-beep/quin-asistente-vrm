const moods = {
  feliz: 'happy', alegre: 'happy', 'muy feliz': 'celebrate', emocionada: 'celebrate', celebra: 'celebrate',
  triste: 'sad', 'muy triste': 'downcast', pensativa: 'think', pensando: 'think', preocupada: 'worried', enojada: 'angry',
  timida: 'shy', coqueta: 'playful', tierna: 'tender', sorprendida: 'surprised', asustada: 'scared',
  confundida: 'confused', sonrojada: 'bashful', frustrada: 'frustrated', aburrida: 'bored',
  cansada: 'yawn', esperando: 'waiting', relajada: 'relaxed', determinada: 'determined',
};

function words(text = '') {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function actingRequest(text) {
  const clean = words(text).replace(/^(?:(?:oye|olle|hey) )?quin /u, '').replace(/ (?:por favor|porfa)$/u, '');
  if (/^(?:bosteza|haz un bostezo)$/u.test(clean)) return 'yawn';
  if (/^(?:manda(?:me)? un beso|lanza un beso)$/u.test(clean)) return 'playful';
  if (/^(?:celebra|haz una celebracion)$/u.test(clean)) return 'celebrate';
  const mood = /^(?:ponte|actua|muestrate|hazte|haz una cara de|haz una pose de|quiero verte) (.+)$/u.exec(clean)?.[1];
  return Object.hasOwn(moods, mood) ? moods[mood] : undefined;
}

function replyActing(request, reply, tone, reaction) {
  const user = words(request);
  const spoken = words(reply);
  if (/^(?:lo logre|aprobe el|me ascendieron|gane el|salio perfecto|funciono por fin|por fin lo logre)\b/u.test(user)) return 'celebrate';
  if (/^(?:me da miedo|estoy preocupad[oa]|me preocupa|estoy asustad[oa])\b/u.test(user)) return 'worried';
  if (/^(?:estoy triste|me siento triste|ando triste|fallecio|se murio|hoy fallecio)\b/u.test(user)) return 'sad';
  if (/^(?:que linda|que bonita|que preciosa|me encanta tu sonrisa|te ves (?:linda|bonita|preciosa))\b/u.test(user)) return 'bashful';
  if (/^(?:no entendi|no te entendi|como asi|a que te refieres)\b/u.test(user)) return 'confused';
  if (/^(?:no pude comprobar|no pude encontrar|se me enredo|no pude completar)\b/u.test(spoken)) return 'frustrated';
  if (reaction === 'surprise') return 'surprised';
  if (reaction === 'laugh' && tone !== 'seria') return 'playful';
  return { feliz: 'happy', triste: 'sad', enojada: 'angry', timida: 'shy' }[tone];
}

module.exports = { actingRequest, replyActing };
