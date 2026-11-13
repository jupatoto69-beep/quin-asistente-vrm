const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

function arc(time, begin, peak, end) {
  return time < peak ? ease((time - begin) / (peak - begin)) : ease((end - time) / (end - peak));
}

function body(pose, weight, offsets) {
  for (const [name, value] of Object.entries(offsets)) pose[name] += weight * value;
}

function face(pose, weight, expression, intensity, eyes = 0, mouth = 0) {
  pose.face = expression;
  pose.expression = Math.max(0.05, intensity * weight);
  pose.eyes = eyes * weight;
  pose.expressionMouth = mouth * weight;
}

function hands(pose, weight, side, lead, other) {
  pose.performHands = side < 0 ? [lead, other] : [other, lead];
  pose.armGesture = Math.max(pose.armGesture, weight);
  pose.handStrength = weight;
}

function gaze(pose, weight, x, y) {
  pose.gazeX += (x - pose.gazeX) * weight;
  pose.gazeY += (y - pose.gazeY) * weight;
}

const scenes = {
  happy: [2.5, 0.28, 0.62, (p, w, t, side) => {
    const beat = 0.50 * arc(t, 0.13, 0.32, 0.52) + 0.34 * arc(t, 0.46, 0.64, 0.83);
    body(p, w, { chestX: -0.08 - beat * 0.14, headX: -0.11 + beat * 0.15, headZ: side * 0.12,
      hipDrop: 0.025 + beat * 0.045, hipShift: -side * 0.03 });
    hands(p, w, side, 'joy', 'joySoft');
    face(p, w, 'happy', 0.84, 0.18 + beat * 0.32, 0.18);
  }],
  celebrate: [3.55, 0.45, 0.90, (p, w, t, side) => {
    const windup = arc(t, 0, 0.19, 0.38);
    const flourish = arc(t, 0.20, 0.48, 0.91);
    body(p, w, { hipDrop: windup * 0.13, hipShift: -side * (0.025 + flourish * 0.075),
      hipsZ: -side * 0.07, chestZ: side * 0.12, chestX: 0.11 * flourish,
      headX: -0.14 * flourish, headZ: -side * 0.10 });
    hands(p, w * (0.55 + flourish * 0.45), side, 'high', 'wide');
    face(p, w, 'happy', 0.97, 0.30 + 0.28 * flourish, 0.30 * flourish);
    if (!p.reduced) p.foot = { side: side < 0 ? 'left' : 'right', lift: 0.17 * w, forward: -0.10 * w, amount: flourish };
    p.effect = 'spark';
  }],
  think: [4.7, 0.56, 0.75, (p, w, t, side) => {
    const glance = arc(t, 0.24, 0.57, 0.92);
    body(p, w, { hipShift: -side * 0.052, chestY: side * 0.11, chestZ: side * 0.09,
      headX: 0.10 - 0.20 * glance, headY: side * (0.04 + 0.20 * glance), headZ: -side * 0.16 });
    gaze(p, w, -side * (0.14 + 0.24 * glance), -0.35 * glance);
    hands(p, w, side, 'chin', 'fold');
    face(p, w, 'relaxed', 0.22, 0.07);
    p.effect = 'question';
  }],
  worried: [3.6, 0.40, 0.76, (p, w, t, side) => {
    body(p, w, { hipDrop: 0.06, chestX: -0.17, chestY: side * 0.08,
      headX: 0.11, headY: -side * 0.13, headZ: -side * 0.12 });
    hands(p, w, side, 'nearChest', 'collar');
    gaze(p, w * 0.62, -side * 0.21, 0.16);
    face(p, w, 'sad', 0.57, 0.02, 0.095);
  }],
  sad: [4.65, 0.76, 1.0, (p, w, t, side) => {
    body(p, w, { hipDrop: 0.10, hipDepth: -0.08, hipShift: side * 0.03, chestX: -0.28,
      chestZ: -side * 0.08, headX: 0.28 + 0.11 * arc(t, 0.20, 0.58, 0.95), headY: side * 0.10 });
    gaze(p, w, side * 0.10, 0.63);
    hands(p, w, side, 'lowFold', 'lap');
    face(p, w, 'sad', 0.90, 0.23);
  }],
  downcast: [6.3, 1.02, 1.2, (p, w, t, side) => {
    const exhale = arc(t, 0.26, 0.51, 0.83);
    body(p, w, { hipShift: side * 0.018, hipDrop: p.reduced ? 0.10 : 0.37, hipDepth: -0.23,
      chestX: -0.31 - exhale * 0.07, headX: 0.26 + 0.10 * exhale, headZ: side * 0.11 });
    gaze(p, w, side * 0.12, 0.58);
    hands(p, w, side, p.reduced ? 'lap' : 'holdKnee', p.reduced ? 'lowFold' : 'holdKnee');
    face(p, w, 'sad', 0.96, 0.28 + exhale * 0.17);
  }],
  angry: [3.3, 0.35, 0.70, (p, w, t, side) => {
    const accent = arc(t, 0.14, 0.37, 0.61);
    body(p, w, { hipDrop: 0.04, chestX: -0.19 - accent * 0.08, chestZ: side * 0.055,
      headX: 0.16, headY: side * 0.16 * Math.sin(t * Math.PI * 3) });
    hands(p, w, side, 'sideFist', 'sideFist');
    gaze(p, w * 0.8, 0, 0.03);
    face(p, w, 'angry', 0.89, 0.09, 0.045);
  }],
  shy: [3.45, 0.56, 0.73, (p, w, t, side) => {
    const look = arc(t, 0.34, 0.67, 0.91);
    body(p, w, { hipDrop: 0.055, hipShift: side * 0.049, chestX: -0.19, chestY: side * 0.10,
      headX: 0.21 - look * 0.14, headY: -side * 0.24, headZ: side * 0.18 });
    hands(p, w, side, 'lowFold', 'lowFold');
    gaze(p, w, -side * 0.39, 0.30 - look * 0.20);
    face(p, w, 'happy', 0.42, 0.11);
  }],
  playful: [3.2, 0.43, 0.76, (p, w, t, side) => {
    const wink = arc(t, 0.27, 0.38, 0.53);
    body(p, w, { hipShift: -side * 0.079, hipsZ: -side * 0.08, chestY: side * 0.21,
      chestZ: side * 0.15, headY: -side * 0.16, headZ: -side * 0.24, headX: 0.015 + wink * 0.07 });
    hands(p, w, side, 'kiss', 'sideHip');
    p.handTravel = ease((t - 0.31) / 0.30);
    gaze(p, w * 0.73, 0.08 * side, -0.05);
    face(p, w, 'happy', 0.71, 0.07, wink * 0.12);
    p.wink = side * wink * w;
    p.effect = 'spark';
  }],
  tender: [3.55, 0.61, 0.83, (p, w, t, side) => {
    body(p, w, { hipShift: side * 0.041, chestX: -0.09, chestZ: side * 0.13,
      headZ: -side * 0.22, headX: 0.08 + 0.07 * Math.sin(t * Math.PI) });
    hands(p, w, side, 'hug', 'hug');
    face(p, w, 'happy', 0.67, 0.27);
    p.plush = w;
  }],
  surprised: [2.45, 0.20, 0.82, (p, w, t, side) => {
    const recoil = arc(t, 0.03, 0.21, 0.63);
    body(p, w, { hipDepth: -0.11 * recoil, hipDrop: recoil * 0.055, chestX: 0.24 * recoil,
      headX: -0.17 * recoil, headZ: side * 0.08 });
    hands(p, w, side, 'startled', 'startled');
    face(p, w, 'surprised', 0.94 - 0.21 * t, 0, 0.27);
    p.effect = 'surprise';
  }],
  scared: [3.1, 0.25, 0.82, (p, w, t, side) => {
    body(p, w, { hipDrop: 0.065, hipDepth: -0.12, hipShift: -side * 0.045, chestY: side * 0.25,
      chestX: -0.13, headY: -side * 0.19, headX: 0.06 });
    hands(p, w, side, 'collar', 'fold');
    face(p, w, 'surprised', 0.62, 0, 0.11);
  }],
  confused: [3.3, 0.44, 0.75, (p, w, t, side) => {
    body(p, w, { hipShift: side * 0.042, chestZ: side * 0.07, headZ: -side * 0.20,
      headY: side * 0.12, headX: -0.04 });
    hands(p, w, side, 'palmUp', 'palmLow');
    gaze(p, w, side * 0.15, -0.17);
    face(p, w, 'surprised', 0.37, 0, 0.08);
    p.effect = 'question';
  }],
  bashful: [3.35, 0.42, 0.89, (p, w, t, side) => {
    body(p, w, { chestX: -0.13, hipDrop: 0.04, headX: 0.19, headY: side * 0.16,
      headZ: side * 0.13, hipShift: -side * 0.04 });
    hands(p, w, side, 'coverSide', 'coverSide');
    gaze(p, w, side * 0.26, 0.33);
    face(p, w, 'happy', 0.55, 0.18);
    p.effect = 'spark';
  }],
  frustrated: [3.6, 0.58, 0.85, (p, w, t, side) => {
    const sigh = arc(t, 0.25, 0.48, 0.79);
    body(p, w, { chestX: -0.12 - sigh * 0.11, hipShift: side * 0.045,
      headX: 0.12 + sigh * 0.13, headZ: -side * 0.16 });
    hands(p, w, side, 'forehead', 'sideHip');
    face(p, w, 'sad', 0.46, sigh * 0.43, sigh * 0.095);
  }],
  waiting: [4.25, 0.55, 0.8, (p, w, t, side) => {
    const check = arc(t, 0.18, 0.46, 0.78);
    body(p, w, { hipShift: -side * 0.055, chestY: side * 0.13, chestZ: side * 0.055,
      headX: 0.37 * check, headY: -side * 0.23 * check, headZ: -side * 0.075 });
    gaze(p, w, -side * 0.28 * check, 0.59 * check);
    hands(p, w, side, 'watch', 'tapWatch');
    face(p, w, 'relaxed', 0.36, 0.10);
    p.effect = 'clock';
  }],
  bored: [12.2, 1.35, 1.35, (p, w, t, side) => {
    const drift = Math.sin(t * Math.PI * 2);
    const seated = p.reduced ? 0 : w;
    body(p, w, { hipShift: side * 0.035, chestX: -0.19, chestY: -side * 0.09,
      headX: 0.075, headY: side * (0.16 + 0.09 * drift), headZ: -side * 0.19 });
    body(p, seated, { hipDrop: 0.49, hipDepth: -0.42 });
    gaze(p, w, side * (0.30 + 0.11 * drift), 0.30);
    hands(p, w, side, 'cheekRest', seated > 0 ? 'knee' : 'lap');
    face(p, w, 'relaxed', 0.56, 0.40);
    p.seat = seated;
  }],
  yawn: [4.9, 0.74, 0.98, (p, w, t, side) => {
    const breath = arc(t, 0.13, 0.53, 0.86);
    body(p, w, { chestX: 0.12 * breath, hipShift: -side * 0.047, headX: -0.16 * breath,
      headZ: side * 0.12, headY: side * 0.095 });
    hands(p, w * (0.54 + breath * 0.46), side, 'cover', 'lap');
    face(p, w, 'relaxed', 0.53, breath * 0.83, breath * 0.66);
  }],
  relaxed: [5.2, 0.85, 1.0, (p, w, t, side) => {
    p.armGesture = w;
    p.reach = { kind: 'stretch', strength: w * 0.91, sweep: ease((t - 0.14) / 0.49) };
    body(p, w, { chestX: 0.20, headX: -0.18, headZ: side * 0.15, hipShift: -side * 0.055 });
    face(p, w, 'relaxed', 0.73, 0.41, 0.10);
  }],
  determined: [3.1, 0.42, 0.67, (p, w, t, side) => {
    const resolve = arc(t, 0.22, 0.42, 0.68);
    body(p, w, { chestX: -0.08, chestZ: side * 0.095, headX: 0.13 * resolve,
      headY: -side * 0.095, hipShift: -side * 0.035 });
    hands(p, w, side, 'joy', 'sideHip');
    face(p, w, 'happy', 0.40, 0.08);
  }],
  attentive: [1.7, 0.29, 0.6, (p, w, t, side) => {
    body(p, w, { chestX: -0.075, headX: 0.11 * arc(t, 0.21, 0.43, 0.72),
      headZ: side * 0.12, hipShift: side * 0.025 });
    gaze(p, w * 0.66, 0, -0.045);
    face(p, w, 'happy', 0.24);
  }],
};

