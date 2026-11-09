import { Quaternion, Vector3 } from 'three';
import { createLimbReach } from './avatar-reach.mjs';

const down = new Vector3(0, -1, 0);

export function fingerRig(get, side) {
  const fingers = [];
  for (const [index, finger] of ['Index', 'Middle', 'Ring', 'Little', 'Thumb'].entries()) {
    const names = finger === 'Thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal'];
    const nodes = names.map((segment) => get(side + finger + segment));
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const direction = nodes[i + 1]?.position ?? node.position;
      const axis = direction.clone().cross(down);
      if (axis.lengthSq() < 1e-8) continue;
      const curl = (finger === 'Thumb' ? 0.35 : 0.84 + index * 0.12) * [1, 0.72, 0.49][i];
      fingers.push({ node, axis: axis.normalize(), curl });
    }
  }
  return fingers;
}

export function legRig(get, side, axis) {
  const thigh = get(side + 'UpperLeg');
  const shin = get(side + 'LowerLeg');
  const foot = get(side + 'Foot');
  const reach = createLimbReach(thigh, shin, foot, 0.9999);
  if (!reach) return null;
  return {
    thigh, shin, foot, reach, side, toes: get(side + 'Toes'),
    pole: new Vector3((side === 'left' ? 1 : -1) * axis * 0.10, 0, axis),
    plant: new Vector3(), pivot: new Vector3(), footRotation: new Quaternion(), heel: 0,
  };
}

export function capturePlants(legs, axis) {
  for (const leg of legs) {
    leg.foot.getWorldPosition(leg.plant);
    leg.foot.getWorldQuaternion(leg.footRotation);
    if (leg.toes) leg.toes.getWorldPosition(leg.pivot);
    else leg.foot.localToWorld(leg.pivot.set(0, -leg.reach.length * 0.055, axis * leg.reach.length * 0.14));
  }
}

const worldX = new Vector3(1, 0, 0);
const ankle = new Vector3();
const pitch = new Quaternion();
const parentRotation = new Quaternion();

export function plantFeet(legs, pose, blend) {
  for (const leg of legs) {
    const heel = pose.heel?.side === leg.side ? pose.heel.amount : 0;
    leg.heel += (heel - leg.heel) * blend;
    pitch.setFromAxisAngle(worldX, leg.heel);
    ankle.copy(leg.plant).sub(leg.pivot).applyQuaternion(pitch).add(leg.pivot);
    leg.reach.apply(ankle, leg.pole, 1);
    leg.shin.getWorldQuaternion(parentRotation);
    leg.foot.quaternion.copy(parentRotation.invert()).multiply(pitch).multiply(leg.footRotation);
  }
}
