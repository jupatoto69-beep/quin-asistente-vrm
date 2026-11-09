import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createMotion, restPose } from './avatar-motion.mjs';
import { createLimbReach, applyReach, clearTorso } from './avatar-reach.mjs';
import { capturePlants, legRig, plantFeet } from './avatar-support.mjs';
import { aimHand, fingerRig, reachHandGesture, relaxFingers, shapeHand } from './avatar-hands.mjs';
import { createIdlePlayer, loadIdleClips } from './avatar-idle.mjs';

function armRig(get, name, defaultSide) {
  const upper = get(name + 'UpperArm');
  const lower = get(name + 'LowerArm');
  const hand = get(name + 'Hand');
  if (!upper || !lower) return null;
  // The normalized rig keeps the elbow offset from the model's original rest pose.
  const { x, y } = lower.position;
  const side = Math.abs(x) > 0.00001 ? Math.sign(x) : defaultSide;
  const elevation = Math.atan2(y, Math.abs(x));
  return {
    upper, lower, hand, side, relaxed: side * (-1.38 - elevation),
    reach: createLimbReach(upper, lower, hand), fingers: fingerRig(get, name),
    upperAngles: new THREE.Vector3(), lowerAngles: new THREE.Vector3(), wrist: 0, curl: 0,
  };
}

const angles = new THREE.Vector3();

function applyPose(joints, p, blend, dt = 0, time = 0, resolveAim) {
  const rotate = (node, x, y, z) => {
    if (!node) return;
    const base = joints.bodyAngles.get(node);
    base.lerp(angles.set(x, y, z), blend);
    node.rotation.setFromVector3(base);
  };
  const { axis, leftArm, rightArm } = joints;
  rotate(joints.hips, 0, p.hipsY, p.hipsZ * axis);
  rotate(joints.chest, p.chestX * axis, p.chestY, p.chestZ * axis);
  rotate(joints.head, p.headX * axis, p.headY, p.headZ * axis);
  for (const [arm, lift, bend, forward, elbow, wrist, curl] of [
    [leftArm, p.leftLift, p.leftBend, p.leftForward, p.leftElbow, p.leftWrist, p.leftCurl],
    [rightArm, p.rightLift, p.rightBend, p.rightForward, p.rightElbow, p.rightWrist, p.rightCurl],
  ]) {
    if (!arm) continue;
    arm.upperAngles.lerp(angles.set(0, -arm.side * axis * forward, arm.relaxed + arm.side * lift), blend);
    arm.lowerAngles.lerp(angles.set(0, -arm.side * axis * elbow, arm.side * bend), blend);
    arm.wrist += (wrist - arm.wrist) * blend;
    arm.curl += (curl - arm.curl) * blend;
    arm.upper.rotation.setFromVector3(arm.upperAngles);
    arm.lower.rotation.setFromVector3(arm.lowerAngles);
    arm.hand?.rotation.set(0, 0, arm.side * arm.wrist);
    for (const { node } of arm.fingers) node.quaternion.identity();
  }
  for (const leg of joints.legs) {
    leg.thigh.quaternion.identity();
    leg.shin.quaternion.identity();
    leg.foot.quaternion.identity();
  }
  joints.idle?.apply(dt, p);
  for (const arm of [leftArm, rightArm]) {
    if (arm) relaxFingers(arm, time, 1 - p.idleBlend * 0.56);
  }
  let footMoved = false;
  if (joints.hipRest) {
    const { hips, hipRest, legLength } = joints;
    joints.hipShift += (p.hipShift - joints.hipShift) * blend;
    joints.hipDrop += (0.024 + p.hipDrop - joints.hipDrop) * blend;
    joints.hipDepth += (p.hipDepth - joints.hipDepth) * blend;
    hips.position.set(hipRest.x + axis * joints.hipShift * legLength,
      hipRest.y - joints.hipDrop * legLength, hipRest.z + axis * joints.hipDepth * legLength);
    footMoved = plantFeet(joints.legs, p, blend);
  }
  const sameReach = p.reach && (joints.reachWeight < 0.04 ||
    (p.reach.kind === joints.reach?.kind && p.reach.side === joints.reach?.side &&
      p.reach.target === joints.reach?.target && p.reach.direction === joints.reach?.direction));
  if (sameReach) joints.reach = p.reach;
  joints.reachWeight += ((sameReach ? p.reach.strength : 0) - joints.reachWeight) * blend;
  const gesture = joints.reach;
  const directional = gesture?.kind === 'point' || gesture?.kind === 'thumb';
  const aimArm = directional ? reachHandGesture(joints, gesture, resolveAim?.(gesture.target), joints.reachWeight) : null;
  const moved = directional ? !!aimArm : gesture && applyReach(joints, gesture, joints.reachWeight);
  clearTorso(joints);
  if (aimArm) aimHand(aimArm, gesture.kind, joints.reachWeight);
  if (p.handShape) {
    const { side, kind, strength, phase } = p.handShape;
    if (side <= 0) shapeHand(leftArm, kind, strength, phase);
    if (side >= 0 || side === undefined) shapeHand(rightArm, kind, strength, phase);
  }
  if (footMoved) return p.foot.kind;
  return moved && joints.reachWeight >= (p.reduced ? 0.17 : 0.72) ? gesture.kind : undefined;
}

