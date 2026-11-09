function plain(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function cleanNote(text) {
  const value = text.trim().replace(/\s+/g, ' ');
  return value.length <= 320 ? value : value.slice(0, 319).toWellFormed().trimEnd() + '…';
}

function socialIntent(input, previous = '') {
  const text = input.trim().replace(/^[¿¡]?\s*quin[\s,]+/iu, '');
  const normalized = plain(text).replace(/^[¿¡]+|[?!¿¡.]+$/gu, '').trim();
  if (/^(?:que (?:historias|chismes) (?:tenemos pendientes|pendientes tenemos|quedaron pendientes)|(?:dime|muestrame) (?:las|mis) historias pendientes)$/u.test(normalized)) {
    return { action: 'list', kind: 'story' };
  }
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

  const anecdote = /^te tengo un chisme(?:\s*[:;,–—-]\s*|\s+)(.+)$/isu.exec(text);
  const openEnd = /[.!?;,]?\s+(?:(?:luego|despu[eé]s|ma[ñn]ana) te cuento (?:en qu[eé] qued[oó]|c[oó]mo termin[oó])|(?:a[uú]n|todav[ií]a) no s[eé] (?:en qu[eé] qued[oó]|c[oó]mo termin[oó]))[.!?…]*$/iu;
  const afterIntro = /^(?:quin[\s,]+)?te tengo un chisme[.!¡…\s]*$/u.test(plain(previous).trim());
  const candidate = anecdote?.[1] ?? (afterIntro ? text : '');
  if (openEnd.test(candidate)) {
    const story = cleanNote(candidate.replace(openEnd, ''));
    if (story) return { action: 'save', kind: 'story', text: story };
  }
}

function invitesFollowUp(text) {
  return /^(?:quiero charlar|de que hablamos|que me cuentas|hablemos de algo|(?:hoy )?(?:estoy|ando) aburrid[oa](?: hablame de algo| hagamos algo)?)$/u
    .test(plain(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^quin /u, ''));
}

module.exports = { cleanNote, invitesFollowUp, socialIntent };
