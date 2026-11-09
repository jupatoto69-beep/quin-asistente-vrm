import { Quaternion, Vector3 } from 'three';
import { createLimbReach } from './avatar-reach.mjs';

export function legRig(get, side, axis) {
  const thigh = get(side + 'UpperLeg');
  const shin = get(side + 'LowerLeg');
  const foot = get(side + 'Foot');
  const reach = createLimbReach(thigh, shin, foot, 0.9999);
  if (!reach) return null;
  return {
    thigh, shin, foot, reach, side, toes: get(side + 'Toes'),
    pole: new Vector3((side === 'left' ? 1 : -1) * axis * 0.10, 0, axis),
    plant: new Vector3(), pivot: new Vector3(), footRotation: new Quaternion(),
    heel: 0, lift: 0, forward: 0, lateral: 0,
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
const measured = new Vector3();

function settle(value, goal, blend) {
  const next = value + (goal - value) * blend;
  return goal === 0 && Math.abs(next) < 0.001 ? 0 : next;
}

export function plantFeet(legs, pose, blend) {
  const plan = pose.foot;
  const support = plan && legs.find((leg) => leg.side !== plan.side);
  const planted = support && support.lift === 0 && support.forward === 0 && support.lateral === 0 && support.heel === 0;
  for (const leg of legs) {
    const moving = planted && plan.side === leg.side;
    const heel = !plan && pose.heel?.side === leg.side ? pose.heel.amount : 0;
    leg.heel = settle(leg.heel, heel, blend);
    leg.lift = settle(leg.lift, moving ? plan.lift * plan.amount : 0, blend);
    leg.forward = settle(leg.forward, moving ? plan.forward * plan.amount : 0, blend);
    leg.lateral = settle(leg.lateral, moving ? (plan.lateral ?? 0) * plan.amount : 0, blend);
    pitch.setFromAxisAngle(worldX, leg.heel);
    ankle.copy(leg.plant).sub(leg.pivot).applyQuaternion(pitch).add(leg.pivot);
    ankle.y += leg.lift * leg.reach.length;
    ankle.z += leg.forward * leg.reach.length;
    ankle.x += leg.lateral * leg.reach.length;
    leg.reach.apply(ankle, leg.pole, 1);
    pitch.setFromAxisAngle(worldX, leg.heel + leg.lift * 0.37);
    leg.shin.getWorldQuaternion(parentRotation);
    leg.foot.quaternion.copy(parentRotation.invert()).multiply(pitch).multiply(leg.footRotation);
  }
  if (!planted || plan.amount < 0.75) return false;
  const raised = legs.find((leg) => leg.side === plan.side);
  if (!raised || support.foot.getWorldPosition(measured).distanceTo(support.plant) > support.reach.length * 0.004) {
    return false;
  }
  return raised.foot.getWorldPosition(measured).y - raised.plant.y >= plan.lift * raised.reach.length * 0.68;
}
