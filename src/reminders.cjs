const { wakeCommand } = require('./wake-phrase.cjs');
const { integer, duration } = require('./desktop-actions.cjs');

const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const day = String.raw`(?:pasado ma[nñ]ana|ma[nñ]ana|hoy|(?:el |este )?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|(?:el )?\d{1,2}/\d{1,2}(?:/\d{4})?)`;
const hour = String.raw`(?:\d{1,2}(?::\d{2})?|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|veintiun[oa]|veintid[oó]s|veintitr[eé]s)`;
const clock = String.raw`(?:a las? ${hour}(?: y (?:media|cuarto|\d{1,2}|[a-záéíóú]+(?: y [a-záéíóú]+)?))?(?:\s*(?:[ap]\.?\s*m\.?|de la (?:ma[nñ]ana|tarde|noche)))?|al mediod[ií]a|a medianoche)`;
const relative = String.raw`(?:(?:en|dentro de) (?:[a-záéíóú\d]+ )+?(?:segundos?|minutos?|horas?))`;
const timing = String.raw`(?:${day} ${clock}|${clock} ${day}|${relative}|${clock}|${day})`;
const atStart = new RegExp(`^(${timing})(?:,?\\s+|$)`, 'iu');
const atEnd = new RegExp(`(?:^|,?\\s+)(${timing})$`, 'iu');
const timingOnly = new RegExp(`^${timing}$`, 'iu');
const dayAtStart = new RegExp(`^${day}(?= |$)`, 'iu');
const dayAtEnd = new RegExp(`(?<!de la )\\b${day}$`, 'iu');
const reminderVerb = String.raw`(?:recu[eé]rdame|av[ií]same|pon(?:me)? un recordatorio(?: para)?)`;
const scheduleFirst = new RegExp(`^(${timing}),?\\s+${reminderVerb}\\s+(.+)$`, 'iu');
const taskFirst = new RegExp(`^${reminderVerb}\\s+(.+)$`, 'iu');
const formatter = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function taskText(text) {
  return text.trim().replace(/^[,: ]+|[.!?…]+$/gu, '').replace(/^que\s+/iu, '').trim();
}

function reminderRequest(input) {
  const text = (wakeCommand(input) ?? input).trim().replace(/^[¿¡\s]+|[?!…\s]+$/gu, '')
    .replace(/^quin(?:,\s*|\s+)/iu, '').replace(/(?:,?\s+(?:porfa(?:vor)?|por favor|gracias|quin))[.!]*$/iu, '')
    .replace(/^(?:me )?(?:puedes|podr[ií]as) /iu, '').replace(/\s+/gu, ' ');
  const clean = text.replace(/\.$/u, '');
  const words = fold(clean);
  if (/^(?:(?:dime )?que (?:tengo pendiente|pendientes tengo|notas tengo|recordatorios tengo)|que tengo (?:anotado|por hacer)|(?:muestra(?:me)?|dime|lista) (?:mis |los |las )?(?:pendientes|notas|recordatorios)|mis (?:pendientes|notas|recordatorios))$/u.test(words)) {
    return { kind: 'list', filter: /\bnotas\b|anotado/u.test(words) ? 'note' : /\brecordatorios\b/u.test(words) ? 'reminder' : undefined };
  }
  const done = /^(?:marca(?:r)? (?:como (?:hech[oa]|list[oa]) )?|completa(?:r)? |cancela(?:r)? |quita(?:r)? )(?:(?:el|la) )?(?:pendiente|recordatorio|nota) #?(\d{1,12})(?: como (?:hech[oa]|list[oa]))?$/u.exec(words);
  if (done) return { kind: 'complete', id: Number(done[1]) };
  const note = /^(?:an[oó]ta(?:me|r)?|toma nota(?: de)?|guarda (?:una|esta) nota)\s*[:;,]?\s+(.+)$|^nota:\s*(.+)$/iu.exec(clean);
  if (note) return { kind: 'note', text: taskText(note[1] ?? note[2]) };
  const first = scheduleFirst.exec(clean);
  if (first) return { kind: 'reminder', text: taskText(first[2]), when: first[1] };
  const last = taskFirst.exec(clean);
  if (last) {
    const tail = last[1];
    const start = atStart.exec(tail);
    if (start) return { kind: 'reminder', text: taskText(tail.slice(start[0].length)), when: start[1] };
    const end = atEnd.exec(tail);
    if (!end && /^recu[eé]rdame (?:mi|mis|el|la|los|las)\b/iu.test(clean)) return;
    return end ? { kind: 'reminder', text: taskText(tail.slice(0, end.index)), when: end[1] }
      : { kind: 'reminder', text: taskText(tail) };
  }
  if (timingOnly.test(clean)) return { kind: 'when', when: clean };
}

