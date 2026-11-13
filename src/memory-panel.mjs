const categories = { gusto: 'Gustos', persona: 'Personas', proyecto: 'Proyectos', otro: 'Otros' };
const noteLabels = { story: 'Historia pendiente', joke: 'Chiste interno', moment: 'Momento' };
const noteActions = { story: 'Cerrar historia', joke: 'Quitar chiste interno', moment: 'Quitar de Momentos' };

export function initializeMemoryPanel(api, messages, startTemporary) {
  const byId = (id) => document.getElementById(id);
  const dialog = byId('memory-dialog');
  const kindInput = byId('memory-kind');
  const queryInput = byId('memory-query');
  const status = byId('memory-status');
  const list = byId('memory-list');
  const more = byId('memory-more');
  const clear = byId('memory-clear');
  const factActions = byId('memory-fact-actions');
  const addFact = byId('memory-fact-add');
  const editor = byId('memory-fact-editor');
  const category = byId('memory-fact-category');
  const label = byId('memory-fact-label');
  const value = byId('memory-fact-value');
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  let busy = false;
  let query = '';
  let next = null;
  let editingId;
  let refreshPending = false;

  async function run(action) {
    if (busy) return;
    busy = true;
    kindInput.disabled = true;
    addFact.disabled = true;
    try {
      await action();
    } catch (error) {
      status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
    } finally {
      busy = false;
      kindInput.disabled = false;
      addFact.disabled = false;
      if (refreshPending) {
        refreshPending = false;
        refreshLearned();
      }
    }
  }

  function refreshLearned() {
    if (!dialog.open || !editor.hidden) return;
    if (busy) refreshPending = true;
    else void run(() => load(true));
  }

  function openEditor(entry = {}) {
    editingId = entry.id;
    category.value = entry.category ?? 'otro';
    label.value = entry.label ?? '';
    value.value = entry.value ?? '';
    editor.hidden = false;
    (editingId ? value : label).focus();
  }

  function factNode(entry) {
    const article = document.createElement('article');
    article.className = 'memory-item';
    const heading = document.createElement('strong');
    heading.textContent = entry.label;
    const group = document.createElement('p');
    group.className = 'hint';
    group.textContent = categories[entry.category] + (entry.automatic ? ' · Aprendido en conversación' : '');
    const detail = document.createElement('p');
    detail.textContent = entry.value;
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Editar dato';
    edit.addEventListener('click', () => { if (!busy) openEditor(entry); });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Borrar dato';
    remove.addEventListener('click', () => run(async () => {
      if (!window.confirm('¿Borrar «' + entry.label + '» de los datos guardados?')) return;
      await api.removeMemoryFact(entry.id);
      if (editingId === entry.id) editor.hidden = true;
      await load(true);
    }));
    article.append(heading, group, detail, edit, remove);
    return article;
  }

  function entryNode(entry) {
    const article = document.createElement('article');
    article.className = 'memory-item';
    const timestamp = document.createElement('time');
    timestamp.textContent = date.format(entry.saved_at);
    article.append(timestamp);
    if (entry.kind) {
      const note = document.createElement('p');
      const label = document.createElement('strong');
      label.textContent = noteLabels[entry.kind] + ' · ';
      note.append(label, document.createTextNode(entry.note_text));
      article.append(note);
      if (entry.note_outcome) {
        const outcome = document.createElement('p');
        const title = document.createElement('strong');
        title.textContent = 'Cómo terminó · ';
        outcome.append(title, document.createTextNode(entry.note_outcome));
        article.append(outcome);
      }
    }
    for (const [label, text] of [['Tú', entry.question], [entry.interrupted ? 'Quin (interrumpida)' : 'Quin', entry.answer]]) {
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
    const promote = document.createElement('button');
    promote.type = 'button';
    promote.textContent = 'Guardar como dato';
    promote.addEventListener('click', () => run(async () => {
      kindInput.value = 'facts';
      query = queryInput.value = '';
      await load(true);
      openEditor({ value: entry.question.slice(0, 500).toWellFormed() });
    }));
    article.append(promote);
    if (entry.kind) {
      const removeNote = document.createElement('button');
      removeNote.type = 'button';
      removeNote.textContent = noteActions[entry.kind];
      removeNote.addEventListener('click', () => run(async () => {
        await api.removeNote(entry.id);
        await load(true);
      }));
      article.append(removeNote);
    }
    return article;
  }

  async function load(reset) {
    status.textContent = 'Cargando memoria…';
    const kind = kindInput.value || null;
    const showingFacts = kind === 'facts';
    factActions.hidden = !showingFacts;
    const result = await api.listMemory(query, reset ? null : next, kind);
    if (reset) list.replaceChildren();
    list.append(...result.entries.map(showingFacts ? factNode : entryNode));
    next = result.next;
    more.hidden = next === null;
    status.textContent = list.children.length ? '' :
      showingFacts ? (query ? 'No encontré datos con esa búsqueda.' : 'Aún no hay datos personales guardados aquí.') :
        query ? 'No encontré conversaciones con esa búsqueda.' :
        kind === 'moment' ? 'Aún no hay momentos guardados.' :
          kind === 'story' ? 'Aún no hay historias pendientes.' :
          kind === 'joke' ? 'Aún no hay chistes internos.' : 'Aún no hay conversaciones guardadas.';
    clear.disabled = !kind && !query && !list.children.length;
  }

  const open = byId('memory-open');
  open.disabled = false;
  open.addEventListener('click', () => {
    editor.hidden = true;
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
  kindInput.addEventListener('change', () => run(() => {
    editor.hidden = true;
    return load(true);
  }));
  api.onMemoryLearned(refreshLearned);
  addFact.addEventListener('click', () => openEditor());
  byId('memory-fact-cancel').addEventListener('click', () => { editor.hidden = true; });
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    run(async () => {
      await api.saveMemoryFact({ id: editingId, category: category.value, label: label.value, value: value.value });
      editor.hidden = true;
      query = queryInput.value = '';
      await load(true);
      status.textContent = 'Dato guardado.';
    });
  });
  byId('memory-profile').addEventListener('click', () => {
    dialog.close();
    byId('profile-open').click();
  });
  byId('memory-temporary').addEventListener('click', () => {
    dialog.close();
    startTemporary();
  });
  more.addEventListener('click', () => run(() => load(false)));
  clear.addEventListener('click', () => run(async () => {
    if (!window.confirm('¿Borrar todas las conversaciones, historias, chistes y datos guardados en Memoria?')) return;
    await api.clearMemory();
    messages.replaceChildren();
    query = queryInput.value = '';
    editor.hidden = true;
    await load(true);
  }));
}
