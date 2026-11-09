const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { replaceFile } = require('./preferences.cjs');

const sampleId = '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2';
const sample = {
  summary: 'Tengo el pelo largo y castaño. Llevo una camiseta blanca, shorts negros y tenis oscuros.',
  hair: 'Tengo el pelo largo y castaño, con el flequillo hacia un lado.',
  eyes: 'Tengo ojos grandes y castaños.',
  clothes: 'Llevo una camiseta blanca holgada, shorts negros y tenis oscuros con suela clara.',
};
const fields = ['summary', 'hair', 'eyes', 'clothes', 'accessories'];
const maxDescription = 500;
const validAvatarId = (id) => typeof id === 'string' && /^[a-f0-9]{64}$/u.test(id);

function createAppearanceCatalog(directory) {
  const path = join(directory, 'apariencia-vrm.json');

  async function read() {
    try {
      const entries = JSON.parse(await readFile(path, 'utf8'));
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) return entries;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return {};
  }

  async function get(id) {
    const entry = (await read())[id] ?? (id === sampleId ? sample : undefined);
    if (typeof entry?.summary !== 'string' || !entry.summary.trim()) return null;
    return Object.fromEntries(fields.filter((key) => typeof entry[key] === 'string' && entry[key].trim())
      .map((key) => [key, entry[key].trim().slice(0, maxDescription)]));
  }

  async function save(id, description) {
    const entries = await read();
    entries[id] = { summary: description };
    await replaceFile(path, JSON.stringify(entries, null, 2) + '\n');
  }

  function current(id) {
    if (!validAvatarId(id)) return;
    return { id, get: () => get(id), save: (description) => save(id, description) };
  }

  return { current };
}

function appearanceTopic(message) {
  const question = message.replace(/^(?:(?:oye |olle |hey |ey )?quin )?(?:y |dime |cuentame |me dices )?/u, '')
    .replace(/(?: porfa(?:vor)?| por favor| quin)$/u, '');
  if (/^(?:como te ves(?: por fuera| desde (?:afuera|fuera)| hoy| ahora)?|como luces(?: hoy| ahora)?|como eres fisicamente|como es tu cuerpo|cual es tu (?:apariencia|aspecto)|describe(?:me)? tu (?:apariencia|aspecto|avatar|cuerpo)|describete(?: fisicamente)?|que aspecto tienes)$/u.test(question)) return 'summary';
  if (/^(?:(?:de )?que color (?:es|tienes) (?:tu |el )?|como (?:es|tienes) (?:tu |el )?|(?:tu |el )?)(?:pelo|cabello)$/u.test(question)) return 'hair';
  if (/^(?:(?:de )?que color (?:son|tienes) (?:tus |los )?|como (?:son|tienes) (?:tus |los )?|(?:tus |los )?)ojos$/u.test(question)) return 'eyes';
  if (/^(?:que (?:ropa|atuendo) (?:llevas|tienes)(?: puest[oa])?|que (?:llevas|tienes) puest[oa]|como (?:vas vestida|estas vestida|te vistes|es tu ropa)|describe(?:me)? tu (?:ropa|atuendo))$/u.test(question)) return 'clothes';
  if (/^(?:que accesorios (?:llevas|tienes|usas)|(?:que|como es tu) gargantilla(?: llevas)?|que (?:es eso que )?tienes (?:en la mejilla|debajo del ojo))$/u.test(question)) return 'accessories';
  if (/\b(?:te ves|tu (?:apariencia|aspecto|atuendo|ropa|pelo|cabello|gargantilla)|tus (?:ojos|accesorios)|que (?:llevas|tienes) puest[oa]|vas vestida|tienes (?:una curita|flequillo|el pelo|el cabello|los ojos))\b/u.test(question)) return 'context';
}

function appearanceUpdate(text) {
  const match = /^\s*(?:quin[\s,]+)?tu apariencia\s*:\s*([\s\S]*)$/iu.exec(text);
  return match ? match[1].trim() : undefined;
}

module.exports = { createAppearanceCatalog, appearanceTopic, appearanceUpdate, maxDescription };
