const { wakeCommand } = require('./wake-phrase.cjs');

const apps = {
  calculadora: 'Calculadora', 'bloc de notas': 'Bloc de notas', notepad: 'Bloc de notas',
  explorador: 'Explorador de archivos', 'explorador de archivos': 'Explorador de archivos',
  configuracion: 'Configuración', ajustes: 'Configuración', spotify: 'Spotify',
};
const numbers = ('cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince ' +
  'dieciseis diecisiete dieciocho diecinueve veinte veintiuno veintidos veintitres veinticuatro veinticinco ' +
  'veintiseis veintisiete veintiocho veintinueve').split(' ');
const tens = 'treinta cuarenta cincuenta sesenta setenta ochenta noventa'.split(' ');
const units = { segundo: 1, minuto: 60, hora: 3600 };

function integer(text) {
  if (/^\d{1,6}$/u.test(text)) return Number(text);
  if (text === 'un' || text === 'una') return 1;
  if (text === 'cien' || text === 'ciento') return 100;
  if (text === 'veintiun' || text === 'veintiuna') return 21;
  const number = numbers.indexOf(text);
  if (number >= 0) return number;
  const [ten, one, extra] = text.split(' y ');
  if (extra !== undefined) return NaN;
  const base = tens.indexOf(ten);
  const digit = one === undefined ? 0 : integer(one);
  return base >= 0 && digit >= 0 && digit < 10 && (one === undefined || digit > 0) ? 30 + 10 * base + digit : NaN;
}

function duration(text) {
  let rest = text;
  let seconds = 0;
  let previousUnit = Infinity;
  while (rest) {
    const part = /^([a-z0-9., ]+?) (segundo|minuto|hora)s?(?=$| )/u.exec(rest);
    if (!part) return NaN;
    const unit = units[part[2]];
    const count = /^medi[oa]$/u.test(part[1]) ? 0.5 : integer(part[1]);
    if (!(count > 0) || unit >= previousUnit) return NaN;
    seconds += count * unit;
    rest = rest.slice(part[0].length).trim();
    if (/^y medi[oa]$/u.test(rest)) return seconds + unit / 2;
    rest = rest.replace(/^y /u, '');
    previousUnit = unit;
  }
  return seconds;
}

function timerRequest(seconds) {
  return seconds >= 1 && seconds <= 86400 ? { kind: 'timer-set', seconds } : { kind: 'timer-duration' };
}

