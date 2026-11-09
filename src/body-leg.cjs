const heights = new Set(['baja', 'media', 'alta', 'mas', 'menos']);
const paths = new Set(['adelante', 'atras', 'centro']);
const amount = 'un (?:poco|poquito)(?: mas)?|mas alto|mas bajo|mas|menos|alto|bajo|bien alto';
const footCommand = new RegExp(
  `^(?<verb>levanta|levantar|levantes|alza|alzar|sube|subir|eleva|elevar|dobla|doblar|dobles|flexiona|flexionar|flexiones)(?: (?<before>${amount}))?(?: (?:el|la|tu|un|una))? (?<part>pie|rodilla|pierna)(?: (?<side>izquierd[oa]|derech[oa]))?(?<after>(?: (?:${amount}|(?:hacia )?(?:adelante|atras)))*)$`,
);

function legRequest(text) {
  const match = footCommand.exec(text)?.groups;
  if (!match) return null;
  const modifiers = (match.before ?? '') + match.after;
  const side = match.side ? match.side.startsWith('izquierd') ? -1 : 1 : undefined;
  const height = /\b(?:menos|mas bajo)\b/.test(modifiers) ? 'menos'
    : /\bmas\b/.test(modifiers) ? 'mas'
    : /\balto\b/.test(modifiers) ? 'alta'
    : /\b(?:poco|poquito|bajo)\b/.test(modifiers) ? 'baja' : 'media';
  const path = /\batras\b/.test(modifiers) ? 'atras' : /\badelante\b/.test(modifiers) ? 'adelante'
    : /^(?:dobl|flexion)/.test(match.verb) ? 'atras' : match.part !== 'pie' ? 'adelante' : undefined;
  return { kind: 'leg', side, height, path };
}

function decodeLeg(target, height, path) {
  if (target && !/^(?:izquierd[oa]|derech[oa])$/.test(target)) return null;
  if (height && height !== 'none' && !heights.has(height)) return null;
  if (path && path !== 'none' && !paths.has(path)) return null;
  return {
    kind: 'leg', side: target ? target.startsWith('izquierd') ? -1 : 1 : undefined,
    height: heights.has(height) ? height : 'media',
    path: paths.has(path) ? path : undefined,
  };
}

function planLeg(cue, previous) {
  const side = cue.side ?? previous?.side ?? 1;
  const related = previous?.side === side ? previous : undefined;
  const relative = cue.height === 'mas' || cue.height === 'menos';
  const requested = cue.height === 'baja' ? 0.075 : cue.height === 'alta' ? 0.30 : 0.18;
  const shift = cue.height === 'mas' ? 0.085 : cue.height === 'menos' ? -0.075 : 0;
  const lift = Math.max(0.055, Math.min(0.34, (relative ? related?.lift ?? requested : requested) + shift));
  const forward = cue.path === 'adelante' ? 0.18 : cue.path === 'atras' ? -0.16 : cue.path === 'centro' ? 0.045
    : relative ? related?.forward ?? 0.045 : 0.045;
  return { kind: 'leg', side, lift, forward };
}

module.exports = { legRequest, decodeLeg, planLeg, legHeights: [...heights], legPaths: [...paths] };
