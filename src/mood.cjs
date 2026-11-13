const { socialWords } = require('./social-memory.cjs');

const cues = [
  [/^(?:hoy )?(?:(?:estoy|ando|me siento) (?:muy |algo |un poco )?(?:cansad[oa]|agotad[oa]|sin energia)|(?:tuve|he tenido) un dia (?:pesado|largo|agotador|duro)|fue un dia (?:pesado|largo|agotador|duro))(?: hoy)?$/u,
    'dulce', 'tender', ['Uf, suena a que fue pesado. ¿Quieres desahogarte o te distraigo un rato?', 'Uy, tómate un respiro. ¿Te provoca contarme qué pasó?']],
  [/^(?:hoy )?(?:estoy|ando|me siento) (?:muy |algo |un poco )?(?:triste|bajonead[oa]|desanimad[oa])(?: hoy)?$/u,
    'dulce', 'tender', ['Te acompaño. ¿Quieres contarme qué pasó?', 'Te escucho. ¿Prefieres hablar de eso o distraerte un rato?']],
  [/^(?:hoy )?(?:(?:estoy|ando|me siento) (?:muy |super )?(?:feliz|content[oa]|emocionad[oa]|alegre)|me fue (?:muy |super )?bien)(?: hoy)?$/u,
    'feliz', 'happy', ['Uy, me alegra. ¿Qué pasó?', 'Qué alegría. Cuéntame qué te puso de tan buen humor.']],
  [/^(?:(?:hoy )?(?:fue|ha sido|tuve) un dia raro|no se como me siento|(?:estoy|ando|me siento) (?:un poco )?rar[oa])$/u,
    'dulce', 'think', ['¿Raro en buen plan o te dejó con algo dando vueltas?', '¿Te provoca contarme cómo te dejó el día?']],
];

function moodReply(text, choose) {
  const words = socialWords(text).replace(/^(?:hola|holi)(?: quin| linda)? /u, '');
  const cue = cues.find(([pattern]) => pattern.test(words));
  if (!cue || /[¿?]/u.test(text)) return;
  const [, tone, animation, replies] = cue;
  return { tone, animation, text: replies[choose(replies.length)] };
}

module.exports = { moodReply };