function desktopRequest(input, awaitingDuration = false) {
  const text = (wakeCommand(input) ?? input).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\s+/gu, ' ').trim().replace(/^[¡¿\s]+|[.!?…\s]+$/gu, '')
    .replace(/^quin(?:,\s*|\s+)/u, '').replace(/^(?:porfa(?:vor)?|por favor),?\s+/u, '')
    .replace(/(?:,?\s+(?:porfa(?:vor)?|por favor|gracias|quin))+[.!?…]*$/u, '')
    .replace(/^(?:me )?(?:puedes hacerme el favor de |podrias? |puedes? )/u, '');

  const timer = /^(?:pon(?:me|er|erme)?|programa(?:me|r|rme)?|inicia(?:r)?|crea(?:r)?|activa(?:r)?|ajusta(?:r)?) (?:(?:un|el) )?(?:temporizador|cuenta regresiva)(?: (?:de |por |para |en |a )?(.+))?$/u.exec(text);
  if (timer) return timerRequest(timer[1] ? duration(timer[1]) : NaN);
  if (awaitingDuration) {
    const seconds = duration(text);
    if (seconds > 0) return timerRequest(seconds);
  }
  const fragment = /^con (?:un |el )?temporizador (?:de |por |para )?(.+)$/u.exec(text);
  if (fragment) {
    const seconds = duration(fragment[1]);
    if (seconds >= 1 && seconds <= 86400) return { kind: 'timer-unclear', seconds };
  }
  if (/^(?:cancela(?:r)?|deten(?:er)?|quita(?:r)?|borra(?:r)?) (?:el |mi |un )?(?:temporizador|cuenta regresiva)$/u.test(text)) return { kind: 'timer-cancel' };
  if (/^(?:cancela(?:r)?|deten(?:er)?|quita(?:r)?|borra(?:r)?) (?:todos (?:los |mis )?)?temporizadores$/u.test(text)) return { kind: 'timer-cancel-all' };
  if (/^(?:(?:lista|muestra|dime) (?:mis |los )?temporizadores(?: activos)?|(?:dime )?que temporizadores (?:hay|tengo)|(?:dime )?cuanto(?: tiempo)? (?:queda|falta|le queda|le falta) (?:del|al|para el) temporizador)$/u.test(text)) return { kind: 'timer-status' };
  if (/^(?:dime )?cuanto(?: tiempo)? (?:queda|falta)$/u.test(text)) return { kind: 'timer-followup' };

  const opening = /^(?:abre(?:me)?|abrir(?:me)?|inicia(?:r)?|lanzar?) (?:(?:el|la) )?(?:(aplicacion|app) )?(.+)$/u.exec(text);
  if (opening) {
    const name = apps[opening[2]];
    if (Object.hasOwn(apps, opening[2])) return { kind: 'open', name };
    if (opening[1]) return { kind: 'app-list' };
  }
  if (/^(?:que (?:apps|aplicaciones) puedes abrir|(?:dime|muestra) (?:las )?(?:apps|aplicaciones) que puedes abrir)$/u.test(text)) return { kind: 'app-list' };

  const playback = /^(pausa(?:r)?|deten(?:er)?|para(?:r)?|reanuda(?:r)?|continua(?:r)?|reproduce|reproducir) (?:(?:la|mi|el) )?(musica|reproduccion|audio|spotify)$/u.exec(text);
  if (playback) return { kind: /^(?:pausa|deten|para)/u.test(playback[1]) ? 'pause' : 'play',
    target: playback[2] === 'spotify' ? 'spotify' : undefined };
  if (/^(?:siguiente cancion|(?:salta|pasa) (?:a )?(?:la )?siguiente (?:cancion|pista))$/u.test(text)) return { kind: 'next' };
  if (/^(?:cancion anterior|(?:vuelve|regresa) (?:a )?(?:la )?(?:cancion|pista) anterior)$/u.test(text)) return { kind: 'previous' };

  const level = /^(?:pon(?:er)?|deja(?:r)?|ajusta(?:r)?|cambia(?:r)?|baja(?:r)?|sube|subir) (?:el )?volumen (?:del (?:pc|sistema) )?(?:al? |en |a un )(.+?)(?: ?%| por ciento)?$/u.exec(text);
  if (level) return { kind: 'volume-set', level: integer(level[1]) };
  if (/^(?:sube|subir|aumenta(?:r)?|baja(?:r)?|reduce|reducir) (?:un poco )?(?:el )?volumen(?: (?:del (?:pc|sistema)|un poco))?$/u.test(text)) {
    return { kind: /^(?:baja|reduce|reducir)/u.test(text) ? 'volume-down' : 'volume-up' };
  }
  if (/^(?:a cuanto (?:esta|tengo)|cual es|dime) (?:el )?volumen(?: del (?:pc|sistema))?$/u.test(text)) return { kind: 'volume-get' };
}

function durationText(seconds) {
  const parts = Object.entries(units).reverse().flatMap(([name, unit]) => {
    const count = Math.floor(seconds / unit);
    seconds %= unit;
    return count ? [count + ' ' + name + (count === 1 ? '' : 's')] : [];
  });
  return new Intl.ListFormat('es').format(parts);
}