function clockParts(text) {
  if (text === 'al mediodia') return [12, 0];
  if (text === 'a medianoche') return [0, 0];
  const match = /^a las? (\d{1,2}|[a-z]+)(?::(\d{2})| y ([a-z0-9 ]+?))?(?:\s*([ap])\.?\s*m\.?| de la (manana|tarde|noche))?$/u.exec(text);
  if (!match) return [];
  let hours = integer(match[1]);
  const minutes = match[2] ? Number(match[2]) : match[3] === 'media' ? 30 : match[3] === 'cuarto' ? 15 : match[3] ? integer(match[3]) : 0;
  const period = match[4] ?? (match[5] && (match[5] === 'manana' ? 'a' : 'p'));
  if (!Number.isInteger(hours) || hours > 23 || !Number.isInteger(minutes) || minutes > 59 || period && (hours < 1 || hours > 12)) return [];
  if (period) hours = hours % 12 + (period === 'p' ? 12 : 0);
  return [hours, minutes];
}

function dateParts(label, now) {
  const text = label?.replace(/^(?:el |este )/u, '');
  if (text?.includes('/')) {
    const [d, m, y = now.getFullYear()] = text.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return;
    return date;
  }
  const weekday = weekdays.indexOf(text);
  const offset = weekday >= 0 ? (weekday + 7 - now.getDay()) % 7 : text === 'pasado manana' ? 2 : text === 'manana' ? 1 : 0;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

function reminderTime(phrase = '', now = new Date(), carryDay) {
  const words = fold(phrase.trim());
  const delay = /^(?:en|dentro de) (.+)$/u.exec(words);
  if (delay) {
    const seconds = duration(delay[1]);
    return seconds > 0 && seconds <= 7 * 86400 ? { dueAt: now.getTime() + Math.round(seconds * 1000) } : { invalid: true };
  }
  const match = dayAtStart.exec(words) ?? dayAtEnd.exec(words);
  const label = match?.[0] ?? carryDay;
  const time = match ? (words.slice(0, match.index) + words.slice(match.index + match[0].length)).trim() : words;
  if (!time) return { day: label };
  const [hours, minutes] = clockParts(time);
  const date = dateParts(label, now);
  if (!date || hours === undefined) return { day: label, invalid: true };
  date.setHours(hours, minutes);
  if (date.getTime() <= now.getTime()) {
    if (!label) date.setDate(date.getDate() + 1);
    else if (weekdays.includes(label.replace(/^(?:el |este )/u, ''))) date.setDate(date.getDate() + 7);
    else return { day: label, past: true };
  }
  return { dueAt: date.getTime() };
}

function dueLabel(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const day = date.toDateString() === now.toDateString() ? 'hoy' : date.toDateString() === tomorrow.toDateString() ? 'mañana'
    : 'el ' + formatter.format(date) + (date.getFullYear() === now.getFullYear() ? '' : ' de ' + date.getFullYear());
  const hour = date.getHours();
  return `${day} a la${hour % 12 === 1 ? '' : 's'} ${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

function createReminderAlarm(memory, notify, { now = Date.now, schedule = setTimeout, clear = clearTimeout } = {}) {
  let timer;
  function stop() { clear(timer); timer = undefined; }
  function check() {
    stop();
    const time = now();
    const due = memory.dueReminders(time);
    if (due.length && notify(due)) memory.announceReminders(due.map(({ id }) => id), time);
    const next = memory.nextReminder();
    if (next != null) {
      timer = schedule(check, Math.max(1000, Math.min(next - time, 60_000)));
      timer?.unref?.();
    }
  }
  return { check, stop };
}

module.exports = { reminderRequest, reminderTime, dueLabel, createReminderAlarm };
