import { dance, moveBody, strengthFor } from './avatar-body-moves.mjs';

const idleGestures = ['hair', 'stretch', 'weightShift', 'glance', 'curiosity', 'oops'];
const idleStyles = {
  off: { gestures: idleGestures, wait: 3.2, variation: 2.1, strength: 1 },
  quiet: { gestures: ['hair', 'weightShift', 'glance', 'curiosity'], wait: 6.5, variation: 4.5, strength: 0.68 },
  chatty: { gestures: [...idleGestures, 'ponder', 'wave'], wait: 2.4, variation: 2, strength: 1 },
};
const tapGestures = ['wave', 'hair', 'curiosity', 'oops'];
const thinkingStates = new Set(['transcribing', 'thinking', 'responding', 'preparing', 'looking']);
const reachingGestures = new Set(['point', 'thumb', 'raise', 'hair', 'stretch', 'leg', 'arm', 'dance']);

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
  dance: { duration: 7.8, ramp: 0.105, hold: true, arms: true, move(p, a, phase, side, target, plan) {
    dance(p, a, phase, plan.tempo);
    p.foot.kind = 'dance';
  } },
  crouch: { duration: 3.0, hold: true, move(p, a, phase, side, target, plan) {
    const amount = a * strengthFor(plan.intensity);
    p.hipDrop += amount * 0.21;
    p.hipDepth -= amount * 0.09;
    p.chestX -= amount * 0.28;
    p.headX += amount * 0.11;
    p.leftElbow += amount * 0.38;
    p.rightElbow += amount * 0.38;
  } },
  body: { duration: 2.65, hold: true, move(p, a, phase, side, target, plan) {
    moveBody(p, a, plan);
  } },
  arm: { duration: 3.1, hold: true, arms: true, move(p, a, phase, side, target, plan) {
    p.reach = { kind: 'arm', side, strength: a, direction: plan.direction, extent: strengthFor(plan.intensity) };
  } },
  hands: { duration: 2.8, hold: true, arms: true, move(p, a, phase, side, target, plan) {
    p.handShape = { kind: plan.wiggle ? 'wiggle' : plan.closed ? 'fist' : 'open', strength: a, side, phase };
    if (side <= 0) p.leftBend += 0.57 * a;
    if (side >= 0) p.rightBend += 0.57 * a;
  } },
  leg: { duration: 3.7, move(p, a, phase, side, target, plan) {
    const scale = p.reduced ? 0.48 : 1;
    const support = ease(Math.min(phase / 0.23, (1 - phase) / 0.17)) * scale;
    const amount = ease((phase - 0.15) / 0.25) * ease((0.91 - phase) / 0.26);
    p.hipShift += side * support * 0.083;
    p.hipDrop += support * 0.011;
    p.hipsZ += side * support * 0.036;
    p.chestZ -= side * support * 0.055;
    p.headX += amount * scale * 0.075;
    p.foot = { kind: 'leg', side: side < 0 ? 'left' : 'right', lift: plan.lift * scale,
      forward: plan.forward * scale, amount };
  } },
  point: { duration: 2.75, hold: true, arms: true, move(p, a, phase, side, target) {
    p.reach = { kind: 'point', strength: a, target, side };
    p.headY -= side * a * 0.12;
    if (['arriba', 'memory-open', 'profile-open'].includes(target)) p.headX -= a * 0.08;
    else if (target !== 'izquierda' && target !== 'derecha' && target !== 'cursor') p.headX += a * 0.12;
  } },
  thumb: { duration: 2.5, hold: true, arms: true, move(p, a, phase, side) {
    p.reach = { kind: 'thumb', strength: a, side };
    p.headX += a * 0.07;
    p.face = 'happy';
    p.expression = a * 0.34;
  } },
  raise: { duration: 2.6, hold: true, arms: true, move(p, a, phase, side) {
    p.reach = { kind: 'raise', strength: a, sweep: 0.40, side };
    p.handShape = { kind: 'open', strength: a, side };
  } },
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
    p.handShape = { kind: 'open', strength: a };
  } },
  ponder: { duration: 2.65, arms: true, move(p, a, phase, side) {
    p.headX -= a * 0.12;
    p.headY += side * a * 0.14;
    p.rightLift += a * 0.26;
    p.rightBend += a * 0.92;
    p.rightForward += a * 0.31;
  } },
  nod: { duration: 0.85, move(p, a) { p.headX += a * 0.13; } },
  shake: { duration: 1.2, move(p, a, phase) {
    p.headY += Math.sin(phase * Math.PI * 4) * a * 0.26;
  } },
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
    hipsY: 0, hipsZ: 0, hipShift: 0, hipDrop: 0, hipDepth: 0, chestX: 0, chestY: 0, chestZ: 0, headX: 0, headY: 0, headZ: 0,
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
  let idleStyle = idleStyles.off;
  let lastGesture;
  let active;
  let tapPending = false;
  let handPending;
  let replyUntil = 0;
  let silentReply;
  let voiceBeat = 0;

  function clearGesture(completed = false) {
    active?.finish?.(completed && !!active.visible);
    active = undefined;
  }

  function start(name) {
    clearGesture();
    active = { name, at: time, side: random() < 0.5 ? -1 : 1 };
    lastGesture = name;
  }

  function choose(names) {
    const options = names.filter((name) => name !== lastGesture);
    start(options[Math.floor(random() * options.length)]);
  }

  function chooseIdle() {
    if (!idleDeck.length) idleDeck = [...idleStyle.gestures];
    const choices = idleDeck.filter((name) => name !== lastGesture);
    const candidates = choices.length ? choices : idleDeck;
    const name = candidates[Math.floor(random() * candidates.length)];
    idleDeck.splice(idleDeck.indexOf(name), 1);
    start(name);
    active.ambient = true;
  }

  function idleDelay() {
    return idleStyle.wait + random() * idleStyle.variation;
  }

  function step(now, dt, state, tone, reaction, level, pointer, reduced, companion = 'off') {
    time = now;
    const style = idleStyles[companion] ?? idleStyles.off;
    if (idleStyle !== style) {
      idleStyle = style;
      idleDeck = [];
      if (mode === 'idle') nextMove = now + idleDelay();
    }
    const next = state === 'speaking' ? 'speaking'
      : state === 'listening' || state === 'opening' ? 'listening'
      : thinkingStates.has(state) ? 'thinking'
      : now < replyUntil ? 'reply' : 'idle';
    if (next !== mode) {
      const keepGesture = active?.requested && (next === 'idle' || next === 'reply' || next === 'speaking' || state === 'preparing');
      mode = next;
      since = now;
      if (!keepGesture) clearGesture();
      nextMove = now + (mode === 'idle' ? idleDelay() : 0.30);
      if (mode === 'listening') start('nod');
      if (mode === 'thinking' && !keepGesture) start('ponder');
    }

    if (active && now >= active.at + gestures[active.name].duration) clearGesture(true);
    const engaged = mode === 'speaking' || mode === 'reply';
    const activeTone = mode === 'reply' ? silentReply.tone : tone;
    const mood = delivery[activeTone] ?? delivery.dulce;
    const cue = mode === 'reply' ? silentReply.reaction : reaction;
    if (handPending && (engaged || mode === 'idle')) {
      start(handPending.kind);
      active.requested = true;
      active.target = handPending.target;
      active.side = handPending.side ?? active.side;
      active.plan = handPending.cue;
      active.waitEnd = handPending.waitEnd;
      active.finish = handPending.finish;
      nextMove = now + gestures[active.name].duration + 1.3;
      handPending = undefined;
    }
    if (tapPending) {
      if (mode === 'idle' && !active?.requested) {
        choose(tapGestures);
        nextMove = now + gestures[active.name].duration + 1.8;
      }
      tapPending = false;
    }
    if (!active && now >= nextMove) {
      if (mode === 'idle') {
        chooseIdle();
        nextMove = now + gestures[active.name].duration + (idleStyle === idleStyles.off ? 3.0 + random() * 3.0 : idleDelay());
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
      const ramp = gesture.ramp ?? 0.35;
      const envelope = gesture.hold ? ease(Math.min(phase / ramp, (1 - phase) / ramp)) : Math.sin(phase * Math.PI) ** 2;
      const amount = envelope * (reduced ? 0.25 : 1) * (active.ambient ? idleStyle.strength : 1);
      if (gesture.arms) p.armGesture = amount;
      gesture.move(p, amount, phase, active.side, active.target, active.plan);
    }
    return p;
  }

  return {
    step,
    tap: () => { tapPending = true; },
    gesture(cue, waitEnd = false) {
      handPending?.finish(false);
      return new Promise((resolve) => {
        const queued = { ...cue, cue, finish, waitEnd };
        const timer = setTimeout(() => finish(false), Math.max(5500, gestures[cue.kind].duration * 1000 + 2400));
        function finish(done) {
          clearTimeout(timer);
          if (handPending === queued) handPending = undefined;
          if (active?.finish === finish) active.finish = undefined;
          resolve(done);
        }
        handPending = queued;
      });
    },
    rendered(reached) {
      if (!active?.finish || time - active.at < gestures[active.name].duration * 0.36) return;
      if (!reachingGestures.has(active.name) || reached === active.name) {
        active.visible = true;
        if (!active.waitEnd) active.finish(true);
      }
    },
    reply(tone, reaction) {
      silentReply = { tone, reaction };
      replyUntil = time + 1.65;
    },
  };
}
