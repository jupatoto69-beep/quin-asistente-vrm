const parts = ['head', 'torso', 'hips', 'shoulders'];
const directions = ['izquierda', 'derecha', 'arriba', 'abajo', 'adelante', 'atras', 'lado'];
const armDirections = ['arriba', 'abajo', 'adelante', 'atras', 'lado'];
const intensities = ['baja', 'media', 'alta'];
const tempos = ['lento', 'normal', 'rapido'];

function intensity(text) {
  if (/\b(?:poco|poquito|suave)\b/.test(text)) return 'baja';
  return /\b(?:mucho|fuerte|bien)\b/.test(text) ? 'alta' : 'media';
}

function bodyProgram(text) {
  const dance = /^(?:baila(?:me|r)?|haz (?:un |una )?(?:baile|coreografia))(?: (un rato|un poco|lento|despacio|rapido|al ritmo))?$/.exec(text);
  if (dance) return { kind: 'dance', tempo: dance[1] === 'rapido' ? 'rapido' : /lento|despacio/.test(dance[1] ?? '') ? 'lento' : 'normal' };
  if (/^(?:agachate|agacharte|haz (?:una )?sentadilla|flexiona (?:las|ambas) rodillas)(?: (un poco|un poquito|suave|mucho))?$/.test(text)) {
    return { kind: 'crouch', intensity: intensity(text) };
  }
  const hand = /^(?<verb>abre|cierra) (?:(?:las|tus|ambas|la|tu) )?manos?(?: (?<side>izquierda|derecha))?$/.exec(text)?.groups;
  if (hand) return { kind: 'hands', side: hand.side === 'izquierda' ? -1 : hand.side === 'derecha' ? 1 : 0, closed: hand.verb === 'cierra' };
  const fingers = /^(?:mueve|agita|flexiona) (?:los|tus) dedos(?: de (?:la|tu) mano (?<side>izquierda|derecha))?$/.exec(text)?.groups;
  if (fingers) return { kind: 'hands', side: fingers.side === 'izquierda' ? -1 : fingers.side === 'derecha' ? 1 : 0, wiggle: true };
  const arm = /^(?<verb>mueve|lleva|extiende|estira|alza|levanta|baja|abre) (?:el|los|tu|tus|ambos|un) brazos?(?: (?<side>izquierdo|derecho))?(?: (?:hacia |a los )?(?<dir>arriba|abajo|adelante|atras|lado|lados))?(?: (un poco|un poquito|mucho|suave))?$/.exec(text)?.groups;
  if (arm && (arm.dir || /^(baja|abre)$/.test(arm.verb) || /brazos/.test(text) && arm.verb !== 'estira')) {
    const dir = arm.dir === 'lados' || arm.verb === 'abre' ? 'lado'
      : arm.dir ?? (arm.verb === 'baja' ? 'abajo' : 'arriba');
    return { kind: 'arm', direction: dir, side: arm.side === 'izquierdo' ? -1 : arm.side === 'derecho' ? 1
      : /\bbrazos\b/.test(text) ? 0 : 1, intensity: intensity(text) };
  }
  const body = /^(?<verb>inclina(?:te|rte)?|gira(?:r)?|mueve|ladea|levanta|encoge|mira)(?: (?:la|el|los|tu|tus) (?<part>cabeza|torso|cintura|cadera|hombros))?(?: (?:hacia (?:la )?|a la )?(?<dir>izquierda|derecha|arriba|abajo|adelante|atras))?(?: (un poco|un poquito|mucho|suave))?$/.exec(text)?.groups;
  if (!body || !(body.dir || body.part === 'hombros')) return null;
  const part = body.part === 'hombros' ? 'shoulders' : /^(?:cadera|cintura)$/.test(body.part ?? '') ? 'hips'
    : body.part === 'torso' || !body.part && /^(?:inclinat|gira)/.test(body.verb) ? 'torso' : 'head';
  return { kind: 'body', part, direction: body.dir ?? 'arriba', intensity: intensity(text), tilt: /^(?:inclin|ladea)/.test(body.verb) };
}

function decodeBody(kind, result) {
  const side = result.target === 'izquierdo' || result.target === 'izquierda' ? -1
    : result.target === 'derecho' || result.target === 'derecha' ? 1
      : result.target === 'ambos' || result.target === 'none' || result.target == null ? 0 : null;
  const strength = intensities.includes(result.intensity) ? result.intensity : 'media';
  if (kind === 'dance') return { kind, tempo: tempos.includes(result.tempo) ? result.tempo : 'normal' };
  if (kind === 'crouch') return { kind, intensity: strength };
  if (kind === 'hands' && side !== null && ['abrir', 'cerrar', 'mover'].includes(result.direction)) {
    return { kind, side, closed: result.direction === 'cerrar', wiggle: result.direction === 'mover' };
  }
  if (kind === 'arm' && side !== null && armDirections.includes(result.direction)) {
    return { kind, side, direction: result.direction, intensity: strength };
  }
  if (kind === 'body' && parts.includes(result.part) && directions.includes(result.direction) && result.direction !== 'lado') {
    return { kind, part: result.part, direction: result.direction, intensity: strength };
  }
  return null;
}

module.exports = { bodyProgram, decodeBody, bodyKinds: ['dance', 'crouch', 'arm', 'hands', 'body'],
  parts, directions: [...directions, 'abrir', 'cerrar', 'mover'], intensities, tempos };
