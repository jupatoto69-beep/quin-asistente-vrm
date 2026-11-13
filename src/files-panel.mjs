export function createFilesPanel(api, report) {
  const open = document.getElementById('files-open');
  const dialog = document.getElementById('files-dialog');
  const status = document.getElementById('files-status');
  const list = document.getElementById('file-folders');
  const add = document.getElementById('files-add');
  let busy = false;

  async function show(action) {
    if (busy) return;
    busy = true;
    add.disabled = true;
    try {
      const folders = await action();
      list.replaceChildren(...folders.map((path) => {
        const entry = document.createElement('article');
        entry.className = 'memory-item';
        const name = document.createElement('p');
        name.textContent = path;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Quitar carpeta';
        remove.addEventListener('click', () => show(() => api.removeFileFolder(path)));
        entry.append(name, remove);
        return entry;
      }));
      status.textContent = folders.length ? 'Quin busca por nombre en estas carpetas.' : 'Añade las carpetas donde quieras que Quin busque.';
    } catch (error) {
      status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /u, '');
    } finally {
      add.disabled = false;
      busy = false;
    }
  }

  function showFolders() {
    if (!dialog.open) dialog.showModal();
    void show(api.fileFolders);
  }

  open.addEventListener('click', showFolders);
  add.addEventListener('click', () => show(api.addFileFolder));

  function addResults(row, reply) {
    if (!reply.fileSetup && !reply.fileResults?.length) return;
    const results = document.createElement('span');
    results.className = 'file-results';
    if (reply.fileSetup) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Elegir carpetas';
      button.addEventListener('click', showFolders);
      results.append(button);
    }
    for (const item of reply.fileResults ?? []) {
      const line = document.createElement('span');
      const label = document.createElement('span');
      label.textContent = item.name + ' · ' + item.folder;
      line.append(label);
      if (item.canOpen) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Abrir';
        button.setAttribute('aria-label', 'Abrir ' + item.name);
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { await api.openLocalFile(item.id); }
          catch (error) { report(error); }
          finally { button.disabled = false; }
        });
        line.append(button);
      }
      results.append(line);
    }
    row.append(results);
  }

  return { addResults };
}
