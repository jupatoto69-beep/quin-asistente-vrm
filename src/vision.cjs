const visionTag = '4b-instruct';
const visionModel = 'qwen3-vl:' + visionTag;
const format = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    box: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 1000 }, maxItems: 4 },
  },
  required: ['text', 'box'],
  additionalProperties: false,
};
const guideFormat = {
  ...format,
  properties: { ...format.properties, steps: { type: 'array', maxItems: 4, items: { ...format } } },
  required: [...format.required, 'steps'],
};

function validImage(value) {
  if (!(value instanceof Uint8Array) || value.length < 32 || value.length > 4_000_000 ||
      value[0] !== 0xff || value[1] !== 0xd8 || value[2] !== 0xff ||
      value.at(-2) !== 0xff || value.at(-1) !== 0xd9) {
    throw new Error('No pude abrir el recorte. Vuelve a seleccionarlo.');
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
}

function wantsBox(question) {
  return /(?:\b(?:marc[ae]|ubic[ae]|resalta|d[oó]nde)\b|\bseñ[aá]l)/iu.test(question);
}

function wantsGuide(question) {
  return /\b(?:gu[ií]ame|paso a paso|qu[eé] pasos|c[oó]mo (?:arreglo|soluciono|corrijo|configuro|resuelvo)|ay[uú]dame a (?:arreglar|solucionar|configurar))\b/iu.test(question);
}

function validBox(value) {
  if (!Array.isArray(value) || value.length !== 4 ||
      !value.every((point) => Number.isInteger(point) && point >= 0 && point <= 1000)) return;
  const [x1, y1, x2, y2] = value;
  if (x1 >= x2 || y1 >= y2) return;
  return value;
}

module.exports = { visionModel, visionTag, format, guideFormat, validImage, wantsBox, wantsGuide, validBox };
