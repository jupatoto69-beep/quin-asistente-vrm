const instruction = /^(?:(?:esto (?:es|era) |recuerda esto )?s[oó]lo para esta (?:charla|conversaci[oó]n)|no (?:guardes esto|lo guardes))$/iu;

function memoryScopeRequest(input) {
  const text = input.trim().replace(/^(?:(?:oye|olle|hey)[,\s]+)?quin[,\s]+/iu, '');
  const command = text.replace(/[.!?]+$/u, '').trim();
  if (/^(?:(?:termina|cierra) (?:la )?charla temporal|vuelve a guardar)$/iu.test(command)) return { end: true };
  if (/^(?:modo temporal|inicia (?:una )?charla temporal)$/iu.test(command)) return {};
  if (instruction.test(command)) return { previous: true };

  const recall = /^(?:recuerda|ten en cuenta) (?:esto )?(?:s[oó]lo )?para esta (?:charla|conversaci[oó]n) que\s+(.+)$/isu.exec(text);
  if (recall) return { content: recall[1].trim() };
  const lead = /^(?:(?:esto (?:es|era) )?s[oó]lo para esta (?:charla|conversaci[oó]n)|no guardes esto)(?:\s*[:;,–—.]\s*|\s+)(.+)$/isu.exec(text);
  if (lead) return { content: lead[1].trim() };
  const suffix = /(?:[.,;]\s*|\s+(?=esto (?:es|era)\b|no guardes esto\b))(?:(?:esto (?:es|era) )?s[oó]lo para esta (?:charla|conversaci[oó]n)|no guardes esto)[.!?]*$/iu.exec(text);
  if (suffix?.index > 0) return { content: text.slice(0, suffix.index).trim() };
}

module.exports = { memoryScopeRequest };
