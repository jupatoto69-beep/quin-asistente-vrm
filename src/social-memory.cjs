function plain(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function cleanNote(text) {
  const value = text.trim().replace(/\s+/g, ' ');
  return value.length <= 320 ? value : value.slice(0, 319).toWellFormed().trimEnd() + '…';
}

function socialWords(text) {
  return plain(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(?:(?:oye|olle|hey) )?quin /u, '');
}

function pausesCompanion(text, invited = false) {
  const words = socialWords(text);
  if (/^dame un rato(?: quin| por favor| porfa)?$/u.test(words)) return true;
  return /^(?:(?:por ahora )?dejame (?:trabajar|concentrarme|un rato|tranquil[oa])|estoy ocupad[oa]|no insistas|silencio|no quiero (?:hablar|charlar) (?:ahora|por ahora)|(?:ya )?me voy|hasta luego|hablamos luego|luego hablamos|dejemoslo aqui)(?: quin| por favor| porfa)?$/u.test(words) ||
    invited && /^(?:ahora no|no (?:gracias|ahora no|mejor luego)|mejor luego|en otro momento|dejalo ahi|no quiero hablar de eso)(?: quin| por favor| porfa)?$/u.test(words);
}

function storyFollowUp(text, related) {
  const words = socialWords(text);
  if (pausesCompanion(text, true)) return 'later';
  if (/^(?:(?:mejor )?(?:luego|despues|manana) te cuento)\b|\b(?:(?:todavia|aun) (?:no|nada|sigue pendiente)|no hay novedades|sigue pendiente|sigue sin)\b/u.test(words)) return 'later';
  if (/^(?:olvida (?:ese|este|el) chisme|cierra (?:esa|esta|la) historia|dejemos ese tema cerrado|ya se resolvio|ya quedo resuelto)$/u.test(words)) return 'close';
  if (/^(?:si|dale|claro|dime|cual|de que chisme hablas|que chisme|cual chisme|que te conte|a que te refieres|recuerdame el chisme)(?: quin)?$/u.test(words)) return 'recap';
  const question = /^[¿?]|[?]$/u.test(text.trim()) || /^(?:que|cual|quien|como|cuanto|donde|cuando|dime|calcula|busca|explica|recuerdas)\b/u.test(words);
  if (!question && (/^(?:si )?(?:al final|resulta que|pues al final|termino con|termino en|ya paso)\b/u.test(words) || related && words.split(' ').length >= 4)) {
    return 'update';
  }
}

const leadStory = /^(?:te tengo un chisme|te cuento algo)(?:\s*[:;,–—-]\s*|\s+)(.+)$/isu;
const later = /^(?:(?:luego|despu[eé]s|ma[ñn]ana) te cuento(?: (?:en qu[eé] qued[oó]|c[oó]mo (?:termin[oó]|termina|sale|me va)|qu[eé] (?:pas[oó]|pasa)|el final))?)[.!?…]*$/iu;

function socialIntent(input, previous = '') {
  const text = input.trim().replace(/^[¿¡]?\s*quin[\s,]+/iu, '');
  const normalized = plain(text).replace(/^[¿¡]+|[?!¿¡.]+$/gu, '').trim();
  if (/^(?:que (?:historias|chismes) (?:tenemos pendientes|pendientes tenemos|quedaron pendientes)|(?:dime|muestrame) (?:las|mis) historias pendientes)$/u.test(normalized)) {
    return { action: 'list', kind: 'story' };
  }
  if (/^(?:retomemos (?:el|ese) chisme|sigamos con (?:el|ese) chisme|volvamos al chisme|recuerdame el chisme pendiente)$/u.test(normalized)) {
    return { action: 'resumeStory' };
  }
  const resume = /^(?:retomemos|sigamos con|volvamos a) lo (?:de\s+|del\s+)(.+)$/iu.exec(text);
  if (resume) return { action: 'resumeStory', topic: resume[1] };
  if (/^(?:que chistes internos (?:tenemos|recuerdas)|(?:dime|muestrame) (?:los|nuestros) chistes internos)$/u.test(normalized)) {
    return { action: 'list', kind: 'joke' };
  }
  if (/^(?:guarda|recuerda) (?:ese|este|el ultimo) chiste(?: como chiste interno)?$/u.test(normalized)) {
    return { action: 'lastJoke' };
  }
  const recall = /^(?:te acuerdas del|recuerdas el) chiste(?: interno)? (?:de\s+|del\s+)(.+)$/iu.exec(text.replace(/^¿/u, ''));
  if (recall) return { action: 'recall', topic: recall[1] };
  const close = /^cierra (?:la )?historia (?:de\s+|del\s+)(.+)$/iu.exec(text);
  if (close) return { action: 'close', topic: close[1] };
  const ending = /^te cuento (?:en qu[eé] qued[oó]|c[oó]mo termin[oó]) lo (?:de\s+|del\s+)([^:]+):\s*\S/iu.exec(text);
  if (ending) return { action: 'close', topic: ending[1] };

  const mark = /^(?:guarda (?:como )?)?(historia pendiente|chiste interno)(?:\s*([:;,–—-])\s*|\s+)(.+)$/isu.exec(text);
  if (mark && (mark[2] || !text.endsWith('?'))) {
    const note = cleanNote(mark[3]);
    if (note) return { action: 'save', kind: plain(mark[1]) === 'chiste interno' ? 'joke' : 'story', text: note };
  }

  const anecdote = leadStory.exec(text);
  const openEnd = /[.!?;,]?\s+(?:(?:luego|despu[eé]s|ma[ñn]ana) te cuento(?: (?:en qu[eé] qued[oó]|c[oó]mo (?:termin[oó]|termina|sale|me va)|qu[eé] (?:pas[oó]|pasa)|el final))?|(?:a[uú]n|todav[ií]a) no s[eé] (?:en qu[eé] qued[oó]|c[oó]mo (?:termin[oó]|termina)|qu[eé] va a pasar))[.!?…]*$/iu;
  const afterIntro = /^(?:te tengo un chisme|te cuento algo)$/u.test(socialWords(previous));
  const candidate = anecdote?.[1] ?? (afterIntro ? text : '');
  if (openEnd.test(candidate)) {
    const story = cleanNote(candidate.replace(openEnd, ''));
    if (story) return { action: 'save', kind: 'story', text: story };
  }
  if (anecdote && !/[?¿]/u.test(candidate) &&
      /\b(?:(?:qued[oó]|est[aá]|sigue) pendiente|(?:todav[ií]a|a[uú]n) no (?:s[eé]|sabemos|se sabe)|estamos esperando|a ver qu[eé] pasa|ma[ñn]ana sabr[eé])\b/iu.test(candidate)) {
    return { action: 'save', kind: 'story', text: cleanNote(candidate) };
  }
  if (later.test(text)) {
    const prior = leadStory.exec(previous.trim().replace(/^[¿¡]?\s*quin[\s,]+/iu, ''))?.[1];
    if (prior && !openEnd.test(prior)) return { action: 'save', kind: 'story', text: cleanNote(prior) };
  }
}

function invitesFollowUp(text) {
  return /^(?:quiero charlar|de que hablamos|que me cuentas|hablemos de algo|(?:hola )?(?:ya volvi|volvi|ya regrese|regrese)(?: quin)?|(?:hoy )?(?:estoy|ando) aburrid[oa](?: hablame de algo| hagamos algo)?)$/u
    .test(socialWords(text));
}

module.exports = { cleanNote, socialWords, invitesFollowUp, pausesCompanion, storyFollowUp, socialIntent };
