import { MathUtils, Quaternion, Vector3 } from 'three';
import { followArmPath } from './avatar-reach.mjs';

const down = new Vector3(0, -1, 0);
const up = new Vector3(0, 1, 0);
const identity = new Quaternion();
const flex = new Quaternion();
const splay = new Quaternion();
const pose = new Quaternion();
const thumbCurl = [0.30, 0.36, 0.22];
const closedCurl = [0.93, 1.06, 0.68];

export function fingerRig(get, side) {
  const fingers = [];
  const middle = get(side + 'MiddleProximal');
  const index = get(side + 'IndexProximal');
  const little = get(side + 'LittleProximal');
  const palm = middle && index && little
    ? middle.position.clone().cross(little.position.clone().sub(index.position)).normalize()
    : down.clone();
  if (palm.lengthSq() < 0.5) palm.copy(down);
  if (palm.dot(down) < 0) palm.negate();
  for (const [digit, name] of ['Index', 'Middle', 'Ring', 'Little', 'Thumb'].entries()) {
    const thumb = name === 'Thumb';
    const segments = thumb ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    const nodes = segments.map((segment) => get(side + name + segment));
    const first = (nodes[1]?.position ?? nodes[0]?.position)?.clone().normalize();
    for (let segment = 0; segment < nodes.length; segment++) {
      const node = nodes[segment];
      if (!node) continue;
      const direction = (nodes[segment + 1]?.position ?? node.position).clone().normalize();
      const axis = direction.clone().cross(palm);
      if (axis.lengthSq() < 1e-8) continue;
      fingers.push({
        node, name, digit, segment, axis: axis.normalize(), palm,
        curl: (thumb ? 0.37 : 0.82 + digit * 0.13) * [1, 0.74, 0.47][segment],
        straighten: first?.lengthSq() > 0.5 ? new Quaternion().setFromUnitVectors(direction, first) : identity,
      });
    }
  }
  return fingers;
}

export function relaxFingers(arm, time, strength) {
  for (const finger of arm.fingers) {
    const wave = Math.sin(time * (1.05 + finger.digit * 0.12) + finger.digit * 1.2 + arm.side);
    const curl = Math.max(0, arm.curl + wave * 0.060) * finger.curl;
    const spread = finger.segment === 0 && finger.name !== 'Thumb' ? arm.side * (finger.digit - 1.5) * 0.025 : 0;
    pose.setFromAxisAngle(finger.palm, spread).multiply(flex.setFromAxisAngle(finger.axis, curl));
    finger.node.quaternion.slerp(pose, strength);
  }
}

export function shapeHand(arm, kind, strength, phase = 0) {
  if (!arm || strength < 0.001) return;
  for (const finger of arm.fingers) {
    const { name, segment } = finger;
    const extended = kind === 'point' && name === 'Index' || kind === 'thumb' && name === 'Thumb';
    const curl = extended ? 0.015 : kind === 'open' ? (0.15 + finger.digit * 0.025) * finger.curl
      : kind === 'wiggle' ? (0.32 + 0.23 * Math.sin(phase * Math.PI * 6 - finger.digit * 0.9)) * finger.curl
      : name === 'Thumb' ? thumbCurl[segment] : closedCurl[segment];
    const spread = kind === 'open' && segment === 0 && name !== 'Thumb' ? arm.side * (finger.digit - 1.5) * 0.066 : 0;
    pose.copy(extended ? finger.straighten : identity)
      .multiply(splay.setFromAxisAngle(finger.palm, spread))
      .multiply(flex.setFromAxisAngle(finger.axis, curl));
    finger.node.quaternion.slerp(pose, strength);
  }
}

const shoulder = new Vector3();
const target = new Vector3();
const pole = new Vector3();
const direction = new Vector3();
const wrist = new Vector3();
const boneEnd = new Vector3();
const aim = new Vector3();
const handWorld = new Quaternion();
const parent = new Quaternion();
const turn = new Quaternion();

export function reachHandGesture(joints, gesture, point, strength) {
  const arm = gesture.side < 0 ? joints.leftArm : joints.rightArm;
  if (!arm?.reach || strength < 0.001) return null;
  const length = arm.reach.length;
  const viewSide = arm.side * joints.axis;
  arm.upper.getWorldPosition(shoulder);
  if (gesture.kind === 'point') {
    if (!point) return null;
    aim.copy(point.position).addScaledVector(point.normal, shoulder.dot(point.normal) + length * 0.42);
    direction.copy(aim).sub(shoulder).normalize();
    if (direction.y > 0.55 && direction.x * viewSide < 0.28) direction.x = viewSide * 0.28;
    target.copy(shoulder).addScaledVector(direction.normalize(), length * 0.92);
  } else {
    target.copy(shoulder).add(direction.set(viewSide * length * 0.12, -length * 0.29, length * 0.56));
  }
  pole.set(arm.side, -0.43, joints.axis * 0.42);
  followArmPath(arm, target, pole, joints.axis, strength);
  return arm;
}

export function aimHand(arm, kind, strength) {
  shapeHand(arm, kind, strength);
  const digit = kind === 'point' ? 'Index' : 'Thumb';
  const start = arm.fingers.find((finger) => finger.name === digit && finger.segment === 0)?.node;
  const end = arm.fingers.find((finger) => finger.name === digit && finger.segment === 2)?.node;
  if (!start || !end) return;
  start.getWorldPosition(wrist);
  end.getWorldPosition(boneEnd);
  direction.copy(boneEnd).sub(wrist);
  if (direction.lengthSq() < 0.000001) return;
  direction.normalize();
  if (kind === 'point') aim.sub(wrist).normalize();
  else aim.copy(up);
  turn.setFromUnitVectors(direction, aim);
  arm.hand.getWorldQuaternion(handWorld).premultiply(turn);
  arm.hand.parent.getWorldQuaternion(parent).invert();
  parent.multiply(handWorld);
  const angle = arm.hand.quaternion.angleTo(parent);
  arm.hand.quaternion.rotateTowards(parent, Math.min(angle, kind === 'point' ? 1.08 : 1.34) * strength);
}
