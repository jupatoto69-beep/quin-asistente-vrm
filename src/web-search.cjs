const https = require('node:https');
const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');

const duck = 'https://html.duckduckgo.com/html/';
const bing = 'https://www.bing.com/search';
const nodeReleases = 'https://nodejs.org/dist/index.json';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const privateIPs = new BlockList();
const contactEmail = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/iu;
const challengePage = /^(?:captcha|security check|verificacion de seguridad)[.!]?$|\b(?:just a moment|attention required|verify (?:that )?you are (?:a )?human|access denied|radware bot manager|verifica que eres human[oa])\b/iu;
const queryNoise = new Set('busca investiga averigua sobre acerca para con por como cuanto cuesta vale cual cuales quien cuando donde esta queda las los una unos unas que del son hay dame dime ultima ultimo estable actual hoy manana internet pagina resultado resultados informacion datos favor porfa'.split(' '));
const sentences = new Intl.Segmenter('es', { granularity: 'sentence' });
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) privateIPs.addSubnet(address, prefix, 'ipv4');

function webAvailable() {
  try {
    require.resolve('cheerio/slim');
    return true;
  } catch {
    return false;
  }
}

function load(body, options) {
  return require('cheerio/slim').load(body, options);
}

function publicUrl(input) {
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/\.$/u, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.href.length > 1600 ||
        isIP(host) || !host.includes('.') || /(?:^|\.)(?:localhost|local|lan|home|internal|invalid|test)$/iu.test(host) ||
        host === 'validate.perfdrive.com' || contactEmail.test(decodeURIComponent(url.pathname))) return;
    for (const [name, value] of url.searchParams) {
      if (/^(?:access[_-]?token|token|api[_-]?key|authorization|session(?:[_-]?id)?|signature|password|email|phone|telefono|x-amz-.*)$/i.test(name) ||
          privateQuestion(value)) return;
    }
    url.hash = '';
    return url;
  } catch {
    return undefined;
  }
}

function publicLookup(host, options, callback) {
  dns.lookup(host, { family: 4, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => privateIPs.check(address, 'ipv4'))) {
      return callback(new Error('La página no tiene una dirección pública.'));
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, 4);
  });
}

async function getPage(input, signal, redirects = 3) {
  const url = publicUrl(input);
  if (!url) throw new Error('Usa un enlace HTTPS público.');
  const response = await new Promise((resolve, reject) => {
    const request = https.get(url, {
      signal, family: 4, lookup: publicLookup,
      headers: {
        'User-Agent': userAgent, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.7',
        Accept: 'text/html,application/xhtml+xml,application/rss+xml,text/plain,application/xml;q=0.9',
        'Accept-Encoding': 'identity',
      },
    }, resolve);
    request.on('error', reject);
  });
  if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
    response.destroy();
    if (!redirects) throw new Error('La página redirige demasiadas veces.');
    return getPage(new URL(response.headers.location, url).href, signal, redirects - 1);
  }
  const type = String(response.headers['content-type'] ?? '');
  const jsonReleaseIndex = url.href === nodeReleases && /^application\/json(?:;|$)/i.test(type);
  if (response.statusCode < 200 || response.statusCode > 299 ||
      (!jsonReleaseIndex && !/^(?:text\/(?:html|plain|xml)|application\/(?:xhtml\+xml|rss\+xml|xml))(?:;|$)/i.test(type))) {
    response.destroy();
    throw new Error('La página no entregó texto público legible.');
  }
  const parts = [];
  let remaining = 1_350_000;
  for await (const chunk of response) {
    parts.push(chunk.subarray(0, remaining));
    remaining -= chunk.length;
    if (remaining <= 0) break;
  }
  return { url: url.href, body: Buffer.concat(parts).toString('utf8') };
}

function clean(text, max) {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, max);
}

function decodeResult(input) {
  try {
    const link = new URL(input, duck);
    if ((link.hostname === 'duckduckgo.com' || link.hostname.endsWith('.duckduckgo.com')) && link.pathname === '/l/') {
      return publicUrl(link.searchParams.get('uddg'))?.href;
    }
    return publicUrl(link.href)?.href;
  } catch {
    return undefined;
  }
}

function duckResults(body) {
  const $ = load(body);
  return $('.result').toArray().flatMap((row) => {
    const item = $(row);
    if (item.hasClass('result--ad') || item.find('.result__badge').length) return [];
    const anchor = item.find('.result__a').first();
    const url = decodeResult(anchor.attr('href'));
    const title = clean(anchor.text(), 170);
    return url && title ? [{ url, title, snippet: clean(item.find('.result__snippet').text(), 420) }] : [];
  });
}