const directions = {
  izquierda: { x: -0.65, y: 0.37 }, derecha: { x: 1.65, y: 0.37 },
  arriba: { x: 0.62, y: -0.62 }, abajo: { x: 0.63, y: 1.62 },
};
const closeups = { face: ['face'], hands: ['leftHand', 'rightHand'], feet: ['leftFoot', 'rightFoot'] };

export function createAvatar(stage, activity, mouthLevel, getPointer, getTarget) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-label', 'Tocar a Quin');
  canvas.setAttribute('aria-description', 'Arrastra para girar, usa la rueda para acercar y pulsa Inicio para restablecer la vista.');
  canvas.title = 'Clic para saludar · Arrastra para girar · Rueda para acercar · Doble clic para restablecer';
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const anchor = new THREE.Group();
  const gaze = new THREE.Object3D();
  scene.add(anchor, gaze, new THREE.HemisphereLight(0xffffff, 0x9091ab, 2.2));
  const key = new THREE.DirectionalLight(0xfff2e6, 2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  camera.position.z = 6;
  let width = 1;
  let height = 2;
  let fittedHalfWidth = 1;
  let fittedHalfHeight = 1;
  let distance = 6;
  let yaw = 0;
  let zoom = 1;
  const viewCenter = new THREE.Vector2();
  let orbitPointer;
  let suppressTap = false;
  let avatar;
  let bones;
  let pointer = { x: 0, y: 0 };
  let cursorX;
  let cursorY;
  let lastPointerMove = -10;
  let motion = createMotion();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const expressions = ['happy', 'sad', 'angry', 'surprised', 'relaxed'];
  let cursorPending = false;
  let nextCursor = 0;
  let last = performance.now();
  let seconds = 0;
  let nextBlink = 2.5;
  const aimTarget = { position: new THREE.Vector3(), normal: new THREE.Vector3(0, 0, 1) };
  const bodyPoint = new THREE.Vector3();

  function stageTarget(name) {
    if (name === 'cursor') return { x: (pointer.x + 1) / 2, y: (pointer.y + 1) / 2 };
    return directions[name] ?? getTarget?.(name);
  }

  function resolveAim(name) {
    if (!name) return null;
    const point = stageTarget(name);
    if (!point) return null;
    aimTarget.position.set(THREE.MathUtils.lerp(camera.left, camera.right, point.x),
      THREE.MathUtils.lerp(camera.top, camera.bottom, point.y), 0).applyQuaternion(camera.quaternion);
    return aimTarget;
  }

  function orientCamera() {
    aimTarget.normal.set(Math.sin(yaw), 0, Math.cos(yaw));
    camera.position.copy(aimTarget.normal).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  function updateProjection() {
    const halfWidth = fittedHalfWidth / zoom;
    const halfHeight = fittedHalfHeight / zoom;
    const limitX = Math.max(0, fittedHalfWidth - halfWidth);
    const limitY = Math.max(0, fittedHalfHeight - halfHeight);
    viewCenter.x = THREE.MathUtils.clamp(viewCenter.x, -limitX, limitX);
    viewCenter.y = THREE.MathUtils.clamp(viewCenter.y, -limitY, limitY);
    camera.left = viewCenter.x - halfWidth;
    camera.right = viewCenter.x + halfWidth;
    camera.top = viewCenter.y + halfHeight;
    camera.bottom = viewCenter.y - halfHeight;
    camera.updateProjectionMatrix();
  }

  function resetView() {
    yaw = 0;
    zoom = 1;
    viewCenter.set(0, 0);
    orientCamera();
    updateProjection();
  }

  function placeBodyPoint(part) {
    bones.landmarks[part].getWorldPosition(bodyPoint);
    // The head and ankle joints sit below the face and above the sole, respectively.
    if (part === 'face') bodyPoint.y += height * 0.045;
    if (part.endsWith('Foot')) bodyPoint.y -= height * 0.025;
    return bodyPoint;
  }

  function observeBody() {
    if (!bones) return;
    const front = aimTarget.normal.z;
    const visible = Object.keys(bones.landmarks).filter((part) => {
      const point = placeBodyPoint(part).project(camera);
      return Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;
    });
    const raised = bones.legs.find((leg) =>
      leg.foot.getWorldPosition(bodyPoint).y - leg.plant.y > leg.reach.length * 0.026);
    return {
      angle: front >= 0.71 ? 'front' : front <= -0.71 ? 'back' : 'side',
      visible,
      raisedFoot: raised?.side,
      posture: bones.legs.length === 2 ? bones.hipDrop > 0.075 ? 'crouched' : 'standing' : undefined,
    };
  }

  function showBody(view) {
    if (!bones) return false;
    if (view === 'full') {
      resetView();
      return true;
    }
    if (view === 'front' || view === 'back' || view === 'side') {
      yaw = view === 'back' ? Math.PI : view === 'side' ? Math.PI / 2 : 0;
      orientCamera();
      return true;
    }
    const parts = closeups[view];
    if (!parts?.every((part) => bones.landmarks[part])) return false;
    if (view === 'face') {
      yaw = 0;
      orientCamera();
    }
    const bounds = new THREE.Box2();
    const point = new THREE.Vector2();
    for (const part of parts) {
      const local = placeBodyPoint(part).applyMatrix4(camera.matrixWorldInverse);
      bounds.expandByPoint(point.set(local.x, local.y));
    }
    const size = bounds.getSize(point);
    const margin = height * (view === 'face' ? 0.12 : 0.095);
    zoom = THREE.MathUtils.clamp(
      Math.min(fittedHalfWidth / (size.x / 2 + margin), fittedHalfHeight / (size.y / 2 + margin)),
      1, 3,
    );
    bounds.getCenter(viewCenter);
    updateProjection();
    return true;
  }

  function frameAvatar() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const aspect = w / h;
    fittedHalfHeight = Math.max(height * 0.62, width * 0.55 / aspect);
    fittedHalfWidth = fittedHalfHeight * aspect;
    updateProjection();
    renderer.setSize(w, h, false);
  }

  function aimAt(x, y) {
    if (cursorX === undefined || Math.abs(x - cursorX) + Math.abs(y - cursorY) > 2) {
      cursorX = x;
      cursorY = y;
      lastPointerMove = seconds;
    }
    const box = stage.getBoundingClientRect();
    const limit = reducedMotion.matches ? 0.35 : 1;
    pointer = {
      x: THREE.MathUtils.clamp((x - box.left) / Math.max(1, box.width) * 2 - 1, -1, 1) * limit,
      y: THREE.MathUtils.clamp((y - box.top) / Math.max(1, box.height) * 2 - 1, -1, 1) * limit,
    };
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    throw new Error('El VRM debe contener sus texturas y recursos.');
  });
  const loader = new GLTFLoader(manager);
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const idleClips = loadIdleClips(manager);

  async function load(data) {
    const gltf = await loader.parseAsync(data, '');
    const next = gltf.userData.vrm;
    if (!next) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error('El archivo no contiene un avatar VRM.');
    }
    VRMUtils.rotateVRM0(next);
    const get = (name) => next.humanoid.getNormalizedBoneNode(name);
    const leftSide = next.meta.metaVersion === '0' ? -1 : 1;
    const hips = get('hips');
    const chest = get('chest') ?? get('spine');
    const head = get('head');
    const joints = {
      axis: leftSide,
      reachWeight: 0, hipShift: 0, hipDrop: 0, hipDepth: 0,
      hips, chest, head, bodyAngles: new Map([hips, chest, head].map((node) => [node, new THREE.Vector3()])),
      leftArm: armRig(get, 'left', leftSide),
      rightArm: armRig(get, 'right', -leftSide),
      legs: ['left', 'right'].map((name) => legRig(get, name, leftSide)).filter(Boolean),
      landmarks: Object.fromEntries(Object.entries({
        face: head, torso: chest, leftHand: get('leftHand'), rightHand: get('rightHand'),
        leftFoot: get('leftFoot'), rightFoot: get('rightFoot'),
      }).filter(([, node]) => node)),
    };
    applyPose(joints, restPose(), 1);
    next.update(0);
    next.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(next.scene, true);
    const size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y < 0.1 || size.y > 20) {
      VRMUtils.deepDispose(next.scene);
      throw new Error('No se pudo encuadrar el avatar. Revisa la escala del VRM.');
    }
    if (avatar) {
      anchor.remove(avatar.scene);
      VRMUtils.deepDispose(avatar.scene);
    }
    anchor.position.copy(box.getCenter(new THREE.Vector3())).negate();
    avatar = next;
    bones = joints;
    motion = createMotion();
    seconds = 0;
    lastPointerMove = -10;
    nextBlink = 2.5;
    anchor.add(avatar.scene);
    anchor.updateMatrixWorld(true);
    avatar.springBoneManager?.reset();
    if (hips && joints.legs.length) {
      capturePlants(joints.legs, leftSide);
      joints.hipRest = hips.position.clone();
      joints.legLength = Math.min(...joints.legs.map((leg) => leg.reach.length));
    }
    const controlled = new Set([hips, chest, head]);
    for (const arm of [joints.leftArm, joints.rightArm]) {
      if (!arm) continue;
      for (const node of [arm.upper, arm.lower, arm.hand, ...arm.fingers.map((finger) => finger.node)]) controlled.add(node);
    }
    for (const leg of joints.legs) for (const node of [leg.thigh, leg.shin, leg.foot]) controlled.add(node);
    joints.idle = createIdlePlayer(avatar, await idleClips, controlled);
    width = Math.hypot(size.x, size.z);
    height = size.y;
    distance = Math.max(6, size.length());
    camera.far = Math.max(50, distance * 3);
    gaze.position.set(0, height * 0.40, 2.1 * height);
    if (avatar.lookAt) avatar.lookAt.target = gaze;
    frameAvatar();
    resetView();
  }

  stage.addEventListener('pointermove', (event) => aimAt(event.clientX, event.clientY));
  canvas.addEventListener('pointerdown', (event) => {
    if (!avatar || event.button !== 0 || orbitPointer) return;
    orbitPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw };
    suppressTap = false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (orbitPointer?.id !== event.pointerId) return;
    const dx = event.clientX - orbitPointer.x;
    if (!suppressTap && Math.hypot(dx, event.clientY - orbitPointer.y) < 5) return;
    suppressTap = true;
    canvas.classList.add('orbiting');
    yaw = (orbitPointer.yaw - dx * 0.012) % (2 * Math.PI);
    orientCamera();
  });
  function endOrbit(event) {
    if (orbitPointer?.id !== event.pointerId) return;
    orbitPointer = undefined;
    canvas.classList.remove('orbiting');
  }
  canvas.addEventListener('pointerup', endOrbit);
  canvas.addEventListener('pointercancel', endOrbit);
  canvas.addEventListener('lostpointercapture', endOrbit);
  canvas.addEventListener('click', (event) => {
    if (event.detail === 0 || (!suppressTap && event.detail === 1)) motion.tap();
  });
  canvas.addEventListener('dblclick', () => { if (!suppressTap) resetView(); });
  canvas.addEventListener('wheel', (event) => {
    if (!avatar || event.deltaY === 0) return;
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1;
    const next = THREE.MathUtils.clamp(zoom * Math.exp(-event.deltaY * unit * 0.0025), 0.72, 3);
    if (next === zoom) return;
    const delta = 1 / zoom - 1 / next;
    viewCenter.x += ((event.clientX - box.left) / Math.max(1, box.width) * 2 - 1) * fittedHalfWidth * delta;
    viewCenter.y += (1 - (event.clientY - box.top) / Math.max(1, box.height) * 2) * fittedHalfHeight * delta;
    zoom = next;
    updateProjection();
  }, { passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Home') {
      event.preventDefault();
      resetView();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) motion.tap();
  });
  new ResizeObserver(frameAvatar).observe(stage);

  renderer.setAnimationLoop((now) => {
    if (!avatar) return;
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    seconds += dt;
    if (getPointer && !cursorPending && !document.hidden && now >= nextCursor) {
      nextCursor = now + 100;
      cursorPending = true;
      getPointer().then((point) => {
        if (point) aimAt(point.x * window.innerWidth, point.y * window.innerHeight);
      }).catch(() => {}).finally(() => { cursorPending = false; });
    }
    const { state, tone, reaction, companion } = activity();
    const focus = Math.max(0, aimTarget.normal.z) *
      (1 - 0.72 * THREE.MathUtils.clamp((seconds - lastPointerMove - 1.2) / 2, 0, 1));
    const p = motion.step(seconds, dt, state, tone, reaction, mouthLevel(), {
      x: pointer.x * focus, y: pointer.y * focus,
    }, reducedMotion.matches, companion);
    const blend = 1 - Math.exp(-dt * 9);
    const reached = applyPose(bones, p, blend, dt, seconds, resolveAim);
    gaze.position.x += (p.gazeX * height * 0.62 - gaze.position.x) * blend;
    gaze.position.y += ((0.40 - p.gazeY * 0.42) * height - gaze.position.y) * blend;
    const blinkTime = seconds - nextBlink;
    const blink = blinkTime >= 0 && blinkTime < 0.16 ? Math.sin(blinkTime / 0.16 * Math.PI) : 0;
    if (blinkTime > 0.16) nextBlink = seconds + 2.1 + Math.random() * 3.7;
    const face = avatar.expressionManager;
    for (const name of expressions) {
      const weight = face?.getValue(name);
      if (weight != null) face.setValue(name, weight + ((name === p.face ? p.expression : 0) - weight) * blend);
    }
    face?.setValue('blink', blink);
    face?.setValue('aa', p.mouth);
    avatar.update(dt);
    renderer.render(scene, camera);
    motion.rendered(reached);
  });
  function hasFinger(arm, name) {
    return !!arm?.reach && arm.fingers.some((finger) => finger.name === name && finger.segment === 2);
  }

  function capabilities() {
    if (!bones) return [];
    const { leftArm, rightArm, head } = bones;
    const actions = [];
    if (hasFinger(leftArm, 'Index') || hasFinger(rightArm, 'Index')) actions.push('point');
    if (hasFinger(leftArm, 'Thumb') || hasFinger(rightArm, 'Thumb')) actions.push('thumb');
    if (rightArm?.hand) actions.push('wave');
    if (leftArm?.reach || rightArm?.reach) actions.push('raise', 'hair', 'arm');
    if (leftArm?.fingers.length || rightArm?.fingers.length) actions.push('hands');
    if (leftArm?.reach && rightArm?.reach) actions.push('stretch');
    if (head) actions.push('nod', 'shake');
    if (head || bones.chest || bones.hips) actions.push('body');
    if (bones.hipRest && bones.legs.length === 2) actions.push('leg', 'crouch', 'dance');
    return actions;
  }

  async function perform(cue, waitEnd) {
      if (!capabilities().includes(cue.kind)) return false;
      const { leftArm, rightArm } = bones;
      const arm = cue.side < 0 ? leftArm : rightArm;
      if (cue.kind === 'thumb' && !hasFinger(arm, 'Thumb')) return false;
      if (cue.kind === 'raise' && !arm?.reach) return false;
      if (cue.kind === 'arm' && (cue.side === 0 ? !leftArm?.reach || !rightArm?.reach : !arm?.reach)) return false;
      if (cue.kind === 'hands' && (cue.side === 0 ? !leftArm?.fingers.length || !rightArm?.fingers.length : !arm?.fingers.length)) return false;
      if (cue.kind === 'body') {
        const part = { head: bones.head, torso: bones.chest, hips: bones.hips, shoulders: leftArm || rightArm };
        if (!part[cue.part]) return false;
      }
      if (cue.kind === 'hair') {
        const side = leftArm?.reach && rightArm?.reach ? undefined : leftArm?.reach ? -1 : 1;
        return motion.gesture({ ...cue, side }, waitEnd);
      }
      if (cue.kind !== 'point') return motion.gesture(cue, waitEnd);
      const point = stageTarget(cue.target);
      if (!point) return false;
      const viewSide = (point.x < 0.5 ? -1 : 1) * (aimTarget.normal.z < 0 ? -1 : 1);
      const preferred = leftArm?.side * bones.axis === viewSide ? -1 : 1;
      const side = hasFinger(preferred < 0 ? leftArm : rightArm, 'Index') ? preferred : -preferred;
      return motion.gesture({ ...cue, side }, waitEnd);
  }

  return {
    load, capabilities, reply: (tone, reaction) => motion.reply(tone, reaction), observeBody,
    async gesture(cue) {
      if (cue.kind === 'view') return showBody(cue.view);
      if (cue.kind !== 'sequence') return perform(cue, false);
      for (const step of cue.steps) {
        if (!await perform(step, true)) return false;
      }
      return true;
    },
  };
}
