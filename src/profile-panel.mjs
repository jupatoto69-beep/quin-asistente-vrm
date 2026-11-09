export function initializeProfilePanel(api) {
  const byId = (id) => document.getElementById(id);
  const open = byId('profile-open');
  const dialog = byId('profile-dialog');
  const field = byId('profile-text');
  const save = byId('profile-save');
  const status = byId('profile-status');
  let busy = false;

  open.addEventListener('click', async () => {
    if (busy || dialog.open) return;
    busy = true;
    field.value = '';
    field.disabled = save.disabled = true;
    status.textContent = 'Cargando…';
    dialog.showModal();
    try {
      field.value = await api.getProfile();
      field.disabled = save.disabled = false;
      status.textContent = '';
    } catch {
      status.textContent = 'No pude abrir el perfil local.';
    } finally {
      busy = false;
    }
  });

  byId('profile-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || save.disabled) return;
    busy = true;
    field.disabled = save.disabled = true;
    try {
      await api.saveProfile(field.value);
      status.textContent = field.value.trim() ? 'Perfil guardado.' : 'Perfil eliminado.';
    } catch {
      status.textContent = 'No pude guardar el perfil. Intenta de nuevo cuando Quin termine de responder.';
    } finally {
      busy = false;
      field.disabled = save.disabled = false;
    }
  });
  open.disabled = false;
}