function bingResults(body) {
  const $ = load(body, { xml: true });
  return $('channel > item').toArray().flatMap((row) => {
    const item = $(row);
    const url = publicUrl(item.children('link').text().trim())?.href;
    const title = clean(item.children('title').text(), 170);
    const snippet = clean(load(item.children('description').text()).text(), 420);
    return url && title ? [{ url, title, snippet }] : [];
  });
}

function pageText(body, limit = 3000) {
  const $ = load(body);
  const title = clean($('meta[property="og:title"]').attr('content') || $('title').text() || $('h1').first().text(), 170);
  const date = clean($('meta[property="article:published_time"]').attr('content') ||
    $('time[datetime]').first().attr('datetime') || '', 40);
  $('script, style, iframe, template, noscript, nav, footer, header, aside, form, [hidden], [aria-hidden="true"]').remove();
  const article = $('article').first();
  const main = $('main').first();
  const area = article.text().trim().length > 200 ? article : main.text().trim().length > 200 ? main : $('body');
  const blocks = area.find('h1, h2, h3, p, li, time, tr, option').toArray()
    .map((node) => clean(node.name === 'tr'
      ? $(node).children().toArray().map((cell) => $(cell).text()).join(' ')
      : $(node).text(), limit)).filter(Boolean);
  const heading = clean($('h1').first().text(), 170);
  if (challengePage.test(title) || challengePage.test(heading)) return;
  return { title, date, excerpt: (blocks.join('\n') || clean(area.text(), limit)).slice(0, limit) };
}

function shortQuery(value) {
  return clean(value.replace(/^\s*[¿¡]|[?!]+\s*$/gu, ''), 220);
}

function privateQuestion(value) {
  const text = value.normalize('NFKC').replace(/\p{Cf}/gu, '');
  const plain = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const withoutDates = plain.replace(/\b(?:19|20)\d{2}-[01]\d-[0-3]\d\b/gu, '');
  return contactEmail.test(text) ||
    /\d(?:[\s().+-]*\d){6,}/u.test(withoutDates) ||
    /(?:^|\s)(?:[a-z]:[\\/]|\\\\)|\bfile:\/\//iu.test(text) ||
    /\b(?:contrasena|password|token|credenciales?|cedula|dni|pasaporte|historial privado|archivos? locales?|clave (?:privada|de acceso|api)|api[ _-]?key|bearer)\b/u.test(plain) ||
    /\b(?:me llamo|mi nombre es|vivo en|mi domicilio|mis?\s+(?:datos|perfil|pareja|novia|novio|amig[oa]s?|familia|correo|telefono|celular|numero|direccion|cuenta|historial|ubicacion|ip))\b/u.test(plain);
}

