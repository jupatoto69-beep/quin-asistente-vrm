const tones = Object.freeze({
  dulce: {
    label: 'Dulce', speed: 0.96, pauses: 0.34, pitch: 35, lift: 25,
    sample: 'Hola. Me alegra verte por aquí. Cuéntame, ¿qué quieres hacer hoy?',
  },
  picara: {
    label: 'Pícara', speed: 1.04, pauses: 0.24, pitch: 85, lift: 55,
    sample: 'Le dije al computador que necesitaba espacio. Y me ofreció vaciar la papelera. Qué considerado, ¿no?',
  },
  seria: {
    label: 'Seria', speed: 0.95, pauses: 0.43, pitch: -30, lift: 0,
    sample: 'Vamos paso a paso. Primero revisemos qué ocurrió y luego decidimos la mejor forma de resolverlo.',
  },
  feliz: {
    label: 'Feliz', speed: 1.04, pauses: 0.27, pitch: 75, lift: 45,
    sample: '¡Uy, qué buena noticia! Me alegra mucho que te haya salido.',
  },
  triste: {
    label: 'Triste', speed: 0.92, pauses: 0.52, pitch: -45, lift: 5,
    sample: 'Qué pena que haya terminado así. Tómate el tiempo que necesites.',
  },
  enojada: {
    label: 'Enojada', speed: 1.01, pauses: 0.33, pitch: 15, lift: 20,
    sample: 'Eso sí me molesta. Hablemos claro y resolvámoslo.',
  },
  timida: {
    label: 'Tímida', speed: 0.96, pauses: 0.52, pitch: 45, lift: 20,
    sample: 'Mmm… ¿puedo decirte algo? Es que me da un poquito de pena.',
  },
});

const defaultTone = 'dulce';

function validTone(value) {
  return typeof value === 'string' && Object.hasOwn(tones, value) ? value : defaultTone;
}

module.exports = { tones, defaultTone, validTone };
