const { execFile } = require('node:child_process');
const { join } = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);
const windows = process.env.SystemRoot || 'C:\\Windows';
const powershell = join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const programs = {
  Calculadora: ['System32', 'calc.exe'],
  'Bloc de notas': ['System32', 'notepad.exe'],
  'Explorador de archivos': ['explorer.exe'],
};
const protocols = { 'Configuración': 'ms-settings:', Spotify: 'spotify:' };
const media = new Set(['pause', 'play', 'next', 'previous']);
const volume = new Set(['volume-get', 'volume-up', 'volume-down', 'volume-set']);

function createWindowsDesktop(shell) {
  const controller = new AbortController();

  async function open(name) {
    if (Object.hasOwn(protocols, name)) return shell.openExternal(protocols[name]);
    if (!Object.hasOwn(programs, name)) throw new Error('Aplicación no autorizada.');
    const error = await shell.openPath(join(windows, ...programs[name]));
    if (error) throw new Error(error);
  }

  async function audio({ kind, level, target }) {
    if (!media.has(kind) && !volume.has(kind)) throw new Error('Control no autorizado.');
    const args = ['-NoProfile', '-NonInteractive', '-File', join(__dirname, 'windows-audio.ps1'), '-Action', kind];
    if (kind === 'volume-set') {
      if (!Number.isInteger(level) || level < 0 || level > 100) throw new Error('Nivel de volumen inválido.');
      args.push('-Level', String(level));
    }
    if (media.has(kind) && target === 'spotify') args.push('-Target', 'spotify');
    const { stdout } = await run(powershell, args, {
      windowsHide: true, timeout: 7000, signal: controller.signal, maxBuffer: 16 * 1024,
    });
    const result = stdout.trim();
    if (media.has(kind) && /^(?:ok|already|rejected|no-session)$/u.test(result)) return result;
    if (volume.has(kind) && /^(?:100|[0-9]{1,2})$/u.test(result)) return Number(result);
    throw new Error('Respuesta de audio inválida.');
  }

  return { open, audio, stop: () => controller.abort() };
}

async function captureWindowsFrame({ x, y, width, height }, signal) {
  if (![x, y, width, height].every(Number.isInteger) || width < 1 || height < 1) throw new Error('No pude identificar el área de la pantalla.');
  const args = ['-NoProfile', '-NonInteractive', '-File', join(__dirname, 'windows-screen.ps1'),
    '-Left', String(x), '-Top', String(y), '-Width', String(width), '-Height', String(height)];
  try {
    const { stdout } = await run(powershell, args, { windowsHide: true, encoding: 'buffer', timeout: 10_000, signal, maxBuffer: 4_000_000 });
    if (stdout[0] !== 0xff || stdout[1] !== 0xd8 || stdout.at(-2) !== 0xff || stdout.at(-1) !== 0xd9) throw new Error();
    return Uint8Array.from(stdout);
  } catch {
    signal.throwIfAborted();
    throw new Error('Windows no pudo capturar esa pantalla. Prueba con «Mira esto» para elegir la fuente.');
  }
}

module.exports = { createWindowsDesktop, captureWindowsFrame };
