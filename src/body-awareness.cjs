const { bodyRequest } = require('./hand-cues.cjs');

const regions = {
  face: 'la cabeza', torso: 'el torso', leftHand: 'la mano izquierda', rightHand: 'la mano derecha',
  leftFoot: 'el pie izquierdo', rightFoot: 'el pie derecho',
};
const angles = { front: 'de frente', back: 'de espaldas', side: 'de perfil' };
const views = {
  full: 'Listo, volví al encuadre de cuerpo completo.',
  front: 'Listo, ahora me ves de frente.',
  back: 'Listo, ahora me ves de espaldas.',
  side: 'Listo, ahora me ves de perfil.',
  face: 'Te acerqué la vista a mi cara.',
  hands: 'Ajusté el encuadre hacia mis manos.',
  feet: 'Ajusté el encuadre hacia mis pies.',
};
const list = new Intl.ListFormat('es');

function bodyIntent(text) {
  const words = bodyRequest(text).replace(/^[¿¡]/u, '');
  if (/^(?:(?:muestrame|quiero ver) (?:tu )?cuerpo completo|quiero verte (?:de cuerpo completo|entera)|(?:vuelve a|ponte|muestrate) (?:la vista de )?(?:cuerpo completo|de cuerpo completo)|(?:restablece|reinicia) (?:el encuadre|la vista))$/.test(words)) return { view: 'full' };
  const angle = /^(?:quiero verte|muestrate|ponte|gira|ponte para verte) (de frente|de espaldas?|de perfil|de lado)$/.exec(words)?.[1];
  if (angle) return { view: angle === 'de frente' ? 'front' : angle.startsWith('de espalda') ? 'back' : 'side' };
  const region = /^(?:muestrame (?:tu|tus|la|las|los)|quiero ver (?:tu|tus|la|las|los)|acerca la vista a (?:tu|tus|la|las|los)) (cara|rostro|manos|pies)$/.exec(words)?.[1];
  if (region) return { view: region === 'manos' ? 'hands' : region === 'pies' ? 'feet' : 'face' };
  const other = /^(?:(?:ahora|y|levanta|mueve|hazlo con) )?(?:el otro(?: (pie|brazo|pulgar))?|la otra(?: (pierna|mano))?)$/.exec(words);
  if (other) return { other: other[1] ?? other[2] ?? true };
  if (/^(?:que|cual) (?:de tus )?(?:pie|pierna|rodilla) (?:levantaste|alzaste|moviste|doblaste|flexionaste)$|^cual (?:levantaste|alzaste)$/.test(words)) return { topic: 'lastFoot' };
  if (/^(?:que (?:gesto|movimiento) (?:hiciste|acabas de hacer)|que moviste|cual fue tu ultimo (?:gesto|movimiento))$/.test(words)) return { topic: 'lastGesture' };
  const visible = /^(?:(?:se te ven|se ven|puedo ver) (?:tus|los|las)|(?:por que )?no te veo (?:los|las)) (pies|manos)$/.exec(words)?.[1];
  if (visible) return { topic: visible === 'pies' ? 'feet' : 'hands' };
  if (/^(?:como (?:estas|te ves) (?:en la ventana|en pantalla|encuadrada)|que (?:partes de tu cuerpo|parte de ti) (?:se ven|se ve|puedo ver)|(?:estas|te veo|se te ve) de (?:frente|espaldas?|perfil|lado|cuerpo completo)|como (?:te veo|estas) (?:desde mi lado|de frente))$/.test(words)) return { topic: 'view' };
  if (/^(?:en que postura estas|que postura tienes|que estas haciendo con tu cuerpo|como estas (?:parada|de pie)|estas (?:de pie|parada|sentada|agachada)|que pie tienes (?:levantado|en el aire))$/.test(words)) return { topic: 'pose' };
  if (/^(?:en que pie te apoyas|que pie tienes apoyado)$/.test(words)) return { topic: 'support' };
  if (/^(?:tienes conciencia (?:corporal|de tu cuerpo)|puedes (?:sentir|verte|ver) (?:tu cuerpo|a ti misma)|sientes tu cuerpo)$/.test(words)) return { topic: 'senses' };
  return {};
}

