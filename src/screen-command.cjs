function screenCommand(text) {
  const match = /^\s*[¿¡]?(?:(?:(?:oye|olle|hey)[,.!:\s]+)?(?:quin[n]?|queen|kin|kim|keane)[,.!:\s]+)?[¿¡]?mira\s+(?:mi pantalla(?: completa)?|la pantalla completa)(?=$|[\s,.!?:…])(.*)$/isu.exec(text);
  return match?.[1].replace(/^[\s,.!?:…]+/u, '').trim();
}

module.exports = { screenCommand };
