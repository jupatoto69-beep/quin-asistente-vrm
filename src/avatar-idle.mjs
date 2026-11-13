import { Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVRMAnimationHumanoidTracks, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';

const clips = [
  ['idle', 'idle.vrma'], ['idle', 'idle-3.vrma'], ['idle', 'idle-4.vrma'],
  ['talk', 'idle-talking-6.vrma'], ['talk', 'idle-talking-7.vrma'],
];
const crossfade = 1.15;
const excluded = new Set(['head', 'neck', 'leftEye', 'rightEye', 'jaw', 'leftToes', 'rightToes']);

export async function loadIdleClips(manager) {
  const loader = new GLTFLoader(manager);
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const results = await Promise.allSettled(clips.map(async ([group, name]) => {
    const response = await fetch('/movimiento/' + name);
    if (!response.ok) throw new Error('Falta el archivo de animación de reposo.');
    const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
    const clip = gltf.userData.vrmAnimations?.[0];
    if (!clip || !Number.isFinite(clip.duration) || clip.duration < 3) throw new Error('Animación de reposo no válida.');
    return { group, clip };
  }));
  return results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
}

export function createIdlePlayer(vrm, animations, controlled) {
  if (!animations.length) return null;
  const channels = new Map();
  const tracksByGroup = { idle: [], talk: [] };
  animations.forEach(({ group, clip: animation }, index) => {
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
    tracksByGroup[group].push({ duration: animation.duration, index });
  });
  const sample = new Quaternion();
  const nextSample = new Quaternion();
  const layers = [
    { group: tracksByGroup.idle, property: 'idleBlend', speed: 0.94, active: 0, elapsed: 0, strength: 0 },
    { group: tracksByGroup.talk, property: 'talkBlend', speed: 1.02, active: 0, elapsed: 0, strength: 0 },
  ].filter((layer) => layer.group.length);

  function applyLayer(layer, dt, pose) {
    const { group, property } = layer;
    layer.strength += (pose[property] - layer.strength) * (1 - Math.exp(-dt * 3.8));
    if (layer.strength < 0.001) return;
    layer.elapsed += dt * (pose.reduced ? 0.70 : layer.speed);
    const duration = group[layer.active].duration;
    if (layer.elapsed >= duration) {
      layer.active = (layer.active + 1) % group.length;
      layer.elapsed = (group.length > 1 ? crossfade : 0) + layer.elapsed - duration;
    }
    const next = (layer.active + 1) % group.length;
    const fadeTime = Math.max(0, layer.elapsed - (group[layer.active].duration - crossfade));
    const t = next === layer.active ? 0 : fadeTime / crossfade;
    const mix = t * t * (3 - 2 * t);
    for (const channel of channels.values()) {
      const current = channel.tracks[group[layer.active].index];
      const incoming = channel.tracks[group[next].index];
      if (!current) continue;
      sample.fromArray(current.evaluate(layer.elapsed)).normalize();
      if (mix > 0 && incoming) sample.slerp(nextSample.fromArray(incoming.evaluate(fadeTime)).normalize(), mix);
      const weight = layer.strength * (channel.arm ? (1 - pose.armGesture * 0.96)
        : channel.torso ? 0.67 * (1 - (pose.actingWeight ?? 0) * 0.75) : 1);
      channel.node.quaternion.slerp(sample, weight);
    }
  }

  function apply(dt, pose) {
    for (const channel of channels.values()) if (channel.reset) channel.node.quaternion.identity();
    for (const layer of layers) applyLayer(layer, dt, pose);
  }
  return { apply };
}