function describeGesture(gesture) {
  if (!gesture) return;
  if (gesture.kind === 'sequence') return list.format(gesture.steps.map(describeGesture));
  const side = gesture.side < 0 ? 'izquierdo' : 'derecho';
  switch (gesture.kind) {
    case 'leg': return `levanté el pie ${side}`;
    case 'raise': return `levanté el brazo ${side}`;
    case 'arm': return gesture.side === 0 ? 'moví ambos brazos' : `moví el brazo ${side}`;
    case 'thumb': return `levanté el pulgar ${side}`;
    case 'hands': {
      const hands = gesture.side === 0 ? 'las manos' : `la mano ${gesture.side < 0 ? 'izquierda' : 'derecha'}`;
      return gesture.wiggle ? `moví los dedos de ${hands}` : `${gesture.closed ? 'cerré' : 'abrí'} ${hands}`;
    }
    case 'body': return 'moví ' + { head: 'la cabeza', torso: 'el torso', hips: 'la cadera', shoulders: 'los hombros' }[gesture.part];
    case 'point': return 'señalé';
    case 'wave': return 'saludé con la mano';
    case 'stretch': return 'me estiré';
    case 'hair': return 'me acomodé el pelo';
    case 'nod': return 'asentí con la cabeza';
    case 'shake': return 'negué con la cabeza';
    case 'crouch': return 'me agaché';
    case 'dance': return 'bailé en mi sitio';
  }
}

function otherSide(other, lastGesture, lastLeg) {
  const last = lastGesture?.kind === 'sequence' ? lastGesture.steps.at(-1) : lastGesture;
  const names = { pie: ['leg'], pierna: ['leg'], brazo: ['raise', 'arm'], pulgar: ['thumb'], mano: ['hands'] };
  const previous = names[other]?.includes('leg') ? lastLeg : last;
  if (!previous || Math.abs(previous.side) !== 1 || (other !== true && !names[other].includes(previous.kind))) return null;
  return previous.kind === 'leg'
    ? { kind: 'leg', side: -previous.side, lift: previous.lift, forward: previous.forward }
    : { ...previous, side: -previous.side };
}

function asksBodyContext(words) {
  return /\b(?:tu (?:cuerpo|postura|gesto|movimiento|cabeza|brazo|pie)|tus (?:manos|pies|piernas|brazos|dedos)|como te (?:mueves|tengo encuadrada)|como (?:te veo|estas apoyada)|que (?:estas moviendo|lado moviste))\b/.test(words);
}

function readBodyView(view) {
  if (!Object.hasOwn(angles, view?.angle)) return;
  return {
    angle: view.angle,
    visible: Object.keys(regions).filter((part) => Array.isArray(view.visible) && view.visible.includes(part)),
    raisedFoot: ['left', 'right'].includes(view.raisedFoot) ? view.raisedFoot : undefined,
    posture: ['standing', 'crouched', 'seated'].includes(view.posture) ? view.posture : undefined,
  };
}

function reportBody(topic, view, lastGesture, lastLeg) {
  if (topic === 'lastFoot') return lastLeg ? `Levanté el pie ${lastLeg.side < 0 ? 'izquierdo' : 'derecho'}.` : 'Todavía no he levantado un pie con este avatar.';
  if (topic === 'lastGesture') {
    const motion = describeGesture(lastGesture);
    return motion ? motion[0].toUpperCase() + motion.slice(1) + '.' : 'Todavía no me has pedido un gesto que haya podido hacer.';
  }
  if (!view) return 'Necesito tener mi avatar cargado para decirte cómo está mi cuerpo.';
  if (topic === 'senses') return 'Sé cómo está colocado mi cuerpo virtual, qué gestos hago y cómo me tienes encuadrada. Es información de mi avatar. No tengo tacto ni veo por tus ojos.';
  if (topic === 'pose' || topic === 'support') {
    if (view.raisedFoot) {
      const left = view.raisedFoot === 'left';
      return topic === 'support' ? `Me apoyo en el pie ${left ? 'derecho' : 'izquierdo'}.`
        : `Tengo el pie ${left ? 'izquierdo' : 'derecho'} levantado.`;
    }
    if (view.posture === 'seated') return 'Estoy sentada en mi puff, con los pies apoyados.';
    if (view.posture === 'crouched') return 'Estoy un poco agachada.';
    if (view.posture === 'standing') return 'Estoy de pie, con ambos pies apoyados.';
    return 'El esqueleto de este avatar no me da una postura fiable de las piernas.';
  }
  if (topic === 'feet' || topic === 'hands') {
    const sides = view.visible.filter((part) => part.endsWith(topic === 'feet' ? 'Foot' : 'Hand'));
    const parts = topic === 'feet' ? 'los pies' : 'las manos';
    if (sides.length === 2) return `Sí, se ven ${parts}.`;
    return sides.length ? `Solo queda dentro del encuadre ${regions[sides[0]]}.` : `Tengo ${parts} fuera del encuadre.`;
  }
  const shown = view.visible.map((part) => regions[part]);
  const framing = shown.length === Object.keys(regions).length ? 'Tienes la vista de cuerpo completo.'
    : shown.length ? `Dentro del encuadre quedan ${list.format(shown)}.` : 'Mis partes de referencia están fuera del encuadre.';
  return `La vista está ${angles[view.angle]}. ${framing}`;
}

module.exports = { bodyIntent, otherSide, asksBodyContext, readBodyView, reportBody, views };
