const { cleanNote, socialWords } = require('./social-memory.cjs');

const dayNames = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const when = /\b(pasado manana|manana|hoy|este fin de semana|(?:este|el) (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/u;

function afterPlan(date, label) {
  const days = { hoy: 0, manana: 1, 'pasado manana': 2 };
  const offset = label === 'este fin de semana' ? (7 - date.getDay()) % 7
    : days[label] ?? (7 + dayNames.indexOf(label.split(' ').at(-1)) - date.getDay()) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset + 1, 10).getTime();
}

function momentIntent(input, now = new Date()) {
  const text = input.trim().replace(/^[¿¡]?\s*(?:(?:oye|olle|hey)[,\s]+)?quin[,\s]+/iu, '');
  const words = socialWords(text);
  const save = /^(?:recuerda|guarda) (?:este momento|este recuerdo|este plan|esto como recuerdo)\s*[:;,–—-]\s*(.+)$/isu.exec(text);
  if (save?.[1].trim()) return { action: 'save', kind: 'moment', text: cleanNote(save[1]) };
  if (/^(?:que (?:momentos|recuerdos|planes) (?:recuerdas|tienes guardados|te he contado)|(?:dime|muestra|muestrame) (?:mis|los) (?:momentos|recuerdos|planes) guardados)$/u.test(words)) {
    return { action: 'list' };
  }
  const recall = /^(?:(?:te acuerdas de|recuerdas|recuerdame|retomemos) (lo del?|el (?:momento|plan|recuerdo) del?|mi plan del?|cuando)|te acuerdas del (?:momento|plan|recuerdo) del?)\s+(.+)$/iu.exec(text.replace(/^¿/u, ''));
  if (recall) return { action: 'recall', topic: recall[2], optional: /^(?:lo del?|cuando)$/iu.test(recall[1] ?? '') };
  const date = when.exec(words)?.[1];
  if (!date || /[¿?]/u.test(text) || /\b(?:era broma|es un ejemplo|es hipotetico)\b/u.test(words)) return;
  const excitement = /^(?:me (?:hace ilusion|emociona)|estoy (?:muy )?(?:emocionad[oa]|feliz))(?: porque| que)? /u;
  const plan = words.replace(excitement, '').replace(when, '').replace(/\s+/gu, ' ').trim();
  if (!/^(?:por fin )?(?:voy a|vamos a|planeo|pienso|tengo|tenemos) /u.test(plan)) return;
  if (!excitement.test(words) && !/\b(?:salir|jugar|ver a|visitar|viajar|celebrar|cine|concierto|cena|partida|paseo|viaje)\b/u.test(plan)) return;
  return { action: 'plan', kind: 'moment', text: cleanNote(text), followAfter: afterPlan(now, date) };
}

function planOutcome(text) {
  return !/[¿?]/u.test(text) && /^(?:(?:si|no) )?(?:me fue|nos fue|salio|pude|ya (?:fui|fuimos|lo hice)|(?:se|lo) (?:cancelo|aplazo))\b/u.test(socialWords(text));
}

module.exports = { momentIntent, planOutcome };
