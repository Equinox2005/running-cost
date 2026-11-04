import { clean } from './text.js';

// Model numbers are compared in capitals with spaces, dashes, dots and
// slashes taken out, because stores and ENERGY STAR punctuate them
// differently ("WRS325SDHZ", "WRS-325-SDHZ").
export const squash = (text) => clean(text).toUpperCase().replace(/[^A-Z0-9]/g, '');

// ENERGY STAR writes a model family with wildcards: "WRS325SDH*" covers the
// colour variants WRS325SDHB, WRS325SDHW and WRS325SDHZ, "GDE21DMK****"
// covers GDE21DMKES, and "MFI2568AE(W/S/B)" spells the options out. Each
// wildcard stands for one character or none, and a family that ends in one
// also allows a short revision suffix ("WRS325SDHZ08"). Some brands (IKEA,
// Kenmore) use plain article numbers, which need at least seven digits.
export function compilePattern(model) {
  const text = clean(model)
    .toUpperCase()
    .replace(/\(([^)]*)\)/g, (_, inner) => '*'.repeat(Math.max(1, ...inner.split(/[/,|]/).map((part) => part.replace(/[^A-Z0-9]/g, '').length))));
  const squashed = text.replace(/[#?]/g, '*').replace(/[^A-Z0-9*]/g, '');
  const literal = squashed.replace(/\*/g, '');
  const digitsOnly = /^\d+$/.test(literal);
  if (!/\d/.test(literal) || literal.length < (digitsOnly ? 7 : 4)) return null;
  const body = squashed.replace(/\*+/g, (stars) => `[A-Z0-9]{0,${stars.length}}`);
  const tail = squashed.endsWith('*') ? '[A-Z0-9]{0,2}' : '';
  return { re: new RegExp(`^${body}${tail}$`), prefix: squashed.split('*')[0], literal: literal.length, digitsOnly };
}

// Some entries carry a description after the model number:
// "RS2484W*E* Ice & Water", "FR17-Vintage Blue". The part before the first
// ordinary word is the model number itself.
export function modelVariants(model) {
  const variants = [model];
  const words = clean(model).split(/[\s-]+/);
  const cut = words.findIndex((word) => /^[A-Z]?[a-z]{2,}$/.test(word) || word === '&');
  if (cut > 0) variants.push(words.slice(0, cut).join(' '));
  return variants;
}

const push = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

// rows: [category, group, brand, model, upcs, kWh/yr, size, pd_id, mostEfficient]
export function buildIndex(data) {
  const byPrefix = new Map();
  const loose = [];
  const byUpc = new Map();
  data.rows.forEach((row, i) => {
    for (const variant of modelVariants(row[3])) {
      const pattern = compilePattern(variant);
      if (!pattern) continue;
      const entry = { ...pattern, row: i };
      if (pattern.prefix.length >= 4) push(byPrefix, pattern.prefix.slice(0, 4), entry);
      else loose.push(entry);
    }
    for (const upc of row[4].split(' ').filter(Boolean)) push(byUpc, upc, i);
  });
  return { byPrefix, loose, byUpc, rows: data.rows, categories: data.categories };
}

export function findModel(index, key) {
  const hits = [];
  for (const entry of index.byPrefix.get(key.slice(0, 4)) ?? []) if (entry.re.test(key)) hits.push(entry);
  for (const entry of index.loose) if (entry.re.test(key)) hits.push(entry);
  return hits;
}

// What a store calls the model can carry a region or packaging code:
// "DV45K7100GW/A2", "LRMVS3006S-US".
export function candidateKeys(text) {
  const upper = clean(text).toUpperCase();
  const keys = new Set([squash(upper)]);
  const trimmed = upper.replace(/[/-][A-Z0-9]{1,3}$/, '');
  if (trimmed !== upper) keys.add(squash(trimmed));
  return [...keys].filter((key) => key.length >= 4);
}

const plain = (text) =>
  clean(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '');

// The first word of a brand, without accents or punctuation: "GE Profile" and
// "GE Appliances" are both "ge", "Café" is "cafe", "Sub-Zero" is "subzero".
export const brandKey = (brand) => plain(brand).trim().split(/\s+/)[0] ?? '';

export const brandsAgree = (a, b) => {
  const x = brandKey(a);
  const y = brandKey(b);
  return Boolean(x && y && (x === y || x.startsWith(y) || y.startsWith(x)));
};

const mentionsBrand = (text, brand) => {
  const key = brandKey(brand);
  return Boolean(key) && ` ${plain(text)} `.includes(` ${key} `);
};

const VALUE = '([A-Za-z0-9][A-Za-z0-9*./-]{2,30})';
const MODEL_LABEL = new RegExp(`\\b(?:item\\s+)?model(?!\\s*(?:name|year|type|family|series|line)\\b)(?:\\s*(?:#|number|no\\.?|num\\.?))?\\s*[:#]?\\s*${VALUE}`, 'gi');
const PART_LABEL = new RegExp(`\\b(?:manufacturer\\s+part\\s+number|mfr\\.?\\s*(?:part\\s*)?(?:#|number|no\\.?)|mpn|part\\s+number)\\s*[:#]?\\s*${VALUE}`, 'gi');
const UPC_LABEL = /\b(?:upc|gtin(?:-?(?:8|12|13|14))?|ean)(?:\s*code)?\s*[:#]?\s*(\d{8,14})\b/gi;
const BRAND_LABEL = /^\s*brand\s*(?:name)?\s*[:#]?\s*([^:]{2,40})$/i;

const UNIT = /^\d+(?:\.\d+)?(?:W|KW|KWH|V|A|AMPS?|BTUS?|FT|IN|INCH|GAL|LBS?|CU|QT|HZ|MM|CM|L|PT|PINTS?|K|P|GB|TB|HP|MAH|DB|SQFT|CFM|PCS?|PACK)$/;
const looksLikeModel = (word) => word.length >= 5 && /[A-Z]/i.test(word) && /\d/.test(word) && !/[a-z]{2}/.test(word) && !UNIT.test(word.toUpperCase()) && !/\d-IN-\d/i.test(word);

export function titleModels(title) {
  return clean(title)
    .split(/[\s,;:()[\]{}|"!?]+/)
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter(looksLikeModel);
}

const str = (value) => (typeof value === 'string' || typeof value === 'number' ? clean(String(value)) : '');
const digits = (value) => str(value).replace(/\D/g, '').replace(/^0+/, '');

// Turns what the content script collected into model numbers to try, best
// first: structured product data, then labelled text on the page in the
// order it appears, then model-like words in the title.
export function extractCandidates({ title = '', ld = [], snippets = [] }) {
  const candidates = [];
  const upcs = [];
  let brand = '';
  const add = (text, from) => {
    const value = str(text);
    if (value.length >= 4 && /\d/.test(value) && !candidates.some((c) => c.text === value)) candidates.push({ text: value, from });
  };
  for (const product of ld) {
    brand ||= str(product.brand);
    add(product.model, 'ld');
    add(product.mpn, 'ld');
    for (const gtin of product.gtin ?? []) if (digits(gtin).length >= 8) upcs.push(digits(gtin));
  }
  for (const snippet of snippets) {
    const text = clean(snippet);
    for (const m of text.matchAll(MODEL_LABEL)) add(m[1], 'label');
    for (const m of text.matchAll(PART_LABEL)) add(m[1], 'label');
    for (const m of text.matchAll(UPC_LABEL)) upcs.push(digits(m[1]));
    brand ||= text.match(BRAND_LABEL)?.[1] ?? '';
  }
  for (const word of titleModels(title)) add(word, 'title');
  return { candidates, upcs: [...new Set(upcs)].filter((u) => u.length >= 8), brand, title };
}

// The best ENERGY STAR row for a listing, or null. A UPC names one exact
// product, so it wins outright. Otherwise every candidate is tried. A model
// number taken from the title, or one made only of digits, counts only when
// the brand matches too.
export function matchListing(index, listing) {
  const { candidates, upcs, brand, title } = extractCandidates(listing);
  for (const upc of upcs) {
    const rows = index.byUpc.get(upc);
    if (rows?.length) return { row: rows[0], text: null, via: 'upc' };
  }
  let best = null;
  candidates.forEach((candidate, order) => {
    for (const key of candidateKeys(candidate.text)) {
      for (const hit of findModel(index, key)) {
        const esBrand = index.rows[hit.row][2];
        const agree = brand ? brandsAgree(brand, esBrand) : null;
        const named = mentionsBrand(title, esBrand);
        if ((candidate.from === 'title' || hit.digitsOnly) && !named && agree !== true) continue;
        if (agree === false && !named && hit.literal < 7) continue;
        const score =
          (candidate.from === 'title' ? 0 : 100) - order * 4 + hit.literal * 2 + (hit.literal === key.length ? 10 : 0) + (agree || named ? 20 : 0);
        if (!best || score > best.score) best = { score, row: hit.row, text: candidate.text, via: candidate.from };
      }
    }
  });
  return best;
}

// The popup's lookup box: exact family matches first, then models that start
// with what was typed.
export function searchModels(index, query, limit = 6) {
  const found = new Set();
  for (const key of candidateKeys(query)) for (const hit of findModel(index, key)) found.add(hit.row);
  const key = squash(query);
  if (found.size < limit && key.length >= 4) {
    for (const [i, row] of index.rows.entries()) {
      if (found.size >= limit) break;
      if (squash(row[3].replace(/[*#?]/g, '')).startsWith(key)) found.add(i);
    }
  }
  return [...found].slice(0, limit);
}
