const { desktopCapturer, screen } = require('electron');

function createScreenCapture(getWindow, origin) {
  let panel;

  function setOpen(open) {
    const window = getWindow();
    if (open && !panel) {
      if (window.isMinimized()) window.restore();
      const bounds = window.getBounds();
      panel = { bounds, protected: window.isContentProtected() };
      const work = screen.getDisplayMatching(bounds).workArea;
      const width = Math.min(work.width, 880);
      const height = Math.min(work.height, 760);
      window.setContentProtection(true);
      window.setBounds({
        width, height, x: work.x + Math.round((work.width - width) / 2),
        y: work.y + Math.round((work.height - height) / 2),
      });
      window.focus();
    } else if (!open && panel) {
      const previous = panel;
      panel = undefined;
      window.setBounds(previous.bounds);
      window.setContentProtection(previous.protected);
    }
  }

  async function sources() {
    const current = panel;
    if (!current) throw new Error('Abre «Mira esto» para elegir una fuente.');
    current.grant = undefined;
    const ownId = getWindow().getMediaSourceId();
    const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
    if (panel !== current) return [];
    const available = list.filter((source) => source.id !== ownId);
    current.sources = new Map(available.map((source) => [source.id, source]));
    let number = 0;
    return available.map(({ id, name }) => ({
      id, name: id.startsWith('screen:') ? `Pantalla ${++number}` : name,
    }));
  }

  function authorize(id) {
    const source = panel?.sources?.get(id);
    if (!source) throw new Error('Elige una pantalla o ventana de la lista.');
    panel.grant = { source, expires: Date.now() + 5000 };
  }

  function permitted(contents, url) {
    return !!panel?.grant && panel.grant.expires > Date.now() &&
      contents === getWindow()?.webContents && (url === origin || url === origin + '/');
  }

  function attach(session) {
    session.setDisplayMediaRequestHandler((request, callback) => {
      const contents = getWindow()?.webContents;
      const allowed = request.frame && request.frame === contents?.mainFrame && request.userGesture &&
        request.videoRequested && !request.audioRequested && permitted(contents, request.securityOrigin);
      const source = allowed ? panel.grant.source : undefined;
      if (panel) panel.grant = undefined;
      callback(source ? { video: source } : null);
    });
  }

  return { attach, setOpen, sources, authorize, permitted, isOpen: () => !!panel };
}

module.exports = { createScreenCapture };
