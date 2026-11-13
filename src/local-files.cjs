const { opendir, readFile, realpath, lstat } = require('node:fs/promises');
const { join, basename, dirname, extname, relative, isAbsolute, sep } = require('node:path');
const { randomUUID } = require('node:crypto');
const { replaceFile } = require('./preferences.cjs');
const { fileWords } = require('./file-query.cjs');

const documents = new Set(['.pdf', '.txt', '.docx', '.odt', '.xlsx', '.ods', '.pptx', '.odp', '.csv', '.md']);
const pictures = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif']);
const movies = new Set(['.mp4', '.mkv', '.webm', '.mov', '.avi']);
const canOpen = (name) => [documents, pictures, movies].some((set) => set.has(extname(name).toLowerCase()));
const inside = (root, file) => {
  const rel = relative(root, file);
  return !!rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep);
};

function dateRange(time, now) {
  if (!time) return;
  const day = now.getDate() - (time === 'ayer' ? 1 : 0);
  return [new Date(now.getFullYear(), now.getMonth(), day).getTime(), new Date(now.getFullYear(), now.getMonth(), day + 1).getTime()];
}

function fileMatches(name, request) {
  const extension = extname(name).toLowerCase();
  const words = fileWords(name);
  if (request.kind === 'pdf' && extension !== '.pdf') return false;
  if (/^(?:captura|pantallazo)/u.test(request.kind) &&
      (!pictures.has(extension) || !/\b(?:capturas?|pantallazos?|screenshot|screen shot|snip)\b/u.test(words))) return false;
  if (/^(?:foto|imagene|imagen)/u.test(request.kind) && !pictures.has(extension)) return false;
  if (request.kind.startsWith('documento') && !documents.has(extension)) return false;
  if (request.kind.startsWith('video') && !movies.has(extension)) return false;
  return fileWords(request.query).split(' ').every((token) => words.includes(token));
}

function createLocalFiles(directory, openPath) {
  const config = join(directory, 'carpetas.json');
  let roots;
  let hits = new Map();
  let revision = 0;

  async function folders() {
    if (!roots) {
      const saved = await readFile(config, 'utf8').then(JSON.parse).catch(() => []);
      roots ??= (Array.isArray(saved) ? saved : []).filter((path) => typeof path === 'string' && isAbsolute(path)).slice(0, 12);
    }
    return [...roots];
  }

  async function store(next) {
    await replaceFile(config, JSON.stringify(next));
    roots = next;
    revision++;
    hits.clear();
    return folders();
  }

  async function add(path) {
    const list = await folders();
    const root = await realpath(path);
    if (!(await lstat(root)).isDirectory()) throw new Error('Elige una carpeta.');
    if (list.includes(root)) return list;
    if (list.length >= 12) throw new Error('Quita una carpeta de la lista para añadir otra.');
    return store([...list, root]);
  }

  async function remove(path) {
    const list = await folders();
    return list.includes(path) ? store(list.filter((item) => item !== path)) : list;
  }

  async function open(id) {
    const hit = hits.get(id);
    if (!hit || !(await folders()).includes(hit.root) || !canOpen(hit.path)) throw new Error('Elige un archivo compatible de la búsqueda actual.');
    const absolute = await realpath(hit.path);
    if (hits.get(id) !== hit || absolute !== hit.path || !inside(hit.root, absolute) || !(await lstat(absolute)).isFile()) {
      throw new Error('El archivo cambió. Vuelve a buscarlo.');
    }
    const error = await openPath(absolute);
    if (error) throw new Error('Windows no pudo abrir el archivo.');
  }

  async function search(request, now = new Date()) {
    const current = ++revision;
    hits.clear();
    const list = await folders();
    if (!list.length) return { text: 'Elige primero tus carpetas en Archivos. Ahí puedes añadir Descargas o donde guardes tus capturas.', tone: 'dulce', fileSetup: true };
    const end = performance.now() + 5500;
    const range = dateRange(request.time, now);
    const found = [];
    let remaining = 8000;
    let skipped = false;
    const active = () => current === revision && remaining > 0 && performance.now() < end;
    const queue = list.map((root) => ({ root, path: root }));
    const visited = new Set();
    for (let index = 0; index < queue.length && active(); index++) {
      const { root, path } = queue[index];
      try {
        if (visited.has(path) || await realpath(path) !== path) continue;
        visited.add(path);
        const dir = await opendir(path);
        for await (const item of dir) {
          if (!active()) break;
          remaining--;
          const full = join(path, item.name);
          if (item.isDirectory()) queue.push({ root, path: full });
          if (!item.isFile() || !fileMatches(item.name, request)) continue;
          const info = await lstat(full).catch(() => undefined);
          if (!info?.isFile()) continue;
          const time = request.downloaded ? info.birthtimeMs || info.mtimeMs : info.mtimeMs;
          if (range && (time < range[0] || time >= range[1])) continue;
          found.push({ root, path: full, time, name: item.name });
        }
      } catch { skipped = true; }
    }
    if (current !== revision) return { text: 'La lista de carpetas cambió. Repite la búsqueda.', tone: 'dulce' };
    const incomplete = skipped || !active();
    found.sort((a, b) => b.time - a.time || a.path.localeCompare(b.path, 'es'));
    const fileResults = found.slice(0, 6).map((item) => {
      const id = randomUUID();
      hits.set(id, item);
      return { id, name: item.name, folder: join(basename(item.root) || item.root, dirname(relative(item.root, item.path))), canOpen: canOpen(item.path) };
    });
    if (!found.length) return { text: incomplete ? 'No encontré coincidencias en la parte de las carpetas que pude revisar.' : 'No encontré coincidencias en tus carpetas elegidas.', tone: 'dulce' };
    if (!incomplete && request.open && (request.latest || found.length === 1) && fileResults[0].canOpen) {
      try {
        await open(fileResults[0].id);
        return { text: `Abrí ${fileResults[0].name}.`, tone: 'dulce' };
      } catch { return { text: 'Encontré el archivo, pero Windows no pudo abrirlo.', tone: 'seria', fileResults }; }
    }
    const text = incomplete ? 'Estas son las coincidencias en la parte que pude revisar.' : found.length === 1
      ? 'Encontré una coincidencia.' : `Encontré ${found.length} coincidencias. Te muestro las más recientes.`;
    return { text, tone: 'dulce', fileResults };
  }

  return { folders, add, remove, open, search };
}

module.exports = { createLocalFiles };
