const { app, BrowserWindow, globalShortcut, ipcMain, net, protocol, screen, session } = require('electron');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServices } = require('./services.cjs');
const { createPreferences } = require('./preferences.cjs');
const { createProfile } = require('./profile.cjs');
const { tones, liveSamples } = require('./voice.cjs');

const root = join(__dirname, '..');
const origin = 'app://asistente';
const page = origin + '/';
const shortcut = 'Ctrl+Alt+V';
const resources = new Map([
  ['/', 'src/index.html'],
  ['/style.css', 'src/style.css'],
  ['/renderer.js', 'dist/renderer.js'],
  ['/avatar.vrm', 'assets/avatar.vrm'],
  ['/movimiento/idle.vrma', 'assets/movimiento/idle.vrma'],
  ['/movimiento/idle-3.vrma', 'assets/movimiento/idle-3.vrma'],
  ['/muestra-picara.wav', 'assets/voz-picara-muestra.wav'],
]);
for (const tone of Object.keys(tones)) {
  if (liveSamples.has(tone)) continue;
  resources.set(`/muestra-${tone}.wav`, `.local/voice-preview/voz-joven-${tone}.wav`);
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true },
}]);
app.setPath('userData', join(root, '.local', 'profile'));
const preferences = createPreferences(app.getPath('userData'));
const personalProfile = createProfile(app.getPath('userData'));

let window;
let services;
let memory;
let passThrough = false;
let busy = false;
let micUntil = 0;

function togglePassThrough() {
  passThrough = !passThrough;
  window.setIgnoreMouseEvents(passThrough, { forward: true });
  window.webContents.send('window:pass-through', passThrough);
  if (!passThrough) globalShortcut.unregister(shortcut);
  return passThrough;
}

function addHandler(channel, operation) {
  ipcMain.handle(channel, (event, argument) => {
    const frame = event.senderFrame;
    if (event.sender !== window?.webContents || !frame || frame.parent || frame.url !== page) {
      throw new Error('Origen no autorizado.');
    }
    return operation(argument, event.sender);
  });
}

function audioPermission(contents, permission, url, audioOnly) {
  return contents === window?.webContents && permission === 'media' && audioOnly &&
    (url === page || url === origin) && Date.now() < micUntil;
}

async function onlyOne(operation) {
  if (busy) throw new Error('Ya hay una solicitud en curso.');
  busy = true;
  try {
    return await operation();
  } finally {
    busy = false;
  }
}

function validText(value, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error('El texto está vacío o supera el límite del prototipo.');
  }
  return value.trim();
}

function validWav(value) {
  if (!(value instanceof Uint8Array) || value.length <= 44 || value.length > 960_044 || value.length % 2) {
    throw new Error('La grabación excede el límite de 30 segundos.');
  }
  const wav = Buffer.from(value);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt32LE(4) !== wav.length - 8 ||
      wav.toString('ascii', 8, 16) !== 'WAVEfmt ' || wav.readUInt32LE(16) !== 16 ||
      wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 16000 ||
      wav.readUInt32LE(28) !== 32000 || wav.readUInt16LE(32) !== 2 || wav.readUInt16LE(34) !== 16 ||
      wav.toString('ascii', 36, 40) !== 'data' || wav.readUInt32LE(40) !== wav.length - 44) {
    throw new Error('La grabación no está en WAV mono PCM de 16 kHz.');
  }
  return wav;
}

async function createWindow() {
  try {
    const profile = app.getPath('userData');
    mkdirSync(profile, { recursive: true });
    memory = require('./memory.cjs').createConversationMemory(join(profile, 'memoria.sqlite'));
  } catch (error) {
    console.warn('No se pudo iniciar la memoria local.', error.code);
  }
  services = createServices(root, memory, personalProfile);
  const work = screen.getPrimaryDisplay().workArea;
  const width = Math.min(408, work.width);
  const height = Math.min(730, work.height);
  window = new BrowserWindow({
    width, height, x: work.x + work.width - width, y: work.y + work.height - height,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, maximizable: false,
    backgroundColor: '#00000000', show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, spellcheck: false,
      partition: 'asistente-vrm',
    },
  });
  const web = window.webContents;
  web.on('will-navigate', (event) => event.preventDefault());
  web.on('will-attach-webview', (event) => event.preventDefault());
  web.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  await window.loadURL(page);
}

