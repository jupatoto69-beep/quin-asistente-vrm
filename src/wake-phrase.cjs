function wakeCommand(transcript) {
  const prefix = /^[\s¿¡"«“]*(?:h?ey|ay|o(?:y|ll)e)[\s,.!:;…–—-]+(?:qu[ií]nn?|queen|k[ií]n)(?=$|[\s,.!?¡¿:;…–—-])/iu.exec(transcript);
  if (!prefix) {
    // Alternate spellings observed for short, standalone calls.
    return /^[\s¿¡"«“]*(?:h?ey[\s,.!:;…–—-]+quina|ol[eé][\s,.!:;…–—-]+quin)[\s,.!?¡¿:;…–—-]*$/iu.test(transcript) ? '' : null;
  }
  const tail = transcript.slice(prefix[0].length).replace(/^[\s,.:;…–—-]+/u, '').trim();
  return /[\p{L}\p{N}]/u.test(tail) ? tail : '';
}

module.exports = { wakeCommand };
