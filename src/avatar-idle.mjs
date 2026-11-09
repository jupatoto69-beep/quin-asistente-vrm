import { Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVRMAnimationHumanoidTracks, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

const urls = ['/movimiento/idle.vrma', '/movimiento/idle-3.vrma'];
const crossfade = 1.15;
const excluded = new Set(['head', 'neck', 'leftEye', 'rightEye', 'jaw', 'leftToes', 'rightToes']);

export async function loadIdleClips(manager) {
  const loader = new GLTFLoader(manager);
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const results = await Promise.allSettled(urls.map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falta el archivo de animación de reposo.');
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
    const clip = gltf.userData.vrmAnimations?.[0];
    if (!clip || !Number.isFinite(clip.duration) || clip.duration < 3) throw new Error('Animación de reposo no válida.');
    return clip;
  }));
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
}

export function createIdlePlayer(vrm, animations, controlled) {
  if (!animations.length) return null;
  const channels = new Map();
  const clips = animations.map((animation, index) => {
    const tracks = createVRMAnimationHumanoidTracks(animation, vrm.humanoid, vrm.meta.metaVersion).rotation;
    for (const [name, track] of tracks) {
      if (excluded.has(name)) continue;
      const node = vrm.humanoid.getNormalizedBoneNode(name);
      if (!node) continue;
      if (!channels.has(name)) channels.set(name, {
        node, tracks: [], reset: !controlled.has(node),
        arm: /Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Little/.test(name),
        torso: /hips|spine|chest|Chest/.test(name),
      });
      channels.get(name).tracks[index] = track.createInterpolant();
    }
    return animation.duration;
  });
  const sample = new Quaternion();
  const nextSample = new Quaternion();
  let active = 0;
  let elapsed = 0;
  let strength = 0;

  function apply(dt, pose) {
    strength += (pose.idleBlend - strength) * (1 - Math.exp(-dt * 3.8));
    elapsed += dt * (pose.reduced ? 0.70 : 0.94);
    const duration = clips[active];
    if (elapsed >= duration) {
      active = (active + 1) % clips.length;
      elapsed = (clips.length > 1 ? crossfade : 0) + elapsed - duration;
    }
    const next = (active + 1) % clips.length;
    const fadeTime = Math.max(0, elapsed - (clips[active] - crossfade));
    const t = next === active ? 0 : fadeTime / crossfade;
    const mix = t * t * (3 - 2 * t);
    for (const channel of channels.values()) {
      const current = channel.tracks[active];
      const incoming = channel.tracks[next];
      if (channel.reset) channel.node.quaternion.identity();
      if (strength < 0.001 || !current) continue;
      sample.fromArray(current.evaluate(elapsed)).normalize();
      if (mix > 0 && incoming) sample.slerp(nextSample.fromArray(incoming.evaluate(fadeTime)).normalize(), mix);
      const weight = channel.arm ? strength * (1 - pose.armGesture * 0.96) : channel.torso ? strength * 0.67 : strength;
      channel.node.quaternion.slerp(sample, weight);
    }
  }
  return { apply };
}
