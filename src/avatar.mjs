import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export function createAvatar(stage, activity, mouthLevel) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const anchor = new THREE.Group();
  scene.add(anchor, new THREE.HemisphereLight(0xffffff, 0x9091ab, 2.2));
  const key = new THREE.DirectionalLight(0xfff2e6, 2);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 50);
  camera.position.z = 6;
  let width = 1;
  let height = 2;
  let avatar;
  let bones;
  let pointerX = 0;
  let pointerY = 0;
  let last = performance.now();
  let seconds = 0;
  let waveAt = -10;
  let nextBlink = 2.5;
  let previousState = 'idle';

  function frameAvatar() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    const aspect = w / h;
    const halfHeight = Math.max(height * 0.57, width * 0.55 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function pose(joints, time, state, dt) {
    const waveTime = time - waveAt;
    const wave = waveTime >= 0 && waveTime < 1.55 ? Math.sin(Math.PI * waveTime / 1.55) : 0;
    const breath = Math.sin(time * 2.1);
    const listening = state === 'listening';
    const thinking = state === 'thinking';
    const speaking = state === 'speaking';
    if (joints.hips) joints.hips.rotation.y = Math.sin(time * 0.95) * 0.035;
    if (joints.chest) {
      joints.chest.rotation.x = breath * 0.018 + (listening ? -0.045 : 0);
      joints.chest.rotation.z = Math.sin(time) * 0.025;
    }
    if (joints.head) {
      const factor = 1 - Math.exp(-dt * 8);
      const nod = speaking ? Math.sin(time * 5) * 0.055 : 0;
      joints.head.rotation.x += (pointerY * 0.12 + nod + (thinking ? -0.08 : 0) - joints.head.rotation.x) * factor;
      joints.head.rotation.y += (pointerX * 0.20 - joints.head.rotation.y) * factor;
      joints.head.rotation.z = thinking ? 0.11 : Math.sin(time * 0.9) * 0.026;
    }
    if (joints.leftUpperArm) joints.leftUpperArm.rotation.z = -1.18 + breath * 0.025;
    if (joints.rightUpperArm) joints.rightUpperArm.rotation.z = 1.18 - breath * 0.025 - wave * 1.4;
    if (joints.rightLowerArm) joints.rightLowerArm.rotation.z = -wave * (0.95 + Math.sin(waveTime * 18) * 0.25);
  }

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    throw new Error('El VRM debe contener sus texturas y recursos.');
  });
  const loader = new GLTFLoader(manager);
  loader.register((parser) => new VRMLoaderPlugin(parser));

  async function load(data) {
    const gltf = await loader.parseAsync(data, '');
    const next = gltf.userData.vrm;
    if (!next) {
      VRMUtils.deepDispose(gltf.scene);
      throw new Error('El archivo no contiene un avatar VRM.');
    }
    VRMUtils.rotateVRM0(next);
    const get = (name) => next.humanoid.getNormalizedBoneNode(name);
    const joints = {
      hips: get('hips'), chest: get('chest') ?? get('spine'), head: get('head'),
      leftUpperArm: get('leftUpperArm'), rightUpperArm: get('rightUpperArm'), rightLowerArm: get('rightLowerArm'),
    };
    pose(joints, 0, 'idle', 1);
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
    anchor.add(avatar.scene);
    width = size.x;
    height = size.y;
    frameAvatar();
  }

  stage.addEventListener('pointermove', (event) => {
    const box = stage.getBoundingClientRect();
    pointerX = (event.clientX - box.left) / box.width * 2 - 1;
    pointerY = (event.clientY - box.top) / box.height * 2 - 1;
  });
  stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; });
  new ResizeObserver(frameAvatar).observe(stage);

  renderer.setAnimationLoop((now) => {
    if (!avatar) return;
    const dt = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05);
    last = now;
    seconds += dt;
    const state = activity();
    if (state === 'speaking' && previousState !== state) waveAt = seconds;
    previousState = state;
    pose(bones, seconds, state, dt);
    const blinkTime = seconds - nextBlink;
    const blink = blinkTime >= 0 && blinkTime < 0.16 ? Math.sin(blinkTime / 0.16 * Math.PI) : 0;
    if (blinkTime > 0.16) nextBlink = seconds + 2.5 + Math.random() * 3;
    avatar.expressionManager?.setValue('blink', blink);
    avatar.expressionManager?.setValue('aa', mouthLevel());
    avatar.update(dt);
    renderer.render(scene, camera);
  });
  return { load };
}
