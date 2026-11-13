const { wakeCommand } = require('./wake-phrase.cjs');

function fileWords(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function fileRequest(input) {
  const text = (wakeCommand(input) ?? input).trim().replace(/^[¡¿]+/u, '')
    .replace(/^quin[,\s]+/iu, '').replace(/^(?:me )?(?:puedes|podr[ií]as) /iu, '')
    .replace(/(?:,?\s+porfa(?:vor)?|,?\s+por favor)?[.!?…]*$/iu, '');
  if (/\ben (?:internet|la web|linea|google)\b/u.test(fileWords(text))) return;
  const match = /^(abre|abrir|b[uú]sca(?:me|r)?|encuentra(?:me)?|muestra(?:me)?)\s+(?:(?:el|la|los|las|un|una|mis)\s+)?(?:([uú]ltim[oa]|m[aá]s reciente)\s+)?(archivos?|pdf|capturas?(?: de pantalla)?|pantallazos?|documentos?|fotos?|im[aá]genes?|videos?)(?:\s+(.+))?$/iu.exec(text);
  if (!match) return;
  const [, verb, latest, label, tail = ''] = match;
  const kind = fileWords(label);
  const time = /\b(hoy|ayer)\b/u.exec(fileWords(tail))?.[1];
  const downloaded = /\b(?:descargue|descargado|descargada|descargas)\b/u.test(fileWords(tail));
  const query = tail.replace(/\bque (?:descargu[eé]|guard[eé])(?=$|[^\p{L}])/iu, '').replace(/\b(?:en )?descargas\b/iu, '')
    .replace(/\b(?:de )?(?:hoy|ayer)\b/iu, '').trim().replace(/^(?:llamad[oa]|con (?:el )?nombre|sobre|de|del|que se llama)\s+/iu, '').trim();
  if (kind.startsWith('archivo') && !query && !latest && !time && !downloaded) return;
  return { kind, query, time, downloaded, latest: !!latest, open: /^abr/u.test(verb.toLowerCase()) };
}

module.exports = { fileWords, fileRequest };
