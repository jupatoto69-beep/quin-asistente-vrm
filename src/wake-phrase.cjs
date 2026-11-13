const wakeGreetings = String.raw`(?:hola|holi|buenas(?:\s+(?:tardes|noches))?|buenos\s+d[ií]as|qu[eé]\s+m[aá]s)`;
const opening = String.raw`[\s¿¡"«“]*`;
const name = '(?:qu[ií]nn?|queen|k[ií][nm]|keane)';
const nameEnd = String.raw`(?=$|[\s,.!?¡¿:;…–—-])`;
const addressed = new RegExp(String.raw`^(${opening}(?:h?ey|ay|o(?:y|ll)e|${wakeGreetings})[\s,.!:;…–—-]+)${name}${nameEnd}`, 'iu');
const fusedHello = new RegExp(`^${opening}[gh]?ola${name}${nameEnd}`, 'iu');

function normalizeQuin(transcript) {
  return transcript
    .replace(addressed, '$1Quin')
    .replace(fusedHello, 'Hola, Quin')
    .replace(/(,\s*)k[ií]m(?=[.!?…]*\s*$)/iu, '$1Quin');
}

function wakeCommand(transcript) {
  const prefix = addressed.exec(transcript) ?? fusedHello.exec(transcript);
  if (!prefix) {
    // Alternate spellings observed for short, standalone calls.
    return /^[\s¿¡"«“]*(?:h?ey[\s,.!:;…–—-]+quina|ol[eé][\s,.!:;…–—-]+quin)[\s,.!?¡¿:;…–—-]*$/iu.test(transcript) ? '' : null;
  }
  const tail = transcript.slice(prefix[0].length).replace(/^[\s,.:;…–—-]+/u, '').trim();
  return /[\p{L}\p{N}]/u.test(tail) ? tail : '';
}

module.exports = { wakeCommand, normalizeQuin, wakeGreetings };