function requireMemory() {
  if (!memory) throw new Error('La memoria local no está disponible.');
  return memory;
}

function validMemoryId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Intercambio no válido.');
  return id;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (passThrough) togglePassThrough();
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    const profile = session.fromPartition('asistente-vrm');
    profile.protocol.handle('app', (request) => {
      const url = new URL(request.url);
      if (url.host === 'asistente' && url.pathname === '/avatar-personal.vrm' &&
          existsSync(preferences.avatarPath)) {
        return net.fetch(pathToFileURL(preferences.avatarPath).href);
      }
      const path = url.host === 'asistente' && resources.get(url.pathname);
      return path ? net.fetch(pathToFileURL(join(root, path)).href) : new Response(null, { status: 404 });
    });
    profile.setPermissionCheckHandler((contents, permission, url, details) =>
      audioPermission(contents, permission, url, details.mediaType === 'audio'));
    profile.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(audioPermission(contents, permission, details.requestingUrl,
        details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
    });
    addHandler('assistant:ready', () => services.ready);
    addHandler('assistant:chat', (input, sender) => onlyOne(() => services.chat(validText(input?.text, 1200), (chunk) => {
      if (!sender.isDestroyed()) sender.send('assistant:reply-chunk', chunk);
    }, Array.isArray(input?.body) ? input.body : [])));
    addHandler('assistant:gesture-result', (input) => onlyOne(() => services.confirmGesture(input?.id, input?.performed)));
    addHandler('assistant:speak', (input) => onlyOne(() => services.speak(validText(input?.text, 2500), input?.tone)));
    addHandler('assistant:speak-stream', (input, sender) => onlyOne(async () => {
      const result = await services.speakStream(validText(input?.text, 2500), input?.tone, (chunk) => {
        if (!sender.isDestroyed()) sender.send('assistant:voice-chunk', chunk);
      });
      if (result === null && !sender.isDestroyed()) sender.send('assistant:voice-chunk', null);
      return result;
    }));
    addHandler('assistant:transcribe', (input) => onlyOne(() => services.transcribe(validWav(input))));
    addHandler('assistant:microphone', (requested) => {
      micUntil = requested === true && services.ready.transcribe ? Date.now() + 15_000 : 0;
    });
    addHandler('memory:list', (input) => {
      const query = input?.query;
      if (typeof query !== 'string' || query.length > 120) throw new Error('Búsqueda no válida.');
      const before = input.before == null ? null : validMemoryId(input.before);
      return requireMemory().list(query.trim(), before);
    });
    addHandler('memory:remove', (id) => onlyOne(() => { requireMemory().remove(validMemoryId(id)); }));
    addHandler('memory:clear', () => onlyOne(() => { requireMemory().clear(); }));
    addHandler('profile:get', personalProfile.get);
    addHandler('profile:save', (text) => onlyOne(() => personalProfile.save(text)));
    addHandler('preferences:get-voice', preferences.getVoice);
    addHandler('preferences:set-voice', async (enabled) => {
      await preferences.setVoice(enabled);
      if (enabled) services.warmConversation();
      else if (!busy) services.releaseVoice();
    });
    addHandler('preferences:has-avatar', () => existsSync(preferences.avatarPath));
    addHandler('preferences:save-avatar', preferences.saveAvatar);
    addHandler('preferences:reset-avatar', preferences.resetAvatar);
    addHandler('window:minimize', () => window.minimize());
    addHandler('window:close', () => window.close());
    addHandler('window:pointer', () => {
      if (!window.isVisible() || window.isMinimized()) return null;
      const cursor = screen.getCursorScreenPoint();
      const { x, y, width, height } = window.getContentBounds();
      return {
        x: Math.max(-1, Math.min(2, (cursor.x - x) / width)),
        y: Math.max(-1, Math.min(2, (cursor.y - y) / height)),
      };
    });
    addHandler('window:pass-through', () => {
      if (!passThrough && !globalShortcut.register(shortcut, togglePassThrough)) {
        throw new Error('Ctrl+Alt+V está ocupado. Los clics siguen activos.');
      }
      return togglePassThrough();
    });
    await createWindow();
    if (await preferences.getVoice()) services.warmConversation();
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    services?.stop();
    memory?.close();
  });
}
