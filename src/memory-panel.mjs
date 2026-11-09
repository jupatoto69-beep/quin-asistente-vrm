export function initializeMemoryPanel(api, messages) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('memory-dialog');
  const queryInput = byId('memory-query');
  const status = byId('memory-status');
  const list = byId('memory-list');
  const more = byId('memory-more');
  const clear = byId('memory-clear');
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  let busy = false;
  let query = '';
  let next = null;

  async function run(action) {
    if (busy) return;
    busy = true;
    try {
      await action();
    } catch (error) {
      status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
    } finally {
      busy = false;
    }
  }

  function entryNode(entry) {
    const article = document.createElement('article');
    article.className = 'memory-item';
    const timestamp = document.createElement('time');
    timestamp.textContent = date.format(entry.saved_at);
    article.append(timestamp);
    for (const [label, text] of [['Tú', entry.question], ['Pícara', entry.answer]]) {
      const paragraph = document.createElement('p');
      const author = document.createElement('strong');
      author.textContent = label + ' · ';
      paragraph.append(author, document.createTextNode(text));
      article.append(paragraph);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Borrar intercambio';
    remove.addEventListener('click', () => run(async () => {
      await api.removeMemory(entry.id);
      for (const row of messages.querySelectorAll(`[data-memory-id="${entry.id}"]`)) row.remove();
      await load(true);
    }));
    article.append(remove);
    return article;
  }

  async function load(reset) {
    status.textContent = 'Cargando memoria…';
    const result = await api.listMemory(query, reset ? null : next);
    if (reset) list.replaceChildren();
    list.append(...result.entries.map(entryNode));
    next = result.next;
    more.hidden = next === null;
    status.textContent = list.children.length ? '' :
      query ? 'No encontré conversaciones con esa búsqueda.' : 'Aún no hay conversaciones guardadas.';
    clear.disabled = !query && !list.children.length;
  }

  const open = byId('memory-open');
  open.disabled = false;
  open.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    run(() => load(true));
  });
  byId('memory-search').addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      query = queryInput.value.trim();
      await load(true);
    });
  });
  more.addEventListener('click', () => run(() => load(false)));
  clear.addEventListener('click', () => run(async () => {
    if (!window.confirm('¿Borrar todas las conversaciones guardadas en este PC?')) return;
    await api.clearMemory();
    messages.replaceChildren();
    query = queryInput.value = '';
    await load(true);
  }));
}