function safeSearchQuery(value) {
  if (typeof value !== 'string' || privateQuestion(value) || /https?:\/\//iu.test(value)) return;
  return shortQuery(value) || undefined;
}

function withoutGreeting(text) {
  return text.trim()
    .replace(/^[¿¡]?(?:hola|buenas|buenos d[ií]as|buenas tardes)(?:\s+(?:quin|linda|hermosa|preciosa|bonita))?(?:[,.:!]+\s*|\s+)/iu, '')
    .replace(/^(?:[¿¡]\s*)?(?:(?:hey|oye|olle)[\s,]+)?quin[\s,.:]+/iu, '');
}

function words(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function subjectsIn(text) {
  if (!text || /https?:\/\//iu.test(text) || privateQuestion(text)) return [];
  const user = shortQuery(withoutGreeting(text).split(/(?<=[?!])\s+/u)[0]);
  const info = /^(?:(?:dame|me das|dime|busca(?:me)?|quiero|necesito)\s+)?(?:(?:la|los)\s+)?(?:informaci[oó]n|datos|direcci[oó]n|ubicaci[oó]n)(?:\s+(?:actualizad[oa]s?|recientes?|actual(?:es)?|p[uú]blic[oa]s?))?\s+(?:de(?:l)?|sobre|acerca de)\s+(.+)$/iu.exec(user);
  const place = /^(?:ahora\s+)?(?:d[oó]nde (?:queda|est[aá]|se encuentra)|(?:h[aá]blame|hablemos|qu[eé] sabes) (?:de(?:l)?|sobre))\s+(.+)$/iu.exec(user);
  const version = /^(?:cu[aá]l es (?:la |el )?)?(?:[uú]ltim[oa]|pr[oó]xim[oa]) (?:versi[oó]n(?: estable)?|parche|lanzamiento) (?:de(?:l)?|para)\s+(.+)$/iu.exec(user);
  const subject = (info ?? place ?? version)?.[1].replace(/[.,;:…]+$/u, '')
    .replace(/[,\s]+(?:por favor|porfa|gracias)$/iu, '').trim();
  if (!subject || subject.length > 150 || /^(?:eso|esto|lo|la|[eé]l|ellos|ella|all[ií]|m[ií]|ti|nosotros|nosotras)$/iu.test(subject)) return [];
  return subject.split(/\s+(?:y|o)\s+(?:del?|sobre)(?:\s+(?:la|los|las))?\s+/iu).slice(0, 3);
}

function subjectIn(text) {
  const [first, second] = subjectsIn(text);
  if (!second) return first;
}

function chooseSubject(text, choices) {
  const answer = words(withoutGreeting(text)).replace(/^(?:(?:elijo|me refiero a|quiero) )?(?:al? |el |la )?/u, '');
  const ordinal = /^(?:(?:opcion|numero) )?(?:(1|2|3)|(primer[oa]|segund[oa]|tercer[oa]))$/u.exec(answer);
  if (ordinal) {
    const index = ordinal[1] ? Number(ordinal[1]) - 1 : ['prim', 'segu', 'terc'].indexOf(ordinal[2].slice(0, 4));
    return choices[index];
  }
  const matches = choices.filter((choice) => {
    const name = words(choice).replace(/^(?:el|la) /u, '');
    return answer.length >= 3 && (name === answer || name.startsWith(answer + ' '));
  });
  if (matches.length === 1) return matches[0];
}

function isLocationFollowup(text) {
  return /^(?:(?:y|ahora) )?(?:(?:donde (?:queda|esta|se encuentra)(?: (?:eso|ese lugar|el local|el negocio|la tienda))?|(?:cual es )?(?:su |la )?(?:direccion|ubicacion))(?: exactamente)?)(?: por favor| porfa)?$/u.test(words(text));
}

const followupDetails = [
  ['horarios', /^(?:a que horas? (?:abren?|cierran?)|(?:(?:cual es|cuales son) )?(?:(?:su|sus|el|los) )?horarios?)$/u],
  ['servicios', /^(?:(?:que|cuales) servicios (?:ofrecen?|tienen?|prestan?|hacen?)|(?:(?:cuales son) )?(?:(?:sus|los) )?servicios)$/u],
  ['contacto', /^(?:como (?:los|lo|la|les) (?:contacto|escribo|llamo)|(?:(?:cual es) )?(?:(?:su|el) )?(?:telefono|contacto|whatsapp))$/u],
  ['precio', /^(?:cuanto (?:vale|cuesta)|(?:(?:cual es) )?(?:(?:su|el) )?precio)$/u],
];

function followupDetail(text) {
  const plain = words(text).replace(/^(?:y|ahora|entonces) /u, '').replace(/ (?:por favor|porfa|exactamente)$/u, '');
  const detail = followupDetails.find(([, pattern]) => pattern.test(plain))?.[0];
  if (detail) return { detail };
  const day = /\b(?:(?:el|los|este) )?(?:lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b|\b(?:hoy|manana|(?:los )?fines de semana)\b/u.exec(plain)?.[0];
  if (!day) return;
  const timing = plain.replace(day, '').replace(/\s+/gu, ' ').trim();
  if (/^(?:a que horas? )?(?:abren?|cierran?)$|^(?:esta|estan) (?:abiertos?|cerrados?)$|^(?:el )?horario(?: de)?$/u.test(timing)) {
    return { detail: 'horarios', when: day };
  }
}

function matchesSubject(source, subject) {
  const terms = words(subject).split(' ').filter((word) => word.length > 1 &&
    !/^(?:en|de|del|el|la|las|los|un|una|para|por)$/u.test(word));
  const url = publicUrl(source.url);
  const evidence = new Set(words([source.title, source.snippet, source.excerpt, url?.hostname, url?.pathname]
    .filter(Boolean).join(' ')).split(' '));
  return terms.length > 0 && terms.every((term) => evidence.has(term));
}

function queryTerms(query) {
  return [...new Set(words(query).split(' '))].filter((term) => term.length >= 2 && !queryNoise.has(term));
}

function termCount(text, terms) {
  const found = new Set(words(text).split(' '));
  return terms.filter((term) => found.has(term)).length;
}

function primaryPage(query) {
  const plain = words(query);
  if (/\bnode ?js\b/u.test(plain) && !/\bnode ?js v?\d+\b/u.test(plain) && latestRelease(plain)) return nodeReleases;
  if (/\bvrm\b/u.test(plain)) {
    if (/\b(?:licencias?|permisos?|comercial|derechos de autor|copyright)\b/u.test(plain)) return 'https://vrm.dev/en/vrm/meta/license/';
    if (/\b(?:formato|gltf|especificacion)\b/u.test(plain) && !/\b(?:descargar|precio|barato|comprar)\b/u.test(plain)) {
      return 'https://vrm.dev/en/vrm/vrm_about/';
    }
  }
}

function latestRelease(plain) {
  return /\b(?:version|lanzamiento|release|parche)\b/u.test(plain) &&
    /\b(?:ultima|ultimo|mas reciente|latest|actual|estable|lts)\b/u.test(plain);
}

function usableSource(source) {
  return !!publicUrl(source.url) && !challengePage.test(source.title ?? '') &&
    !!(source.snippet?.trim() || source.excerpt?.trim());
}

function matchesQuery(source, query, subject) {
  if (!usableSource(source)) return false;
  if (source.url === primaryPage(query)) return true;
  if (subject) return matchesSubject(source, subject);
  const terms = queryTerms(query);
  if (!terms.length) return false;
  const url = publicUrl(source.url);
  const identity = [source.title, url.hostname, url.pathname].join(' ');
  return termCount(identity, terms) > 0 &&
    termCount([identity, source.snippet, source.excerpt].join(' '), terms) >= Math.ceil(terms.length * 0.55);
}

function webEvidence(sources, query = '') {
  const terms = queryTerms(query);
  const versionQuestion = latestRelease(words(query));
  return sources.flatMap((source, index) => {
    const lines = (source.excerpt ?? '').split('\n').flatMap((line) =>
      [...sentences.segment(line)].map(({ segment }) => segment.trim()));
    const ranked = [...new Set([...lines, source.snippet?.trim()])]
      .filter((text) => text && (text.length >= 18 || /^v\d+\.\d+\.\d+\b/u.test(text)) &&
        text.length <= 420 && !challengePage.test(text) && (!versionQuestion ||
          (/\bv?\d+\.\d+(?:\.\d+)?\b/u.test(text) && /\b(?:ultima|ultimo|mas reciente|latest|current|actual|estable|lts)\b/u.test(words(text)))))
      .sort((a, b) => termCount(b, terms) - termCount(a, terms));
    const excerpt = [];
    for (const line of ranked) {
      if (excerpt.some((other) => other.includes(line) || line.includes(other))) continue;
      excerpt.push(line);
      if (excerpt.length === 4) break;
    }
    return excerpt.map((text) => ({ source: index, text }));
  });
}

function webIntent(text) {
  const user = withoutGreeting(text);
  if (privateQuestion(user)) return;
  const plain = user.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const link = /https?:\/\/[^\s<>"'“”]+/iu.exec(user)?.[0].replace(/[).,;!?]+$/u, '');
  if (link) {
    if (user === link || /\b(?:lee|leeme|léeme|resume|revisa|abre|consulta|explica|mira|dice)\b/iu.test(user)) {
      return { kind: 'read', url: publicUrl(link)?.href };
    }
    return;
  }
  const direct = /^[¿¡]?(?:por favor,?\s+)?(?:b[uú]sca(?:me)?|investiga|averigua|consulta en (?:internet|la web)|verifica en (?:internet|la web))(?:\s+en (?:internet|la web))?\s+(.+)/isu.exec(user);
  const target = direct?.[1] ?? user;
  if (isLocationFollowup(target)) return { kind: 'location' };
  if (/^(?:y )?(?:dime mas|cuentame mas|amplia(?: la informacion)?|mas detalles|que mas encontraste|que mas dicen las fuentes)(?: por favor| porfa)?$/u.test(words(target))) {
    return { kind: 'more' };
  }
  const detail = followupDetail(target);
  if (detail) return { kind: 'followup', ...detail, explicit: !!direct };
  const subject = subjectIn(target);
  const address = !!subject && /^(?:donde (?:queda|esta|se encuentra)|(?:(?:dame|dime) )?(?:(?:la|su) )?(?:direccion|ubicacion) de)\b/u.test(words(target));
  if (address) return { kind: 'search', query: subject + ' dirección', subject, address };
  if (direct) return { kind: 'search', query: shortQuery(target), subject };
  if (subject && /\b(?:informacion|datos) (?:actualizad[oa]s?|recientes?|actual(?:es)?)\b/u.test(plain)) {
    return { kind: 'search', query: subject, subject };
  }
  const question = /^[¿¡]?(?:sabes\s+|me dices\s+|dime\s+)?(?:que|quien|cual|cuando|cuant[oa]|como|donde|hay|ya (?:salio|se publico|llego)|es verdad|se sabe)\b/u.test(plain);
  if (!question || user.length > 320 || /\b(?:cuentame un chisme|que (?:hora|dia) es|como estas|que haces|que te gusta|recuerdas|que opinas de mi)\b/u.test(plain)) return;
  const fresh = /\b(?:noticias|vigente|precio actual|cuanto cuesta|ya salio|cuando sale|clima en|(?:ultim[oa]s?|proxim[oa]s?|mas reciente) (?:version|parche|actualizacion|partido|lanzamiento|resultado|noticia)|(?:hoy|ayer|manana|este ano)\b.*\b(?:clima|temperatura|partido|gan[oó]|sale|precio|eleccion)|(?:clima|temperatura|partido|gan[oó]|sale|precio|eleccion)\b.*\b(?:hoy|ayer|manana|este ano))\b/u.test(plain);
  const [firstQuestion] = user.split(/(?<=[?!])\s+/u);
  return { kind: fresh ? 'search' : 'candidate', query: shortQuery(firstQuestion) };
}

async function searchWeb(query, stop, subject) {
  query = safeSearchQuery(query);
  if (!query) return [];
  const relevant = (hit) => matchesQuery(hit, query, subject);
  const primary = primaryPage(query);
  if (primary) return readWeb(primary, stop).catch(() => []);
  const first = new URL(duck);
  first.searchParams.set('q', query);
  first.searchParams.set('kl', 'co-es');
  let hits = await getPage(first.href, AbortSignal.any([stop, AbortSignal.timeout(5500)]))
    .then(({ body }) => duckResults(body).filter(relevant), () => []);
  if (!hits.length && !stop.aborted) {
    const backup = new URL(bing);
    backup.search = new URLSearchParams({ format: 'rss', q: query, setlang: 'es' });
    hits = await getPage(backup.href, AbortSignal.any([stop, AbortSignal.timeout(5500)]))
      .then(({ body }) => bingResults(body).filter(relevant), () => []);
  }
  const unique = [...new Map(hits.map((hit) => [hit.url, hit])).values()].slice(0, 5);
  const pages = await Promise.all(unique.map(async (hit, index) => {
    if (index >= 3) return hit;
    return getPage(hit.url, AbortSignal.any([stop, AbortSignal.timeout(4200)]))
      .then(({ body, url }) => {
        const page = pageText(body, 1650);
        return page && { ...hit, ...page, title: page.title || hit.title, url };
      }, () => hit);
  }));
  return pages.filter((page, index) => page && relevant(page) &&
    pages.findIndex((other) => other?.url === page.url) === index);
}

async function readWeb(url, stop) {
  const page = await getPage(url, AbortSignal.any([stop, AbortSignal.timeout(8500)]));
  if (page.url === nodeReleases) {
    const releases = JSON.parse(page.body);
    if (!Array.isArray(releases)) return [];
    const stable = releases.filter(({ version, date }) => /^v\d+\.\d+\.\d+$/u.test(version) && /^\d{4}-\d{2}-\d{2}$/u.test(date));
    const latest = stable[0];
    if (!latest) return [];
    const lts = stable.find((release) => typeof release.lts === 'string' && release.lts);
    const lines = ['Última versión estable de Node.js: ' + latest.version + ', publicada el ' + latest.date + '.'];
    if (lts) lines.push('Última versión LTS de Node.js: ' + lts.version + ', publicada el ' + lts.date + '.');
    return [{ title: 'Índice oficial de versiones de Node.js', excerpt: lines.join('\n'), url: page.url }];
  }
  const text = pageText(page.body, 4400);
  return text?.excerpt ? [{ ...text, url: page.url }] : [];
}

module.exports = { webAvailable, publicUrl, webIntent, subjectIn, subjectsIn, chooseSubject, matchesSubject, matchesQuery,
  usableSource, privateQuestion, safeSearchQuery, webEvidence, searchWeb, readWeb };
