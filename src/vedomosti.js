const RSS_INDEX_URL = 'https://www.vedomosti.ru/info/rss';
const RSS2JSON_URL = 'https://api.rss2json.com/v1/api.json';
const CATEGORIES_TTL_MS = 60 * 60 * 1000;
const NEWS_TTL_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;


const ALIASES = { economic: 'economics', finances: 'finance' };
const PUBLIC_SLUG = Object.fromEntries(Object.entries(ALIASES).map(([a, s]) => [s, a]));

const FALLBACK_CATEGORIES = [
  { slug: 'business', title: 'Бизнес', rssUrl: 'https://www.vedomosti.ru/rss/rubric/business' },
  { slug: 'economic', title: 'Экономика', rssUrl: 'https://www.vedomosti.ru/rss/rubric/economics' },
  { slug: 'finances', title: 'Финансы', rssUrl: 'https://www.vedomosti.ru/rss/rubric/finance' },
  { slug: 'politics', title: 'Политика', rssUrl: 'https://www.vedomosti.ru/rss/rubric/politics' },
];

class UpstreamError extends Error {}

async function fetchWithTimeout(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'vedomosti-news-reader/1.0' },
  });
  if (!res.ok) throw new UpstreamError(`${url} ответил статусом ${res.status}`);
  return res;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtml(html) {
  return decodeEntities(String(html || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}


function parseCategories(html) {
  const re = /<strong>([^<]+)<\/strong>\s*<br\s*\/?>\s*<a[^>]*href="(https?:\/\/(?:www\.)?vedomosti\.ru\/rss\/([^"]+?))(?:\.xml)?"/g;
  const seen = new Set();
  const categories = [];
  for (const [, rawTitle, rawUrl, path] of html.matchAll(re)) {
    const realSlug = path.split('/').pop();
    const slug = PUBLIC_SLUG[realSlug] || realSlug;
    if (!/^[a-z0-9_-]+$/i.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    categories.push({
      slug,
      title: stripHtml(rawTitle),
      rssUrl: rawUrl.replace(/\.xml$/, ''),
    });
  }
  return categories;
}

let categoriesCache = { at: 0, data: null, source: null };

async function getCategories() {
  if (categoriesCache.data && Date.now() - categoriesCache.at < CATEGORIES_TTL_MS) {
    return categoriesCache;
  }
  try {
    const html = await (await fetchWithTimeout(RSS_INDEX_URL)).text();
    const parsed = parseCategories(html);
    if (parsed.length === 0) throw new UpstreamError('Не удалось найти ленты на странице RSS');
    for (const required of FALLBACK_CATEGORIES) {
      if (!parsed.some((c) => c.slug === required.slug)) parsed.push(required);
    }
    categoriesCache = { at: Date.now(), data: parsed, source: 'vedomosti' };
  } catch (err) {
    console.warn(`[categories] fallback list used: ${err.message}`);
    categoriesCache = {
      at: Date.now() - CATEGORIES_TTL_MS + 60_000,
      data: FALLBACK_CATEGORIES,
      source: 'fallback',
    };
  }
  return categoriesCache;
}

async function findCategory(slug) {
  const { data } = await getCategories();
  return data.find((c) => c.slug === slug) || FALLBACK_CATEGORIES.find((c) => c.slug === slug) || null;
}

const newsCache = new Map();

async function getNews(category, count) {
  const params = new URLSearchParams({ rss_url: category.rssUrl });
  if (process.env.RSS2JSON_API_KEY) {
    params.set('api_key', process.env.RSS2JSON_API_KEY);
    params.set('count', String(count));
  }
  const url = `${RSS2JSON_URL}?${params}`;

  const cached = newsCache.get(url);
  if (cached && Date.now() - cached.at < NEWS_TTL_MS) return cached.data;

  const body = await (await fetchWithTimeout(url)).json();
  if (body.status !== 'ok') {
    throw new UpstreamError(`rss2json: ${body.message || 'неизвестная ошибка'}`);
  }

  const items = (body.items || []).map((item) => {
    const description = stripHtml(item.description || item.content);
    return {
      title: stripHtml(item.title),
      link: item.link,
      description,
      pubDate: item.pubDate,
      author: item.author,
      rubric: Array.isArray(item.categories) ? item.categories.join(', ') : '',
      image: item.enclosure && item.enclosure.link,
    };
  });
  newsCache.set(url, { at: Date.now(), data: items });
  return items;
}

module.exports = {
  ALIASES,
  FALLBACK_CATEGORIES,
  UpstreamError,
  getCategories,
  findCategory,
  getNews,
  parseCategories,
  stripHtml,
};