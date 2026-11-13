const places = {
  bogota: 'America/Bogota', colombia: 'America/Bogota', medellin: 'America/Bogota',
  cali: 'America/Bogota', fusagasuga: 'America/Bogota', tokio: 'Asia/Tokyo',
  japon: 'Asia/Tokyo', nueva_york: 'America/New_York', ciudad_de_mexico: 'America/Mexico_City',
  madrid: 'Europe/Madrid', londres: 'Europe/London', paris: 'Europe/Paris',
  berlin: 'Europe/Berlin', roma: 'Europe/Rome', pekin: 'Asia/Shanghai', seul: 'Asia/Seoul',
  moscu: 'Europe/Moscow', lima: 'America/Lima', buenos_aires: 'America/Argentina/Buenos_Aires',
  sao_paulo: 'America/Sao_Paulo', caracas: 'America/Caracas', quito: 'America/Guayaquil',
};
const knownZones = Intl.supportedValuesOf('timeZone');

function cityKey(city) {
  return city.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[ -]+/gu, '_');
}

function clockRequest(text) {
  const match = /^(?:(?:(?:oye|olle|hey|ey)[,\s]+)?quin[,\s]+)?[¿¡]?(?:(?:(?:dime|me dices|puedes decirme|me puedes decir|sabes) )?qu[eé] horas? (?:es|son|tenemos)|(?:dime|me dices|puedes decirme|me puedes decir|sabes|tienes) (?:la )?hora)(?: (?:aqu[ií]|ahora|exacta))?(?: en ([\p{L}\p{N}_/+\-]+(?: [\p{L}\p{N}_/+\-]+)*?))?(?: (?:ahora|porfa(?:vor)?|por favor|gracias))?(?: quin)?[?!.]*$/iu.exec(text.trim());
  return match ? { place: match[1] } : undefined;
}

function clockReply(request, now = new Date()) {
  const { place } = request;
  let hours = now.getHours();
  let minutes = now.getMinutes();
  if (place) {
    const key = cityKey(place);
    const matches = knownZones.filter((zone) => [zone, zone.split('/').at(-1)].some((name) => cityKey(name) === key));
    const timeZone = (Object.hasOwn(places, key) ? places[key] : undefined) ??
      (/^(?:utc|gmt)$/iu.test(place) ? 'UTC' : undefined) ?? (matches.length === 1 ? matches[0] : undefined);
    if (!timeZone) return '¿A qué ciudad o zona horaria te refieres?';
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
    hours = Number(parts.find(({ type }) => type === 'hour').value);
    minutes = Number(parts.find(({ type }) => type === 'minute').value);
  }
  const hour = hours % 12 || 12;
  const time = hour + ':' + String(minutes).padStart(2, '0') + (hours < 12 ? ' AM.' : ' PM.');
  if (!place) return (hour === 1 ? 'Es la ' : 'Son las ') + time;
  const label = place[0].toUpperCase() + place.slice(1);
  return 'En ' + label + (hour === 1 ? ' es la ' : ' son las ') + time;
}

module.exports = { clockRequest, clockReply };
