import { dueLabel } from './reminders.cjs';

export function initializePendingPanel(api) {
  const open = document.getElementById('pending-open');
  const dialog = document.getElementById('pending-dialog');
  const status = document.getElementById('pending-status');
  const list = document.getElementById('pending-list');
  let revision = 0;

  function showError(error) {
    status.textContent = error.message.replace(/^Error invoking remote method '[^']+': Error: /u, '');
  }

  function itemNode(item) {
    const article = document.createElement('article');
    article.className = 'memory-item';
    const heading = document.createElement('strong');
    heading.textContent = (item.kind === 'note' ? 'Nota' : 'Recordatorio') + ' ' + item.id;
    const body = document.createElement('p');
    body.textContent = item.text;
    article.append(heading, body);
    if (item.dueAt != null) {
      const time = document.createElement('time');
      time.dateTime = new Date(item.dueAt).toISOString();
      time.textContent = (item.dueAt <= Date.now() ? 'Venció ' : '') + dueLabel(item.dueAt);
      article.append(time);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Marcar como hecho';
    done.addEventListener('click', async () => {
      done.disabled = true;
      try {
        await api.completePending(item.id);
        await load();
      } catch (error) {
        showError(error);
        done.disabled = false;
      }
    });
    article.append(done);
    return article;
  }

  async function load() {
    const request = ++revision;
    try {
      const items = await api.listPending();
      if (request !== revision || !dialog.open) return;
      list.replaceChildren(...items.map(itemNode));
      status.textContent = items.length ? '' : 'No tienes pendientes.';
    } catch (error) {
      if (request === revision) showError(error);
    }
  }

  open.disabled = false;
  open.addEventListener('click', () => {
    dialog.showModal();
    void load();
  });
  const refresh = () => { if (dialog.open) void load(); };
  api.onPendingChanged(refresh);
  api.onReminder(refresh);
}
