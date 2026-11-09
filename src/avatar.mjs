import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createMotion, restPose } from './avatar-motion.mjs';
import { createLimbReach, applyReach, clearTorso } from './avatar-reach.mjs';
import { capturePlants, fingerRig, legRig, plantFeet } from './avatar-support.mjs';
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

function applyPose(joints, p, blend, dt = 0) {
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
    for (const finger of arm.fingers) finger.node.quaternion.setFromAxisAngle(finger.axis, arm.curl * finger.curl);
  }
  for (const leg of joints.legs) {
    leg.thigh.quaternion.identity();
    leg.shin.quaternion.identity();
    leg.foot.quaternion.identity();
  }
  joints.idle?.apply(dt, p);
  if (joints.hipRest) {
    const { hips, hipRest, legLength } = joints;
    joints.hipShift += (p.hipShift - joints.hipShift) * blend;
    joints.hipDrop += (0.024 + p.hipDrop - joints.hipDrop) * blend;
    hips.position.set(hipRest.x + axis * joints.hipShift * legLength,
      hipRest.y - joints.hipDrop * legLength, hipRest.z);
    plantFeet(joints.legs, p, blend);
  }
  const sameReach = p.reach && (joints.reachWeight < 0.04 ||
    (p.reach.kind === joints.reach?.kind && p.reach.side === joints.reach?.side));
  if (sameReach) joints.reach = p.reach;
  joints.reachWeight += ((sameReach ? p.reach.strength : 0) - joints.reachWeight) * blend;
  if (joints.reach) applyReach(joints, joints.reach, joints.reachWeight);
  clearTorso(joints);
}

export function createAvatar(stage, activity, mouthLevel, getPointer) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'button');
  renderer.domElement.setAttribute('aria-label', 'Tocar a Quin');
  renderer.domElement.title = 'Haz clic para que Quin reaccione';
  stage.prepend(renderer.domElement);

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

  function frameAvatar() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const aspect = w / h;
    const halfHeight = Math.max(height * 0.62, width * 0.55 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
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
      reachWeight: 0, hipShift: 0, hipDrop: 0,
      hips, chest, head, bodyAngles: new Map([hips, chest, head].map((node) => [node, new THREE.Vector3()])),
      leftArm: armRig(get, 'left', leftSide),
      rightArm: armRig(get, 'right', -leftSide),
      legs: ['left', 'right'].map((name) => legRig(get, name, leftSide)).filter(Boolean),
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
    width = size.x;
    height = size.y;
    gaze.position.set(0, height * 0.40, 2.1 * height);
    if (avatar.lookAt) avatar.lookAt.target = gaze;
    frameAvatar();
  }

  stage.addEventListener('pointermove', (event) => aimAt(event.clientX, event.clientY));
  renderer.domElement.addEventListener('click', () => motion.tap());
  renderer.domElement.addEventListener('keydown', (event) => {
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
    const { state, tone, reaction } = activity();
    const focus = 1 - 0.72 * THREE.MathUtils.clamp((seconds - lastPointerMove - 1.2) / 2, 0, 1);
    const p = motion.step(seconds, dt, state, tone, reaction, mouthLevel(), {
      x: pointer.x * focus, y: pointer.y * focus,
    }, reducedMotion.matches);
    const blend = 1 - Math.exp(-dt * 9);
    applyPose(bones, p, blend, dt);
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
  });

    return { load, reply:
   (tone, reaction) => motion.reply(tone, reaction) };
}
