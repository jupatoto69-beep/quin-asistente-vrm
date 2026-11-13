const { app, BrowserWindow, dialog, globalShortcut, ipcMain, net, powerMonitor, protocol, screen, session, shell } = require('electron');
const { existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServices } = require('./services.cjs');
const { createDesktopActions } = require('./desktop-actions.cjs');
const { createWindowsDesktop } = require('./windows-desktop.cjs');
const { createReminderAlarm } = require('./reminders.cjs');
const { createLocalFiles } = require('./local-files.cjs');
const { createPreferences } = require('./preferences.cjs');
const { createProfile } = require('./profile.cjs');
const { createAppearanceCatalog } = require('./appearance.cjs');
const { tones, liveSamples, wakePhrases, searchPhrases, maxVoiceText } = require('./voice.cjs');
const { wakeCommand } = require('./wake-phrase.cjs');
const { createScreenCapture } = require('./screen-capture.cjs');
const { validImage } = require('./vision.cjs');
const { screenCommand } = require('./screen-command.cjs');
const { publicUrl } = require('./web-search.cjs');

const root = join(__dirname, '..');
const appIcon = join(root, 'assets', 'quin-icono-uwu.ico');
if (process.platform === 'win32') app.setAppUserModelId('Quin.AsistenteVRM');
const windows = createWindowsDesktop(shell);
const desktop = createDesktopActions({ windows, onTimer(text) {
  if (window && !window.isDestroyed()) window.webContents.send('desktop:timer', text);
  shell.beep();
} });
const origin = 'app://asistente';
const page = origin + '/';
const shortcut = 'Ctrl+Alt+V';
const resources = new Map([
  ['/', 'src/index.html'],
  ['/style.css', 'src/style.css'],
  ['/renderer.js', 'dist/renderer.js'],
  ['/wake-meter.js', 'src/wake-meter.js'],
  ['/avatar.vrm', 'assets/avatar.vrm'],
  ['/movimiento/idle.vrma', 'assets/movimiento/idle.vrma'],
  ['/movimiento/idle-3.vrma', 'assets/movimiento/idle-3.vrma'],
  ['/movimiento/idle-4.vrma', 'assets/movimiento/idle-4.vrma'],
  ['/movimiento/idle-talking-6.vrma', 'assets/movimiento/idle-talking-6.vrma'],
  ['/movimiento/idle-talking-7.vrma', 'assets/movimiento/idle-talking-7.vrma'],
  ['/muestra-picara.wav', 'assets/voz-picara-muestra.wav'],
  ...wakePhrases.map((name) =>
    [`/activacion/${name}.wav`, `assets/activacion/${name}.wav`]),
  ...searchPhrases.map((name) =>
    [`/busqueda/${name}.wav`, `assets/busqueda/${name}.wav`]),
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
const localFiles = createLocalFiles(app.getPath('userData'), (path) => shell.openPath(path));
const appearanceCatalog = createAppearanceCatalog(app.getPath('userData'));

let window;
let services;
let memory;
let reminders;
let passThrough = false;
let busy = false;
let micUntil = 0;
let wakeJob;
let voiceJob;
let visionJob;
const capture = createScreenCapture(() => window, origin);
const webLinks = new Set();

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

function withSpeech(operation) {
  return onlyOne(async () => {
    const job = voiceJob = new AbortController();
    try {
      return await operation(job.signal);
    } catch (error) {
      if (!job.signal.aborted) throw error;
      return null;
    } finally {
      voiceJob = undefined;
    }
  });
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
  services = createServices(root, memory, personalProfile, desktop);
  services.localFileSearch(localFiles.search);
  services.companionModeChange(preferences.setCompanion);
  const work = screen.getPrimaryDisplay().workArea;
  const width = Math.min(408, work.width);
  const height = Math.min(730, work.height);
  window = new BrowserWindow({
    width, height, x: work.x + work.width - width, y: work.y + work.height - height,
    icon: appIcon,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false, maximizable: false,
    backgroundColor: '#00000000', show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false, spellcheck: false,
      partition: 'asistente-vrm',
    },
  });
  const web = window.webContents;
  if (memory) {
    reminders = createReminderAlarm(memory, (due) => {
      if (web.isDestroyed()) return false;
      web.send('pending:due', due.slice(0, 4), due.length);
      shell.beep();
      return true;
    });
  }
  services.onPendingChanged(() => {
    reminders?.check();
    if (!web.isDestroyed()) web.send('pending:changed');
  });
  services.onMemoryLearned(() => { if (!web.isDestroyed()) web.send('memory:learned'); });
  for (const event of ['minimize', 'hide']) {
    window.on(event, () => web.send('window:companion-visible', false));
  }
  for (const event of ['restore', 'show']) {
    window.on(event, () => web.send('window:companion-visible', true));
  }
  web.on('will-navigate', (event) => event.preventDefault());
  web.on('will-attach-webview', (event) => event.preventDefault());
  web.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  await window.loadURL(page);
  reminders?.check();
}

function resumeReminders() {
  desktop.checkTimers();
  reminders?.check();
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
    powerMonitor.on('resume', resumeReminders);
    const profile = session.fromPartition('asistente-vrm');
    capture.attach(profile);
    profile.protocol.handle('app', (request) => {
      const url = new URL(request.url);
      if (url.host === 'asistente' && url.pathname === '/avatar-personal.vrm' &&
          existsSync(preferences.avatarPath)) {
        return net.fetch(pathToFileURL(preferences.avatarPath).href);
      }
      const path = url.host === 'asistente' && resources.get(url.pathname);
      return path ? net.fetch(pathToFileURL(join(root, path)).href) : new Response(null, { status: 404 });
    });
    profile.setPermissionCheckHandler((contents, permission, url, details) => permission === 'display-capture'
      ? capture.permitted(contents, url)
      : audioPermission(contents, permission, url, details.mediaType === 'audio'));
    profile.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permission === 'display-capture' ? capture.permitted(contents, details.requestingUrl)
        : audioPermission(contents, permission, details.requestingUrl,
          details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
    });
    addHandler('assistant:ready', () => services.ready);
    addHandler('companion:story', async () =>
      await preferences.getCompanion() === 'off' ? undefined : services.companionStory());
    addHandler('companion:presented', (id) => onlyOne(() => services.presentedStory(validMemoryId(id))));
    addHandler('companion:idle', async () => await preferences.getCompanion() === 'gaming' ? powerMonitor.getSystemIdleTime() : 0);
    addHandler('files:folders', localFiles.folders);
    addHandler('files:add-folder', () => onlyOne(async () => {
      const picked = await dialog.showOpenDialog(window, { title: 'Elige una carpeta para buscar archivos', properties: ['openDirectory'], defaultPath: app.getPath('downloads') });
      return picked.canceled ? localFiles.folders() : localFiles.add(picked.filePaths[0]);
    }));
    addHandler('files:remove-folder', (path) => onlyOne(() => localFiles.remove(validText(path, 4096))));
    addHandler('files:open', (id) => onlyOne(() => localFiles.open(validText(id, 60))));
    function registerSources(reply) {
      for (const source of reply.sources ?? []) {
        webLinks.add(source.url);
        if (webLinks.size > 100) webLinks.delete(webLinks.values().next().value);
      }
      return reply;
    }
    addHandler('assistant:chat', (input, sender) => onlyOne(async () => {
      const emit = (channel, data) => { if (!sender.isDestroyed()) sender.send(channel, data); };
      try {
        const reply = await services.chat(validText(input?.text, 1200), (chunk) => emit('assistant:reply-chunk', chunk),
          Array.isArray(input?.body) ? input.body : [], appearanceCatalog.current(input?.avatarId), input?.view, input?.starter,
          { enabled: await preferences.getWeb(), onSearch: () => emit('assistant:web-search') });
        return registerSources(reply);
      } finally {
        emit('memory:scope', services.memoryScope());
      }
    }));
    addHandler('assistant:open-source', (url) => {
      if (typeof url !== 'string' || !webLinks.has(url) || !publicUrl(url)) throw new Error('Este enlace no pertenece a una búsqueda de Quin.');
      return shell.openExternal(url);
    });
    addHandler('assistant:gesture-result', (input) => onlyOne(async () =>
      registerSources(await services.confirmGesture(input?.id, input?.performed))));
    addHandler('vision:panel', (enabled) => {
      if (enabled === true) {
        if (busy) throw new Error('Espera a que Quin termine su respuesta.');
        if (passThrough) togglePassThrough();
      } else {
        visionJob?.abort();
      }
      capture.setOpen(enabled === true);
    });
    addHandler('vision:sources', capture.sources);
    addHandler('vision:authorize', capture.authorize);
    addHandler('vision:quick-capture', (input) => onlyOne(() => {
      if (!services.ready.vision || screenCommand(validText(input, 1200)) === undefined) throw new Error('Di «Mira mi pantalla» para capturarla.');
      return capture.quickFrame();
    }));
    addHandler('vision:look', (input) => onlyOne(async () => {
      if (!capture.isOpen()) throw new Error('Abre «Mira esto» antes de analizar un recorte.');
      const question = validText(input?.question, 500);
      const image = validImage(input?.image);
      const job = visionJob = new AbortController();
      try {
        return await services.look(question, image, job.signal);
      } catch (error) {
        if (!job.signal.aborted) throw error;
        return null;
      } finally {
        visionJob = undefined;
      }
    }));
    addHandler('assistant:speak', (input) => withSpeech((signal) => services.speak(validText(input?.text, 2500), input?.tone, signal)));
    addHandler('assistant:speak-stream', (input, sender) => withSpeech(async (signal) => {
      const result = await services.speakStream(validText(input?.text, maxVoiceText), input?.tone, (chunk) => {
        if (!signal.aborted && !sender.isDestroyed()) sender.send('assistant:voice-chunk', chunk);
      }, signal);
      if (result === null && !signal.aborted && !sender.isDestroyed()) sender.send('assistant:voice-chunk', null);
      return result;
    }));
    addHandler('assistant:interrupt', (id) => {
      voiceJob?.abort();
      services.markInterrupted(id == null ? undefined : validMemoryId(id));
    });
    addHandler('assistant:transcribe', (input) => onlyOne(() => services.transcribe(validWav(input))));
    addHandler('assistant:wake-check', async (input) => {
      if ((busy && !(input?.interrupting === true && voiceJob)) || wakeJob) return null;
      const wav = validWav(input?.wav);
      if (wav.length > 385_000) throw new Error('El fragmento de activación es demasiado largo.');
      const job = wakeJob = new AbortController();
      try {
        const waiting = input.waiting === true;
        const transcript = await services.transcribeWake(wav, waiting, job.signal);
        if (job.signal.aborted) return null;
        const command = wakeCommand(transcript);
        if (!waiting) return command;
        if (!transcript || /^(?:\[[^\]]*\]|\([^)]*\))$/su.test(transcript)) return null;
        return (command ?? transcript) || null;
      } catch (error) {
        if (job.signal.aborted) return null;
        throw error;
      } finally {
        wakeJob = undefined;
      }
    });
    addHandler('assistant:wake-cancel', () => { wakeJob?.abort(); });
    addHandler('assistant:microphone', (requested) => {
      micUntil = requested === true && services.ready.transcribe ? Date.now() + 15_000 : 0;
    });
    addHandler('memory:list', (input) => {
      const query = input?.query;
      if (typeof query !== 'string' || query.length > 120) throw new Error('Búsqueda no válida.');
      const before = input.before == null ? null : validMemoryId(input.before);
      const kind = input.kind ?? null;
      if (kind === 'facts') return requireMemory().facts(query.trim(), before);
      if (kind !== null && !['story', 'joke', 'moment'].includes(kind)) throw new Error('Filtro de memoria no válido.');
      return requireMemory().list(query.trim(), before, kind);
    });
    addHandler('memory:save-fact', (input) => onlyOne(() => {
      services.cancelLearning();
      return requireMemory().saveFact(input?.id == null ? null : validMemoryId(input.id), input);
    }));
    addHandler('memory:remove-fact', (id) => onlyOne(() => {
      services.cancelLearning();
      requireMemory().removeFact(validMemoryId(id));
    }));
    addHandler('memory:remove-note', (id) => onlyOne(() => {
      services.cancelLearning();
      requireMemory().removeNote(validMemoryId(id));
    }));
    addHandler('memory:remove', (id) => onlyOne(() => {
      requireMemory().remove(validMemoryId(id));
      services.clearChatContext();
    }));
    addHandler('memory:clear', () => onlyOne(() => {
      requireMemory().clear();
      services.clearChatContext();
    }));
    addHandler('pending:list', () => requireMemory().pendingItems());
    addHandler('pending:complete', (id) => onlyOne(() => services.finishPending(validMemoryId(id))));
    addHandler('profile:get', personalProfile.get);
    addHandler('profile:save', (text) => onlyOne(() => personalProfile.save(text)));
    addHandler('preferences:get-voice', preferences.getVoice);
    addHandler('preferences:get-web', preferences.getWeb);
    addHandler('preferences:set-web', preferences.setWeb);
    addHandler('preferences:get-companion', preferences.getCompanion);
    addHandler('preferences:set-companion', preferences.setCompanion);
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
    powerMonitor.removeListener('resume', resumeReminders);
    reminders?.stop();
    desktop.stop();
    windows.stop();
    services?.stop();
    memory?.close();
  });
}
