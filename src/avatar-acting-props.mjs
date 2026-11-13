import {
  CanvasTexture, Color, ConeGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry,
  Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';

function icon(name) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const color = name === 'spark' || name === 'surprise' ? '#ffe49b' : '#e2d1ff';
  function trace(draw) {
    ctx.beginPath();
    draw();
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#302243';
    ctx.stroke();
    ctx.lineWidth = 7.5;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  if (name === 'clock') {
    trace(() => ctx.arc(64, 64, 36, 0, Math.PI * 2));
    trace(() => {
      ctx.moveTo(65, 42);
      ctx.lineTo(65, 65);
      ctx.lineTo(81, 74);
    });
  } else if (name === 'spark' || name === 'surprise') {
    for (const [x, y, size] of [[52, 64, 25], [86, 35, 12], [88, 90, 10]]) {
      trace(() => {
        if (name === 'surprise') {
          ctx.moveTo(x - size / 3, y + size / 2);
          ctx.lineTo(x + size / 3, y - size / 2);
        } else {
          ctx.moveTo(x, y - size);
          ctx.quadraticCurveTo(x + 3, y - 3, x + size, y);
          ctx.quadraticCurveTo(x + 3, y + 3, x, y + size);
          ctx.quadraticCurveTo(x - 3, y + 3, x - size, y);
          ctx.quadraticCurveTo(x - 3, y - 3, x, y - size);
        }
      });
    }
  } else {
    ctx.font = 'bold 75px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#302243';
    ctx.strokeText('?', 64, 65);
    ctx.fillStyle = color;
    ctx.fillText('?', 64, 65);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makePlush() {
  const group = new Group();
  const sphere = new SphereGeometry(1, 24, 16);
  const cone = new ConeGeometry(1, 2, 3);
  const colors = ['#211b2d', '#42334c', '#f4c2db', '#ba82b8', '#eee2ef'];
  const palette = colors.map((color) => new MeshStandardMaterial({ color, roughness: 0.91, transparent: true }));
  function shape(geometry, index, position, scale, tilt = 0) {
    const mesh = new Mesh(geometry, palette[index]);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.rotation.z = tilt;
    group.add(mesh);
  }
  shape(sphere, 0, [0, -0.085, 0], [0.20, 0.22, 0.14]);
  shape(sphere, 0, [0, 0.158, 0], [0.24, 0.178, 0.156]);
  for (const side of [-1, 1]) {
    shape(cone, 0, [side * 0.155, 0.302, -0.018], [0.093, 0.095, 0.062], -side * 0.23);
    shape(cone, 3, [side * 0.159, 0.304, 0.026], [0.046, 0.061, 0.028], -side * 0.23);
    shape(sphere, 4, [side * 0.086, 0.177, 0.149], [0.039, 0.010, 0.015], side * 0.30);
    shape(sphere, 1, [side * 0.105, -0.242, 0.093], [0.075, 0.065, 0.075]);
    shape(sphere, 2, [side * 0.106, -0.24, 0.163], [0.033, 0.020, 0.009]);
    shape(sphere, 3, [side * 0.061, 0.001, 0.149], [0.064, 0.033, 0.024], -side * 0.34);
  }
  shape(sphere, 2, [0, 0.127, 0.157], [0.028, 0.019, 0.013]);
  shape(sphere, 2, [0, -0.006, 0.168], [0.024, 0.032, 0.017]);
  group.visible = false;
  return { group, palette };
}

export function createActingProps(scene) {
  const cushion = new Group();
  const upholstery = new MeshStandardMaterial({
    color: new Color('#38304b'), transparent: true, opacity: 0, roughness: 0.96,
  });
  const piping = new MeshStandardMaterial({
    color: new Color('#655478'), transparent: true, opacity: 0, roughness: 1,
  });
  const pillow = new Mesh(new SphereGeometry(1, 40, 24), upholstery);
  const seam = new Mesh(new TorusGeometry(0.985, 0.012, 8, 60), piping);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = -0.19;
  cushion.add(pillow, seam);
  cushion.visible = false;
  scene.add(cushion);
  const plush = makePlush();
  scene.add(plush.group);

  const effect = new Sprite(new SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  effect.visible = false;
  scene.add(effect);
  const textures = new Map();
  const rest = new Vector3();
  const proportions = new Vector3();
  let seatOpacity = 0;
  let effectOpacity = 0;
  let cushionReady = false;
  let plushOpacity = 0;
  const forward = new Quaternion();
  const flip = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

  function configure(joints, floor, height) {
    cushionReady = !!joints.hipRest && joints.legs.length === 2;
    cushion.visible = effect.visible = plush.group.visible = false;
    seatOpacity = effectOpacity = plushOpacity = 0;
    if (!cushionReady) return;
    const hip = joints.hips.getWorldPosition(rest);
    const top = Math.max(floor + height * 0.17, hip.y - joints.legLength * 0.625);
    const halfHeight = (top - floor) / 2;
    cushion.position.set(hip.x, floor + halfHeight, hip.z - joints.legLength * 0.44);
    proportions.set(height * 0.246, halfHeight, height * 0.205);
  }

  function update(pose, joints, height, time, blend, facing) {
    const seat = cushionReady ? pose.seat : 0;
    seatOpacity += (Math.min(1, seat * 2.5) - seatOpacity) * blend;
    cushion.visible = seatOpacity > 0.012;
    if (cushion.visible) {
      cushion.scale.copy(proportions);
      cushion.scale.x *= 0.91 + seatOpacity * 0.09;
      cushion.scale.z *= 0.91 + seatOpacity * 0.09;
      upholstery.opacity = seatOpacity;
      piping.opacity = seatOpacity * 0.83;
    }

    const armLength = joints.leftArm?.reach?.length ?? joints.rightArm?.reach?.length;
    const cuddle = joints.chest && armLength ? pose.plush : 0;
    plushOpacity += (Math.min(1, cuddle * 1.8) - plushOpacity) * blend;
    plush.group.visible = plushOpacity > 0.02;
    if (plush.group.visible && joints.chest && armLength) {
      const cat = plush.group;
      cat.position.set(0, armLength * 0.19, armLength * joints.axis * 0.62);
      joints.chest.localToWorld(cat.position);
      joints.chest.getWorldQuaternion(forward);
      cat.quaternion.copy(joints.axis < 0 ? forward.multiply(flip) : forward);
      cat.scale.setScalar(armLength * (0.91 + plushOpacity * 0.09));
      for (const material of plush.palette) material.opacity = plushOpacity;
    }

    const wanted = pose.effect && joints.head && facing > 0.38 ? pose.actingWeight * 0.92 : 0;
    effectOpacity += (wanted - effectOpacity) * blend;
    effect.visible = effectOpacity > 0.02;
    if (!effect.visible) return;
    if (pose.effect) {
      if (!textures.has(pose.effect)) textures.set(pose.effect, icon(pose.effect));
      effect.material.map = textures.get(pose.effect);
    }
    joints.head.getWorldPosition(effect.position);
    effect.position.x += height * 0.13;
    effect.position.y += height * (0.115 + Math.sin(time * 2.8) * 0.005);
    effect.position.z += height * 0.065;
    const size = height * (0.086 + effectOpacity * 0.023);
    effect.scale.set(size, size, 1);
    effect.material.opacity = effectOpacity;
  }

  return { configure, update };
}
