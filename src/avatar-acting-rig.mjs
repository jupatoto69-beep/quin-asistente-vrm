import { Quaternion, Vector3 } from 'three';
import { followArmPath } from './avatar-reach.mjs';
import { shapeHand } from './avatar-hands.mjs';

// Positions are offsets from a humanoid landmark, in arm lengths.
// The last two vectors are the direction of the fingers and the palm.
const marks = {
  chin: ['head', [0.15, -0.16, 0.29], 'consider', [-0.35, 0.92, -0.24], [-0.25, 0.10, -1]],
  kiss: ['head', [0.23, -0.09, 0.34], 'soft', [-0.37, 0.79, 0.28], [0.04, 0.87, 0.32]],
  cheekRest: ['head', [0.39, -0.16, 0.42], 'fist', [-0.26, 0.96, 0.09], [-0.84, 0.12, -0.50]],
  forehead: ['head', [0.29, 0.13, 0.29], 'soft', [-0.66, 0.72, -0.12], [-0.44, 0, -1]],
  cover: ['head', [0.12, -0.035, 0.34], 'cup', [-0.71, 0.62, -0.12], [0, 0, -1]],
  coverSide: ['head', [0.16, -0.13, 0.34], 'soft', [-0.13, 0.97, -0.21], [-0.24, 0, -1]],
  startled: ['shoulder', [0.38, 0.17, 0.45], 'splayed', [0.20, 0.97, 0.12], [0.19, 0, 1]],
  joy: ['shoulder', [0.09, -0.03, 0.47], 'fist', [-0.12, 0.94, 0.19], [-0.12, 0, -1]],
  joySoft: ['shoulder', [0.11, -0.16, 0.47], 'fist', [-0.17, 0.88, 0.28], [-0.12, 0, -1]],
  high: ['shoulder', [0.48, 0.78, 0.20], 'splayed', [0.47, 0.87, 0.16], [0.14, 0, 1]],
  wide: ['shoulder', [0.88, 0.18, 0.22], 'open', [0.89, 0.42, 0.15], [0.15, 0, 1]],
  collar: ['chest', [0.17, 0.33, 0.41], 'cup', [-0.28, 0.86, -0.08], [0.02, 0, -1]],
  nearChest: ['chest', [0.14, 0.16, 0.53], 'soft', [-0.58, 0.78, -0.12], [-0.15, 0, -1]],
  hug: ['chest', [0.23, 0.10, 0.67], 'cup', [-0.89, 0.34, 0.17], [-0.12, -0.28, -1]],
  fold: ['chest', [-0.13, -0.14, 0.55], 'soft', [-0.94, 0.13, -0.10], [0, -1, -0.29]],
  lowFold: ['hips', [0.075, -0.07, 0.44], 'soft', [-0.19, -0.88, 0.24], [-0.6, 0.09, -0.2]],
  lap: ['hips', [0.21, -0.25, 0.33], 'soft', [-0.14, -0.96, 0.16], [-0.75, -0.12, -0.45]],
  sideHip: ['hips', [0.41, -0.17, 0.12], 'soft', [0.06, -0.96, 0.15], [-0.90, 0, 0.12]],
  sideFist: ['hips', [0.43, -0.25, 0.14], 'fist', [0.02, -0.98, 0.06], [-0.92, 0, 0.09]],
  palmUp: ['chest', [0.43, -0.13, 0.64], 'open', [0.76, 0.09, 0.52], [0.04, 1, 0.24]],
  palmLow: ['chest', [0.40, -0.28, 0.54], 'soft', [0.63, 0.04, 0.69], [0, 1, 0.24]],
  watch: ['chest', [-0.12, 0.14, 0.53], 'soft', [-0.96, 0.01, 0.13], [0, -0.98, -0.14]],
  tapWatch: ['chest', [0.28, 0.11, 0.65], 'consider', [-0.77, 0.25, -0.45], [0.15, -0.75, -0.42]],
  knee: ['knee', [0.04, 0.12, 0.12], 'soft', [0.05, -0.55, 0.81], [0, -1, -0.1]],
  holdKnee: ['knee', [0.09, 0.19, 0.13], 'cup', [-0.54, -0.42, 0.64], [-0.53, -0.76, -0.18]],
};

const target = new Vector3();
const anchor = new Vector3();
const pole = new Vector3();
const forward = new Vector3();
const desiredForward = new Vector3();
const palm = new Vector3();
const desiredPalm = new Vector3();
const tangent = new Vector3();
const orient = new Quaternion();
const swing = new Quaternion();
const roll = new Quaternion();
const parent = new Quaternion();

function faceHand(arm, direction, facing, worldSide, weight) {
  const hand = arm.hand;
  const middle = arm.fingers.find((finger) => finger.name === 'Middle' && finger.segment === 0);
  if (!middle) return;
  hand.getWorldQuaternion(orient);
  forward.copy(middle.node.position).normalize().applyQuaternion(orient);
  desiredForward.set(direction[0] * worldSide, direction[1], direction[2]).normalize();
  swing.setFromUnitVectors(forward, desiredForward);
  orient.premultiply(swing);
  palm.copy(middle.palm).applyQuaternion(orient);
  palm.addScaledVector(desiredForward, -palm.dot(desiredForward)).normalize();
  desiredPalm.set(facing[0] * worldSide, facing[1], facing[2]);
  desiredPalm.addScaledVector(desiredForward, -desiredPalm.dot(desiredForward)).normalize();
  tangent.crossVectors(palm, desiredPalm);
  const angle = Math.atan2(tangent.dot(desiredForward), palm.dot(desiredPalm));
  orient.premultiply(roll.setFromAxisAngle(desiredForward, angle));
  hand.parent.getWorldQuaternion(parent).invert().multiply(orient);
  hand.quaternion.rotateTowards(parent, Math.min(hand.quaternion.angleTo(parent), 1.27) * weight);
}

export function poseActingHands(joints, pose, blend) {
  for (const [index, arm] of [joints.leftArm, joints.rightArm].entries()) {
    if (!arm?.reach) continue;
    const name = pose.performHands?.[index];
    if (arm.actingWeight < 0.04 || arm.actingMark === name) {
      arm.actingMark = name;
    }
    const wanted = arm.actingMark === name ? pose.handStrength ?? 0 : 0;
    arm.actingWeight += (wanted - arm.actingWeight) * blend;
    if (!arm.actingMark || arm.actingWeight < 0.001) continue;
    const [landmark, offset, hand, fingers, facing] = marks[arm.actingMark];
    const node = landmark === 'shoulder' ? arm.upper
      : landmark === 'knee' ? joints.legs.find((leg) => leg.side === (index === 0 ? 'left' : 'right'))?.shin
        : joints[landmark];
    if (!node) continue;
    const length = arm.reach.length;
    const travel = arm.actingMark === 'kiss' ? pose.handTravel ?? 0 : 0;
    const worldSide = arm.side * joints.axis;
    if (landmark === 'shoulder' || landmark === 'knee') {
      target.set(offset[0] * worldSide, offset[1], offset[2]).multiplyScalar(length);
      target.add(node.getWorldPosition(anchor));
    } else {
      target.set((offset[0] + travel * 0.42) * arm.side, offset[1] - travel * 0.11,
        (offset[2] + travel * 0.28) * joints.axis).multiplyScalar(length);
      node.localToWorld(target);
    }
    pole.set(arm.side * 0.67, -0.85, joints.axis * 0.37);
    const weight = arm.actingWeight;
    followArmPath(arm, target, pole, joints.axis, weight);
    shapeHand(arm, hand, weight);
    faceHand(arm, fingers, facing, worldSide, weight);
  }
}
