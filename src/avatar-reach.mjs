import { MathUtils, Quaternion, Vector3 } from 'three';

export function createLimbReach(upper, lower, hand, extension = 0.99) {
  if (!upper || lower?.parent !== upper || hand?.parent !== lower) return null;
  const upperLength = lower.position.length();
  const forearmLength = hand.position.length();
  const length = upperLength + forearmLength;
  if (Math.min(upperLength, forearmLength) < length * 0.08 || length < 0.001) return null;

  const upperAxis = lower.position.clone().normalize();
  const forearmAxis = hand.position.clone().normalize();
  const toward = new Vector3();
  const bend = new Vector3();
  const elbow = new Vector3();
  const wrist = new Vector3();
  const from = new Vector3();
  const upperRotation = new Quaternion();
  const forearmRotation = new Quaternion();
  const inverseUpper = new Quaternion();

  function apply(worldTarget, pole, weight) {
    toward.copy(worldTarget);
    upper.parent.worldToLocal(toward).sub(upper.position);
    const wanted = toward.length();
    if (wanted < 0.00001) return;
    toward.divideScalar(wanted);
    const reach = MathUtils.clamp(wanted, Math.abs(upperLength - forearmLength) + length * 0.025, length * extension);
    bend.copy(pole).addScaledVector(toward, -pole.dot(toward));
    if (bend.lengthSq() < 0.000001) bend.set(-toward.y, toward.x, 0);
    if (bend.lengthSq() < 0.000001) bend.set(1, 0, 0);
    bend.normalize();

    // The elbow is the intersection of the two bone lengths in the plane of the reach.
    const along = (upperLength ** 2 - forearmLength ** 2 + reach ** 2) / (2 * reach);
    const outward = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    elbow.copy(toward).multiplyScalar(along).addScaledVector(bend, outward);
    wrist.copy(toward).multiplyScalar(reach).sub(elbow).normalize();
    elbow.normalize();
    from.copy(upperAxis).applyQuaternion(upper.quaternion);
    upperRotation.setFromUnitVectors(from, elbow).multiply(upper.quaternion);
    inverseUpper.copy(upperRotation).invert();
    wrist.applyQuaternion(inverseUpper);
    from.copy(forearmAxis).applyQuaternion(lower.quaternion);
    forearmRotation.setFromUnitVectors(from, wrist).multiply(lower.quaternion);
    upper.quaternion.slerp(upperRotation, weight);
    lower.quaternion.slerp(forearmRotation, weight);
  }

  return { apply, length };
}

const target = new Vector3();
const pole = new Vector3();
const restingWrist = new Vector3();
const restingElbow = new Vector3();
const shoulder = new Vector3();
const armGoals = {
  arriba: [0.31, 0.86, 0.15], abajo: [0.07, -0.92, 0.09], adelante: [0.16, -0.13, 0.88],
  atras: [0.17, -0.65, -0.38], lado: [0.88, -0.02, 0.10],
};

export function followArmPath(arm, goal, elbowPole, axis, weight) {
  arm.hand.getWorldPosition(restingWrist);
  goal.lerpVectors(restingWrist, goal, weight);
  // Keep the approach outside the body before arriving at the final pose.
  const clearance = Math.sin(Math.PI * weight) * arm.reach.length;
  goal.x += arm.side * axis * clearance * 0.30;
  goal.z += clearance * 0.24;
  restingElbow.copy(arm.lower.position).applyQuaternion(arm.upper.quaternion).normalize();
  elbowPole.normalize().lerpVectors(restingElbow, elbowPole, weight);
  arm.reach.apply(goal, elbowPole, 1);
}

export function applyReach(joints, gesture, weight) {
  if (!joints.head || weight < 0.001) return false;
  const { leftArm, rightArm, axis } = joints;
  const { kind, side, sweep, direction, extent } = gesture;
  const leading = side < 0 ? leftArm : rightArm;
  let moved = false;
  const both = kind === 'stretch' || kind === 'arm' && side === 0;
  for (const arm of both ? [leftArm, rightArm] : [leading]) {
    if (!arm?.reach) continue;
    const { length } = arm.reach;
    if (kind === 'arm') {
      const [x, y, z] = armGoals[direction];
      arm.upper.getWorldPosition(target);
      target.x += x * arm.side * axis * length * extent;
      target.y += y * length * extent - length * (1 - extent) * 0.67;
      target.z += z * length * extent;
      pole.set(arm.side, -0.32, axis * 0.32);
    } else if (kind === 'hair') {
      target.set(arm.side * length * (0.29 + sweep * 0.025),
        length * (0.19 + sweep * 0.08), axis * length * (0.17 - sweep * 0.07));
      joints.head.localToWorld(target);
      pole.set(arm.side, -0.31, axis * 0.45);
    } else {
      target.set(arm.side * length * (0.55 + sweep * 0.10),
        length * (0.35 + sweep * 0.09), axis * length * 0.19);
      joints.head.localToWorld(target);
      pole.set(arm.side, -0.19, axis * 0.40);
    }
    followArmPath(arm, target, pole, axis, weight);
    moved = true;
  }
  return moved;
}

export function clearTorso(joints) {
  const { hips, axis, leftArm, rightArm } = joints;
  if (!hips) return;
  for (const arm of [leftArm, rightArm]) {
    if (!arm?.reach) continue;
    const { length } = arm.reach;
    hips.worldToLocal(arm.upper.getWorldPosition(shoulder));
    hips.worldToLocal(arm.hand.getWorldPosition(target));
    const halfWidth = Math.max(Math.abs(shoulder.x) * 0.87, length * 0.16);
    const widthRatio = Math.abs(target.x) / halfWidth;
    if (widthRatio >= 1 || target.y <= -length * 0.13 || target.y >= shoulder.y - length * 0.08) continue;
    const depth = halfWidth * 0.74 * Math.sqrt(1 - widthRatio ** 2);
    const front = target.z * axis;
    if (front <= -depth || front >= depth) continue;
    const edge = MathUtils.smoothstep(target.y, -length * 0.13, length * 0.02) *
      (1 - MathUtils.smoothstep(target.y, shoulder.y - length * 0.26, shoulder.y - length * 0.08)) *
      MathUtils.smoothstep(front, -depth, 0);
    target.z += axis * (depth - front) * edge;
    hips.localToWorld(target);
    pole.copy(arm.lower.position).applyQuaternion(arm.upper.quaternion);
    arm.reach.apply(target, pole, 1);
  }
}
