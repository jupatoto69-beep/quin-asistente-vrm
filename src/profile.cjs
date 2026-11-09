const { readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { replaceFile } = require('./preferences.cjs');

const maxProfileLength = 24_000;
const contextLimit = 1500;
const identitySection = 'identidad';
const relationshipTerms = new Set(['pareja', 'amigo', 'amiga', 'amigos', 'amigas', 'amistades', 'socio', 'socia']);
const common = new Set([
  'algo', 'como', 'con', 'cual', 'cuales', 'cuando', 'dame', 'del', 'dime', 'donde', 'esta',
  'este', 'estoy', 'hacer', 'hola', 'hoy', 'las', 'llama', 'los', 'mas', 'mis', 'para', 'pero',
  'por', 'puedes', 'que', 'quien', 'quiero', 'quin', 'recuerda', 'recuerdas', 'sabes', 'sobre',
  'tengo', 'todo', 'trabajar', 'tus', 'una', 'uno',
]);

function normalize(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function keywords(text) {
  const words = normalize(text).match(/[\p{L}\p{N}]{2,}/gu) || [];
  return new Set(words.filter((word) => word === 'cv' || word === 'qa' || (word.length >= 3 && !common.has(word))));
}

function createProfile(directory) {
  const path = join(directory, 'perfil.md');

  async function get() {
    try {
      return (await readFile(path, 'utf8')).trim();
    } catch (error) {
      if (error.code === 'ENOENT') return '';
      throw error;
    }
  }

  async function save(text) {
    if (typeof text !== 'string' || text.length > maxProfileLength) {
      throw new Error('El perfil supera el límite de 24 000 caracteres o tiene un formato no válido.');
    }
    const value = text.trim();
    if (value) await replaceFile(path, value + '\n');
    else await rm(path, { force: true });
  }

  async function context(prompt) {
    const text = (await get()).slice(0, maxProfileLength);
    const parts = text.split(/^## +(.+)$/m);
    const sections = [];
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i].trim();
      const body = parts[i + 1].trim();
      if (title && body) sections.push({ tema: title, datos: body });
    }
    if (!sections.length) return text ? [{ tema: 'Perfil', datos: text.slice(0, contextLimit - 60) }] : [];

    const requested = keywords(prompt);
    const core = sections.filter((entry) => normalize(entry.tema) === identitySection);
    const other = sections.filter((entry) => normalize(entry.tema) !== identitySection);
    const relevant = other.map((entry) => {
      const title = keywords(entry.tema);
      const body = keywords(entry.datos);
      let score = 0;
      for (const term of requested) {
        if (title.has(term)) score += relationshipTerms.has(term) ? 12 : 4;
        else if (body.has(term)) score += 1;
      }
      return { entry, score };
    }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 2);

    const selected = [...core, ...relevant.map(({ entry }) => entry)];
    if (/(?:sabes|recuerdas|conoces) (?:algo )?(?:de|sobre) mi\b|\bmi perfil\b/.test(normalize(prompt))) {
      selected.push({ tema: 'Otros temas del perfil', datos: other.map(({ tema }) => tema).join(', ') });
    }

    const result = [];
    let remaining = contextLimit;
    for (const { tema, datos } of selected) {
      const title = tema.slice(0, 100);
      const limit = Math.min(normalize(tema) === identitySection ? 220 : 520, remaining - title.length - 28);
      if (limit < 32) break;
      const split = datos.lastIndexOf(' ', limit - 1);
      const excerpt = datos.length > limit ? datos.slice(0, split > limit / 2 ? split : limit - 1) + '…' : datos;
      result.push({ tema: title, datos: excerpt });
      remaining -= title.length + excerpt.length + 28;
    }
    return result;
  }

  return { get, save, context };
}

module.exports = { createProfile };
