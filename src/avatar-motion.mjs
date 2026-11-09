const idleGestures = ['hair', 'stretch', 'weightShift', 'glance', 'curiosity', 'oops'];
const tapGestures = ['wave', 'hair', 'curiosity', 'oops'];
const thinkingStates = new Set(['transcribing', 'thinking', 'responding', 'preparing']);

const stances = [
  { leftLift: 0.02, rightLift: -0.03, leftBend: 0.22, rightBend: 0.31, leftElbow: 0.24, rightElbow: 0.35, lean: 0.025 },
  { leftLift: -0.03, rightLift: 0.17, leftBend: 0.21, rightBend: 0.52, leftElbow: 0.22, rightElbow: 0.50, lean: -0.044 },
  { leftLift: 0.12, rightLift: -0.04, leftBend: 0.41, rightBend: 0.21, leftElbow: 0.48, rightElbow: 0.22, lean: 0.043 },
  { leftLift: 0.05, rightLift: 0.09, leftBend: 0.38, rightBend: 0.43, leftElbow: 0.48, rightElbow: 0.43, lean: -0.022 },
];

function ease(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

const delivery = {
  dulce:   { face: 'happy',     weight: 0.24, tilt: 0.05, lift: 0.14, beat: 0.07, gestures: ['explain', 'nod', 'curiosity'] },
  picara:  { face: 'happy',     weight: 0.40, tilt: 0.12, lift: 0.23, beat: 0.12, gestures: ['shrug', 'explain', 'curiosity'] },
  seria:   { face: 'relaxed',   weight: 0.10, tilt: 0.00, lift: 0.04, beat: 0.04, gestures: ['nod', 'settle'] },
  feliz:   { face: 'happy',     weight: 0.64, tilt: 0.04, lift: 0.32, beat: 0.16, gestures: ['open', 'shrug', 'nod'] },
  triste:  { face: 'sad',       weight: 0.52, tilt: -0.06, lift: 0.00, beat: 0.02, gestures: ['settle', 'nod'] },
  enojada: { face: 'angry',     weight: 0.46, tilt: -0.04, lift: 0.12, beat: 0.08, gestures: ['brace', 'explain'] },
  timida:  { face: 'happy',     weight: 0.20, tilt: 0.12, lift: 0.08, beat: 0.03, gestures: ['curiosity', 'settle'] },
};

const gestures = {
  hair: { duration: 4.05, hold: true, arms: true, move(p, a, phase, side) {
    p.reach = { kind: 'hair', strength: a, sweep: ease((phase - 0.31) / 0.38), side };
    p.headZ -= side * a * 0.13;
    p.headX += a * 0.035;
    p.chestZ += side * a * 0.045;
    if (side < 0) p.leftCurl += a * 0.13;
    else p.rightCurl += a * 0.13;
  } },
  stretch: { duration: 4.7, hold: true, arms: true, move(p, a, phase, side) {
    p.reach = { kind: 'stretch', strength: a, sweep: ease((phase - 0.20) / 0.47) };
    p.chestX += a * 0.16;
    p.hipsZ += a * 0.034;
    p.headX -= a * 0.08;
    p.face = 'relaxed';
    p.expression = a * 0.37;
    p.leftCurl *= 1 - a * 0.68;
    p.rightCurl *= 1 - a * 0.68;
    p.heel = { side: side < 0 ? 'left' : 'right', amount: a * 0.16 };
  } },
  weightShift: { duration: 3.6, hold: true, move(p, a, phase, side) {
    p.hipShift += side * a * 0.045;
    p.hipDrop += a * 0.010;
    p.chestZ += side * a * 0.038;
    p.heel = { side: side < 0 ? 'right' : 'left', amount: a * 0.25 };
  } },
  curiosity: { duration: 2.2, move(p, a, phase, side) {
    p.headZ += side * a * 0.18;
    p.headX -= a * 0.07;
    p.chestX -= a * 0.06;
  } },
  glance: { duration: 2.5, move(p, a, phase, side) {
    p.headY += side * a * 0.32;
    p.headX -= a * 0.05;
    p.chestY += side * a * 0.06;
  } },
  settle: { duration: 2.8, move(p, a, phase, side) {
    p.hipsZ += side * a * 0.055;
    p.chestZ -= side * a * 0.075;
    p.leftBend += a * 0.12;
  } },
  oops: { duration: 1.65, arms: true, move(p, a, phase, side) {
    const wobble = Math.sin(phase * Math.PI * 4) * a * (1 - phase);
    p.hipsZ += side * wobble * 0.12;
    p.chestZ -= side * wobble * 0.15;
    p.headZ += side * wobble * 0.18;
    p.leftLift += a * 0.38;
    p.rightLift += a * 0.38;
    p.face = phase < 0.5 ? 'surprised' : 'happy';
    p.expression = a * 0.48;
  } },
  wave: { duration: 1.85, arms: true, move(p, a, phase) {
    p.rightLift += a * 0.79;
    p.rightBend += a * (1.43 + Math.sin(phase * 22) * 0.18);
    p.rightWrist += a * Math.sin(phase * 22) * 0.29;
    p.headZ -= a * 0.10;
    p.face = 'happy';
    p.expression = a * 0.55;
    p.rightCurl *= 1 - a * 0.65;
  } },
  ponder: { duration: 2.65, arms: true, move(p, a, phase, side) {
    p.headX -= a * 0.12;
    p.headY += side * a * 0.14;
    p.rightLift += a * 0.26;
    p.rightBend += a * 0.92;
    p.rightForward += a * 0.31;
  } },
  nod: { duration: 0.85, move(p, a) { p.headX += a * 0.13; } },
  explain: { duration: 1.6, arms: true, move(p, a) {
    p.rightLift += a * 0.30;
    p.rightBend += a * 0.57;
    p.rightForward += a * 0.25;
  } },
  shrug: { duration: 1.35, arms: true, move(p, a, phase, side) {
    p.chestZ += side * a * 0.09;
    p.headZ -= side * a * 0.11;
    p.leftLift += a * 0.33;
    p.rightLift += a * 0.38;
    p.rightBend += a * 0.55;
  } },
  open: { duration: 1.25, arms: true, move(p, a) {
    p.leftLift += a * 0.42;
    p.rightLift += a * 0.42;
    p.leftBend += a * 0.45;
    p.rightBend += a * 0.45;
    p.leftForward += a * 0.12;
    p.rightForward += a * 0.12;
  } },
  brace: { duration: 0.9, arms: true, move(p, a) {
    p.chestX -= a * 0.12;
    p.rightBend += a * 0.44;
    p.headX += a * 0.09;
  } },
};

export function restPose() {
  return {
    hipsY: 0, hipsZ: 0, hipShift: 0, hipDrop: 0, chestX: 0, chestY: 0, chestZ: 0, headX: 0, headY: 0, headZ: 0,
    leftLift: 0, rightLift: 0, leftBend: 0, rightBend: 0, leftForward: 0, rightForward: 0,
    leftElbow: 0, rightElbow: 0, leftWrist: 0, rightWrist: 0, leftCurl: 0, rightCurl: 0,
    face: 'happy', expression: 0, gazeX: 0, gazeY: 0, mouth: 0,
    idleBlend: 0, armGesture: 0, reduced: false,
  };
}

export function createMotion(random = Math.random) {
  let time = 0;
  let mode;
  let since = 0;
  let nextMove = 4;
  let nextStance = 3.5;
  let stance = 0;
  let idleDeck = random() < 0.5 ? ['hair', 'stretch'] : ['stretch', 'hair'];
  let lastGesture;
  let active;
  let tapPending = false;
  let replyUntil = 0;
  let silentReply;
  let voiceBeat = 0;

  function start(name) {
    active = { name, at: time, side: random() < 0.5 ? -1 : 1 };
    lastGesture = name;
  }

  function choose(names) {
    const options = names.filter((name) => name !== lastGesture);
    start(options[Math.floor(random() * options.length)]);
  }

  function chooseIdle() {
    if (!idleDeck.length) idleDeck = [...idleGestures];
    const choices = idleDeck.filter((name) => name !== lastGesture);
    const candidates = choices.length ? choices : idleDeck;
    const name = candidates[Math.floor(random() * candidates.length)];
    idleDeck.splice(idleDeck.indexOf(name), 1);
    start(name);
  }

  function step(now, dt, state, tone, reaction, level, pointer, reduced) {
    time = now;
    const next = state === 'speaking' ? 'speaking'
      : state === 'listening' || state === 'opening' ? 'listening'
      : thinkingStates.has(state) ? 'thinking'
      : now < replyUntil ? 'reply' : 'idle';
    if (next !== mode) {
      mode = next;
      since = now;
      active = undefined;
      nextMove = now + (mode === 'idle' ? 3.2 + random() * 2.1 : 0.30);
      if (mode === 'listening') start('nod');
      if (mode === 'thinking') start('ponder');
    }

    if (active && now >= active.at + gestures[active.name].duration) active = undefined;
    const engaged = mode === 'speaking' || mode === 'reply';
    const activeTone = mode === 'reply' ? silentReply.tone : tone;
    const mood = delivery[activeTone] ?? delivery.dulce;
    const cue = mode === 'reply' ? silentReply.reaction : reaction;
    if (tapPending) {
      if (mode === 'idle') {
        choose(tapGestures);
        nextMove = now + gestures[active.name].duration + 1.8;
      }
      tapPending = false;
    }
    if (!active && now >= nextMove) {
      if (mode === 'idle') {
        chooseIdle();
        nextMove = now + gestures[active.name].duration + 3.0 + random() * 3.0;
      } else if (engaged && (level > 0.08 || mode === 'reply')) {
        choose(mood.gestures);
        nextMove = now + 2.3 + random() * 1.8;
      } else if (mode === 'thinking' && now - since > 4) {
        start('glance');
        nextMove = now + 5.5;
      }
    }

    const p = restPose();
    p.idleBlend = mode === 'idle' ? (reduced ? 0.46 : 0.94) : 0.12;
    p.reduced = reduced;
    const breath = Math.sin(now * 1.85);
    const sway = Math.sin(now * 0.82);
    if (mode === 'idle' && now >= nextStance && !active) {
      stance = (stance + 1 + Math.floor(random() * (stances.length - 1))) % stances.length;
      nextStance = now + 3.4 + random() * 3.1;
    }
    const base = stances[mode === 'idle' ? stance : 0];
    const attention = mode === 'thinking' ? 0.36 : engaged ? 0.56 : 1;
    p.gazeX = pointer.x * attention;
    p.gazeY = pointer.y * attention;
    p.hipsY = sway * 0.03;
    p.hipsZ = base.lean * 0.40;
    p.hipShift = sway * 0.016 + base.lean * 0.20;
    p.chestX = breath * 0.015;
    p.chestY = p.gazeX * 0.045;
    p.chestZ = sway * 0.020 + base.lean;
    p.headY = p.gazeX * 0.25;
    p.headX = p.gazeY * 0.14;
    p.headZ = sway * 0.026;
    p.leftLift = base.leftLift + Math.sin(now * 1.3) * 0.025;
    p.rightLift = base.rightLift + Math.sin(now * 1.12 + 0.6) * 0.023;
    p.leftBend = base.leftBend + breath * 0.04;
    p.rightBend = base.rightBend - sway * 0.04;
    p.leftForward = 0.14;
    p.rightForward = 0.17;
    p.leftElbow = base.leftElbow;
    p.rightElbow = base.rightElbow;
    p.leftWrist = -0.06 + sway * 0.04;
    p.rightWrist = -0.04 - breath * 0.04;
    p.leftCurl = 0.23 + sway * 0.075;
    p.rightCurl = 0.27 - breath * 0.064;
    p.expression = 0.10;

    if (mode === 'listening') {
      p.chestX -= 0.10;
      p.headX -= 0.05;
      p.headZ += 0.12;
    } else if (mode === 'thinking') {
      p.headZ -= 0.12;
      p.headX -= 0.04;
      p.expression = 0.03;
    } else if (engaged) {
      p.face = mood.face;
      p.expression = mood.weight;
      p.headZ += mood.tilt;
      p.leftLift += mood.lift * 0.60;
      p.rightLift += mood.lift;
      p.rightBend += mood.lift * 0.8;
      if (activeTone === 'triste' || activeTone === 'timida') p.headX += 0.10;
      if (cue === 'laugh') p.chestX += voiceBeat * 0.09;
      if (cue === 'sigh') p.headX += 0.07;
      if (cue === 'surprise') p.headX -= 0.07;
    }
    voiceBeat += ((mode === 'speaking' ? level : 0) - voiceBeat) * (1 - Math.exp(-dt * 12));
    if (engaged) {
      p.mouth = voiceBeat;
      p.headX += voiceBeat * mood.beat;
      p.rightLift += voiceBeat * mood.beat;
    }
    if (active) {
      const gesture = gestures[active.name];
      const phase = (now - active.at) / gesture.duration;
      const envelope = gesture.hold ? ease(Math.min(phase / 0.35, (1 - phase) / 0.35)) : Math.sin(phase * Math.PI) ** 2;
      const amount = envelope * (reduced ? 0.25 : 1);
      if (gesture.arms) p.armGesture = amount;
      gesture.move(p, amount, phase, active.side);
    }
    return p;
  }

  return {
    step,
    tap: () => { tapPending = true; },
    reply(tone, reaction) {
      silentReply = { tone, reaction };
      replyUntil = time + 1.65;
    },
  };
}
