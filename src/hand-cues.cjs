const { legRequest } = require('./body-leg.cjs');
const { bodyProgram, bodyKinds } = require('./body-program.cjs');

const handTargets = new Map([
  ['hablar', 'mic'], ['enviar', 'send'], ['memoria', 'memory-open'], ['perfil', 'profile-open'],
  ['cambiar vrm', 'pick'], ['probar voz', 'voice-preview'],
]);
const directions = ['izquierda', 'derecha', 'arriba', 'abajo', 'cursor'];
const targets = new Set([...directions, ...handTargets.values()]);
const gestureKinds = ['point', 'thumb', 'wave', 'stretch', 'hair', 'nod', 'shake', 'raise', 'leg', ...bodyKinds];

function plain(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

const controls = [...handTargets.keys()].join('|');
const namedControl = new RegExp(`^(?:(?:el )?boton (?:de )?)?[«"'“]?(?<name>${controls})[»"'”]?$`);
const controlInstruction = new RegExp(
  `\\b(?:pulsa|presiona|abre|haz clic en) (?:el boton (?:de )?)?(?:[«"'“](?<label>${controls})[»"'”]|(?<word>${controls})(?=[,.!?…]|$))`,
);

function bodyRequest(text) {
  return plain(text).trim().replace(/[\p{P}]+$/gu, '')
    .replace(/^[¿¡]?(?:(?:oye|olle|hey)[, ]+)?(?:quin[, ]+)?[¿¡]?(?:(?:por favor|porfa|(?:me )?puedes|(?:me )?podrias|quiero que|ahora)[, ]+)*/u, '')
    .replace(/(?:,? (?:por favor|porfa|quin|jaja|jeje))+$/u, '').trim();
}

function requestedHandCue(request) {
  const user = bodyRequest(request);
  const sections = user.split(/\s*(?:,\s*(?:(?:y )?(?:luego|despues)\s+)?|\s+y\s+(?:(?:luego|despues)\s+)?|\s+(?:luego|despues)\s+)/);
  if (sections.length > 1) {
    if (sections.length > 3) return null;
    const steps = sections.map(singleCue);
    return steps.every(Boolean) ? { kind: 'sequence', steps } : null;
  }
  return singleCue(user);
}

function singleCue(user) {
  const leg = legRequest(user);
  if (leg) return leg;
  const program = bodyProgram(user);
  if (program) return program;
  const point = /^(?:senalame|senalas?|senales|senalar|indicame|indica|apunta|apuntes|apuntar)(?: con (?:tu |el )?dedo)?(?:\s+(?:al?|hacia|en direccion a))?\s+(.+)/u.exec(user);
  if (point) {
    const target = point[1].replace(/^la /, '');
    const direction = /^(izquierda|derecha|arriba|abajo)$/.exec(target)?.[1];
    if (direction) return { kind: 'point', target: direction };
    if (/^(?:(?:mi|el) )?(?:cursor|mouse|raton)(?: en la pantalla)?$/.test(target)) return { kind: 'point', target: 'cursor' };
    const control = namedControl.exec(target)?.groups.name;
    if (control) return { kind: 'point', target: handTargets.get(control) };
  }
  const thumb = /^(?:(?<verb>haz(?:me)?|hagas|muestrame|muestra|dame|pon|alza|alzar|levanta|levantame|levantar|levantes|sube|subir|saca) )?(?:(?:un|el|tu) )?(?:dedo )?pulgar(?: (?<side>izquierdo|derecho))?(?: (?<up>(?:hacia )?arriba|en alto))?$/.exec(user)?.groups;
  if (thumb && (thumb.verb || thumb.up)) return { kind: 'thumb', side: thumb.side === 'izquierdo' ? -1 : 1 };
  if (/^(?:saluda(?:me)?|saludes|saludar|haz un saludo|despidete) (?:con (?:la |tu )?mano|con los dedos)$/.test(user)) return { kind: 'wave' };
  if (/^(?:estirate|estirarte|estiramiento|estira(?:r)? (?:los|tus) brazos|haz un estiramiento)$/.test(user)) return { kind: 'stretch' };
  if (/^(?:tocate|tocar(?:te)?|acomodate|acomodar(?:te)?|arreglate|arreglar(?:te)?|recogete) (?:el|tu) (?:pelo|cabello)$/.test(user)) return { kind: 'hair' };
  if (/^(?:asiente|asentir)(?: con (?:la|tu) cabeza)?$|^di que si con (?:la|tu) cabeza$/.test(user)) return { kind: 'nod' };
  if (/^(?:niega|negar|di que no) con (?:la|tu) cabeza$/.test(user)) return { kind: 'shake' };
  const arm = /^(?:alza|alzar|levanta|levantar|sube|subir) (?:el|tu) brazo(?: (izquierdo|derecho))?$/.exec(user);
  if (arm) return { kind: 'raise', side: arm[1] === 'izquierdo' ? -1 : 1 };
  return null;
}

function decodeGesture(kind, target) {
  if (!gestureKinds.includes(kind)) return null;
  if (kind === 'point') return targets.has(target) ? { kind, target } : null;
  if (kind === 'thumb' || kind === 'raise') {
    if (target && target !== 'izquierdo' && target !== 'derecho') return null;
    return { kind, side: target === 'izquierdo' ? -1 : 1 };
  }
  return target ? null : { kind };
}

function mightRequestGesture(request) {
  const user = bodyRequest(request);
  return !/\by (?:dime|cuentame|explica|responde|di|lee|escribe|calcula)\b/.test(user) &&
    /^(?:haz(?:me)?|hacer|hagas|pon|deja|manten|mueve(?:me)?|mover|muevas|alza|levanta(?:me|r|s|rme)?|levantes|sube|eleva|flexiona|dobla|saca|muestra(?:me)?|da(?:me)?|senala|senalame|apunta|indica|saluda(?:me)?|estira(?:te)?|toca(?:te)?|acomoda(?:te)?|arregla(?:te)?|asiente|niega|baila(?:r)?|agacha(?:te)?|gira|inclina(?:te)?|abre|cierra|extiende|di que)\b/.test(user) &&
    /\b(?:pulgar|dedos?|deditos?|manos?|brazos?|pies?|piernas?|rodillas?|cabello|pelo|cabeza|torso|cadera|cintura|hombros|gestos?|senas?|saludo|cursor|boton|izquierda|derecha|arriba|abajo|estiramiento|baile|baila|coreografia|sentadilla)\b/.test(user);
}

function mixedGestureRequest(request) {
  const text = request.trim().replace(/^(?:(?:(?:oye|olle|hey)[,\s]+)?quin[,\s]+)?primero[,\s]+/iu, '');
  const separators = /(?:\s*[,;.!?]\s*(?:y\s+)?(?:luego|despu[eé]s)[,\s]+|\s*[,;]\s*|\s+(?:y\s+)?(?:luego|despu[eé]s)[,\s]+|\s+y\s+)/giu;
  const parts = /^(?:(?:me )?(?:puedes|podr[ií]as) )?(?:cu[aá]nt[oa]|qu[eé]|cu[aá]l|c[oó]mo|d[oó]nde|cu[aá]ndo|qui[eé]n|dime|cu[eé]ntame|calcula|explica|resume|responde|lee|busca|investiga|averigua|escribe|enumera|traduce)\b/iu;
  const quotes = [...text.matchAll(/«[^»]*»|“[^”]*”|"[^"\n]*"|\x60[^\x60\n]*\x60/gu)];
  for (const match of text.matchAll(separators)) {
    if (quotes.some((quote) => match.index >= quote.index && match.index < quote.index + quote[0].length)) continue;
    const before = text.slice(0, match.index).trim();
    const after = text.slice(match.index + match[0].length).trim();
    for (const [movement, question, gestureFirst] of [[before, after, true], [after, before, false]]) {
      if (!parts.test(question.replace(/^[¿¡]/u, ''))) continue;
      const cue = requestedHandCue(movement);
      if (cue || mightRequestGesture(movement)) return { movement, question, cue, gestureFirst };
    }
  }
}

function asksAboutBody(request) {
  return /^(?:tienes (?:un )?cuerpo(?: virtual)?|que puedes hacer con tu cuerpo|que movimientos puedes hacer(?: con tu cuerpo)?|que gestos puedes hacer)$/.test(bodyRequest(request));
}

function handCue(request, reply) {
  if (/^(?:no|nunca) (?:me )?(?:senales|apuntes|hagas|saludes)\b/.test(bodyRequest(request))) return null;
  const names = controlInstruction.exec(plain(reply))?.groups;
  if (names) return { kind: 'point', target: handTargets.get(names.label ?? names.word) };
  return null;
}

module.exports = { requestedHandCue, handCue, decodeGesture, mightRequestGesture, mixedGestureRequest, asksAboutBody, bodyRequest,
  gestureKinds, gestureTargets: [...targets, 'izquierdo', 'derecho'] };