const thinking = new Set(['thinking', 'responding', 'looking', 'searching', 'transcribing', 'preparing']);
const ambient = ['waiting', 'bored', 'yawn', 'relaxed'];

export function createActing(random = Math.random) {
  let shot;
  let lastState;
  let lastSpeech;
  let idleFrom;
  let idleBeat = 0;
  let nextIdleBeat = 23;
  let workFrom;
  let thought = 0;
  let wasLocked = false;
  let queued;

  function request(name) {
    if (Object.hasOwn(scenes, name)) queued = name;
  }

  function resetIdle(now) {
    idleFrom = now;
    idleBeat = 0;
    nextIdleBeat = 23;
  }

  function step(now, state, cue, locked, companion) {
    const busy = thinking.has(state);
    const idle = state === 'idle';
    const listening = state === 'listening';
    if (!idle) idleFrom = undefined;
    else if (idleFrom === undefined) resetIdle(now);
    if (!busy) workFrom = undefined;
    else if (workFrom === undefined) { workFrom = now; thought = 0; }

    if (shot && now >= shot.until) shot = undefined;
    if (shot && !shot.release && (locked || (shot.ambient && !idle) ||
        (shot.task && !busy) || (shot.listens && !listening))) {
      shot.release = { at: now, weight: strength(shot, now) };
      const exit = state === 'speaking' && cue && shot.task ? 0.15 : locked ? 0.22 : 0.34;
      shot.until = now + (shot.name === 'bored' ? 0.70 : exit);
    }
    if (state === 'speaking' && (lastState !== 'speaking' || lastSpeech !== cue)) {
      if (cue) request(cue);
      lastSpeech = cue;
    }
    if (listening && lastState !== 'listening' && !queued) queued = 'attentive';
    if (locked && !wasLocked) queued = undefined;
    if (!locked && queued && shot && !shot.release) {
      shot.release = { at: now, weight: strength(shot, now) };
      shot.until = now + (shot.name === 'bored' ? 0.70 : 0.27);
    }
    if (!locked && !shot) {
      if (queued) {
        start(queued, now, { listens: queued === 'attentive' });
        queued = undefined;
      } else if (busy && now - workFrom >= (thought ? 9.4 : 0.55) && thought < 2) {
        start(thought++ ? 'confused' : 'think', now, { task: true });
      } else if (idle && now - idleFrom >= nextIdleBeat * (companion === 'quiet' ? 1.34 : companion === 'chatty' ? 0.86 : 1)) {
        const name = ambient[idleBeat % ambient.length];
        idleBeat++;
        nextIdleBeat += name === 'waiting' ? 28 : name === 'bored' ? 38 : 25;
        start(name, now, { ambient: true });
      }
    }
    wasLocked = locked;
    lastState = state;
    return shot;
  }

  function start(name, now, flags) {
    shot = { name, at: now, until: now + scenes[name][0], side: random() < 0.5 ? -1 : 1, ...flags };
  }

  function strength(current, now) {
    if (current.release) return current.release.weight * ease((current.until - now) / (current.until - current.release.at));
    const [duration, attack, release] = scenes[current.name];
    const elapsed = now - current.at;
    return ease(elapsed / attack) * ease((duration - elapsed) / release);
  }

  function apply(pose, now, current) {
    if (!current) return;
    const [duration, , , animate] = scenes[current.name];
    const amount = strength(current, now) * (pose.reduced ? 0.52 : 1);
    if (amount < 0.003) return;
    const phase = clamp((now - current.at) / duration);
    animate(pose, amount, phase, current.side);
    pose.acting = current.name;
    pose.actingWeight = amount;
    pose.actingPhase = phase;
    pose.idleBlend *= 1 - amount * 0.76;
  }

  return { step, apply, request, resetIdle };
}
