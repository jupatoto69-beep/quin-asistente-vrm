export function strengthFor(value) {
  return value === 'baja' ? 0.48 : value === 'alta' ? 1 : 0.76;
}

export function moveBody(p, amount, plan) {
  const a = amount * strengthFor(plan.intensity);
  const side = plan.direction === 'izquierda' ? -1 : plan.direction === 'derecha' ? 1 : 0;
  const backward = plan.direction === 'arriba' || plan.direction === 'atras';
  const pitch = backward ? -1 : 1;
  if (plan.part === 'head') {
    p.headX = side ? p.headX * (1 - a) : p.headX + pitch * 0.48 * a;
    if (plan.tilt) p.headZ -= side * 0.34 * a;
    else p.headY += side * 0.60 * a;
    p.gazeX = side ? side * a : p.gazeX * (1 - a);
    p.gazeY = side ? 0 : pitch * a;
  } else if (plan.part === 'torso') {
    p.chestY += side * 0.48 * a;
    p.chestZ -= side * 0.16 * a;
    if (!side) p.chestX -= pitch * 0.36 * a;
  } else if (plan.part === 'hips') {
    p.hipShift += side * 0.12 * a;
    p.hipsZ -= side * 0.11 * a;
    p.hipsY += side * 0.13 * a;
    if (!side) {
      p.hipDepth += pitch * 0.09 * a;
      p.hipDrop += (plan.direction === 'abajo' ? 0.13 : 0.025) * a;
    }
  } else {
    p.leftLift += a * (side <= 0 ? 0.23 : 0.06);
    p.rightLift += a * (side >= 0 ? 0.23 : 0.06);
    p.leftBend += a * 0.21;
    p.rightBend += a * 0.21;
    p.chestZ -= side * a * 0.13;
  }
}

export function dance(p, amount, phase, tempo) {
  const beats = tempo === 'rapido' ? 12 : tempo === 'lento' ? 7 : 9;
  const time = phase * beats;
  const step = Math.floor(time);
  const local = time - step;
  const side = step % 2 === 0 ? -1 : 1;
  const swing = Math.sin(time * Math.PI);
  const accent = Math.sin(local * Math.PI) ** 2;
  const turn = Math.sin(time * Math.PI / 2);
  p.hipShift += -0.073 * swing * amount;
  p.hipDrop += (0.025 + accent * 0.037) * amount;
  p.hipsY += 0.19 * swing * amount;
  p.hipsZ -= 0.068 * swing * amount;
  p.chestY -= 0.24 * swing * amount;
  p.chestZ += 0.15 * turn * amount;
  p.headX += 0.105 * accent * amount;
  p.headZ -= 0.12 * turn * amount;
  p.leftLift += (0.48 + 0.36 * swing + 0.18 * turn) * amount;
  p.rightLift += (0.48 - 0.36 * swing - 0.18 * turn) * amount;
  p.leftBend += (0.60 - 0.25 * swing) * amount;
  p.rightBend += (0.60 + 0.25 * swing) * amount;
  p.leftForward += (0.27 - swing * 0.17) * amount;
  p.rightForward += (0.27 + swing * 0.17) * amount;
  p.leftWrist += 0.30 * turn * amount;
  p.rightWrist -= 0.30 * turn * amount;
  p.leftCurl += (0.12 - swing * 0.14) * amount;
  p.rightCurl += (0.12 + swing * 0.14) * amount;
  p.foot = { side: side < 0 ? 'left' : 'right', lift: 0.11 * amount,
    forward: (step % 4 < 2 ? 0.15 : -0.10) * amount, lateral: -side * 0.075 * amount, amount: accent };
  p.face = 'happy';
  p.expression = 0.14 + 0.43 * amount;
}