function createDesktopActions({ windows, onTimer, now = Date.now, schedule = setTimeout, clear = clearTimeout }) {
  const timers = new Set();

  function remove(timer) {
    clear(timer.handle);
    timers.delete(timer);
  }

  function checkTimers() {
    for (const timer of timers) {
      if (timer.ends <= now()) expire(timer);
    }
  }

  function expire(timer) {
    if (!timers.has(timer)) return;
    remove(timer);
    onTimer('Terminó tu temporizador de ' + durationText(timer.seconds) + '.');
  }

  async function perform(request) {
    checkTimers();
    switch (request.kind) {
      case 'timer-duration':
        return '¿De cuánto tiempo? Puedes decirme una duración entre un segundo y 24 horas.';
      case 'timer-unclear':
        return '¿Querías iniciar un temporizador? Si es así, di «programa un temporizador de ' + durationText(request.seconds) + '».';
      case 'timer-set': {
        const { seconds } = request;
        if (timers.size >= 10) return 'Ya tienes diez temporizadores. Cancela uno o espera a que termine.';
        const timer = { seconds: Math.round(seconds), ends: now() + Math.round(seconds) * 1000 };
        timer.handle = schedule(() => expire(timer), timer.seconds * 1000);
        timers.add(timer);
        return 'Listo, temporizador de ' + durationText(timer.seconds) + '. Te aviso cuando termine.';
      }
      case 'timer-cancel': {
        const timer = [...timers].at(-1);
        if (!timer) return 'No hay temporizadores activos.';
        const several = timers.size > 1;
        remove(timer);
        return (several ? 'Cancelé el último temporizador, el de ' : 'Cancelé el temporizador de ') + durationText(timer.seconds) + '.';
      }
      case 'timer-cancel-all':
        if (!timers.size) return 'No hay temporizadores activos.';
        for (const timer of timers) remove(timer);
        return 'Cancelé todos los temporizadores.';
      case 'timer-followup':
      case 'timer-status': {
        if (!timers.size) return 'No hay temporizadores activos.';
        const times = [...timers].sort((a, b) => a.ends - b.ends);
        const remaining = (timer) => durationText(Math.max(1, Math.ceil((timer.ends - now()) / 1000)));
        if (times.length === 1) return 'Al temporizador le queda ' + remaining(times[0]) + '.';
        return 'Temporizadores activos. ' + times.map((timer) => 'Al de ' + durationText(timer.seconds) + ' le queda ' + remaining(timer) + '.').join(' ');
      }
      case 'app-list': return 'Puedo abrir Calculadora, Bloc de notas, Explorador de archivos, Configuración y Spotify si está instalado.';
      case 'open':
        try {
          await windows.open(request.name);
          return 'Listo, abrí ' + request.name + '.';
        } catch {
          return 'No pude abrir ' + request.name + ' en Windows.';
        }
      case 'volume-set':
        if (!(request.level >= 0 && request.level <= 100)) return 'Dime un nivel de volumen entre 0 y 100 por ciento.';
        break;
    }

    const replies = { pause: 'Pausé la reproducción.', play: 'Reanudé la reproducción.',
      next: 'Pasé a la siguiente pista.', previous: 'Volví a la pista anterior.' };
    try {
      const result = await windows.audio(request);
      if (Object.hasOwn(replies, request.kind)) {
        if (result === 'no-session') return 'Windows no encontró un reproductor que pueda controlar.';
        if (result === 'already') return request.kind === 'pause' ? 'La reproducción ya está pausada.' : 'La reproducción ya está activa.';
        return result === 'ok' ? replies[request.kind] : 'El reproductor no aceptó ese control.';
      }
      return (request.kind === 'volume-get' ? 'El volumen está al ' : 'Dejé el volumen al ') + result + ' por ciento.';
    } catch {
      return 'No pude controlar el audio de Windows.';
    }
  }

  return { perform, checkTimers, stop() { for (const timer of timers) remove(timer); } };
}

module.exports = { desktopRequest, createDesktopActions, integer, duration };
