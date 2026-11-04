import { STATE_NAMES } from './states.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// EIA's table runs from January through the month named: "August 2026".
export function periodLabel(period) {
  const [month, year] = String(period).split(' ');
  const i = MONTHS.findIndex((m) => month?.startsWith(m));
  if (i < 0) return String(period);
  return i === 0 ? `Jan ${year}` : `Jan–${MONTHS[i]} ${year}`;
}

export function rateFor(settings, rates) {
  const source = rates.source;
  const custom = Number(settings?.customCents);
  if (custom > 0) return { cents: custom, label: 'your rate', custom: true, source };
  const period = periodLabel(rates.period);
  const state = settings?.state;
  if (state && rates.states[state]) return { cents: rates.states[state], label: `${STATE_NAMES[state]} average, ${period}`, source };
  return { cents: rates.us, label: `US average, ${period}`, unset: true, source };
}

// How a rate is described inside a sentence.
export const rateWhere = (rate) => (rate.unset ? `${rate.label}; pick your state in the extension's menu` : rate.label);

export function money(dollars) {
  if (dollars < 10) return `$${dollars.toFixed(2)}`;
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

export const roughly = (dollars) => money(dollars >= 1000 ? Math.round(dollars / 50) * 50 : dollars >= 100 ? Math.round(dollars / 10) * 10 : dollars);
export const cents = (value) => `${Number(value.toFixed(1))}¢`;
const kwhText = (kwh) => Math.round(kwh).toLocaleString('en-US');

const NOUNS = {
  fridge: {
    'Bottom Freezer': 'bottom-freezer refrigerator',
    'Top Freezer': 'top-freezer refrigerator',
    'Side-by-Side': 'side-by-side refrigerator',
    'Compact Refrigerator': 'compact refrigerator',
    'Freezerless and Single Door': 'all-refrigerator',
    Cooler: 'beverage cooler',
    'Compact Cooler': 'compact beverage cooler',
    'Upright Freezer': 'upright freezer',
    'Chest Freezer': 'chest freezer',
    '': 'refrigerator',
  },
  freezer: { 'Upright Freezer': 'upright freezer', Compact: 'compact freezer', 'Chest Freezer': 'chest freezer', '': 'freezer' },
  dishwasher: { Compact: 'compact dishwasher', '': 'dishwasher' },
  washer: { 'Front Load': 'front-load washer', 'Top Load': 'top-load washer', 'Washer-Dryer Combo': 'all-in-one washer-dryer', '': 'washer' },
  roomac: { Window: 'window air conditioner', 'Through the Wall': 'through-the-wall air conditioner', '': 'room air conditioner' },
  dehumidifier: { 'Whole-home Dehumidifier': 'whole-home dehumidifier', '': 'dehumidifier' },
  tv: { '': 'TV' },
  waterheater: { 'Split System HPWH': 'split heat pump water heater', '': 'heat pump water heater' },
  aircleaner: { '': 'air purifier' },
};

export function noun(category, group = '') {
  if (category === 'dryer') {
    const words = [/compact/i.test(group) && 'compact', /ventless/i.test(group) && 'ventless', 'electric dryer'].filter(Boolean);
    return words.join(' ');
  }
  const nouns = NOUNS[category] ?? {};
  return nouns[group] ?? nouns[''] ?? category;
}

const plural = (word) => `${word}s`;

const SIZES = {
  fridge: (v) => `${v} cu ft`,
  freezer: (v) => `${v} cu ft`,
  washer: (v) => `${v} cu ft`,
  dryer: (v) => `${v} cu ft`,
  dishwasher: (v) => `${v} place settings`,
  roomac: (v) => `${Math.round(v).toLocaleString('en-US')} BTU`,
  dehumidifier: (v) => `${Math.round(v)} pints a day`,
  tv: (v) => `${Math.round(v)} inches`,
  waterheater: (v) => `${Math.round(v)} gallons`,
  aircleaner: (v) => `smoke CADR ${Math.round(v)}`,
};
const sizeText = (category, value) => (value == null ? '' : (SIZES[category]?.(value) ?? String(value)));

const sizeRange = (category, low, high) => {
  if (low === high) return sizeText(category, low);
  const a = sizeText(category, low);
  const b = sizeText(category, high);
  const unit = a.replace(/^[\d.,]+\s*/, '');
  return unit && b.endsWith(unit) && /^[\d.,]+/.test(a) ? `${a.replace(unit, '').trim()} to ${b}` : `${a} to ${b}`;
};

// What the yearly figure assumes, where ENERGY STAR's test fixes it.
const BASIS = {
  roomac: 'ENERGY STAR assumes 750 hours of cooling a year, about 8 hours a day for three months.',
  tv: 'ENERGY STAR assumes 5 hours of viewing a day.',
};

// The yellow EnergyGuide label prices electricity at a national figure the
// FTC sets: 14¢ per kWh for appliances since 2023, 16¢ for TVs since 2024.
// Dryers, dehumidifiers and air purifiers don't carry the label.
export const LABEL_CENTS = { fridge: 14, freezer: 14, dishwasher: 14, washer: 14, roomac: 14, waterheater: 14, tv: 16 };

const SLUG_URL = (slug, pdId) => `https://www.energystar.gov/productfinder/product/${slug}/details/${pdId}`;

// Certified models of the same kind and a similar size: sizes within 12%,
// or 25% when that finds fewer than eight.
export function peers(index, rowIndex) {
  const [category, group, , , , , size] = index.rows[rowIndex];
  let found = [];
  for (const spread of [0.12, 0.25]) {
    found = index.rows.filter((r) => r[0] === category && r[1] === group && (size == null || r[6] == null || Math.abs(r[6] - size) <= size * spread));
    if (found.length >= 8) break;
  }
  return found.length >= 8 ? found : [];
}

export const displayModel = (model) => model.replace(/[*#?]+$/, '');

export function modelFinding(index, match, rate) {
  const row = index.rows[match.row];
  const [category, groupIndex, brand, model, , kwh, size, pdId] = row;
  const { slug, groups } = index.categories[category];
  const kind = noun(category, groups[groupIndex]);
  const yearly = (kwh * rate.cents) / 100;
  const body = [];

  const sized = size == null ? '' : ` (${sizeText(category, size)})`;
  body.push(`ENERGY STAR lists ${kwhText(kwh)} kWh a year for this ${kind}${sized}.${BASIS[category] ? ` ${BASIS[category]}` : ''}`);
  body.push(`At ${cents(rate.cents)} per kWh (${rateWhere(rate)}), that's ${money(yearly)} a year, about ${roughly(yearly * 10)} over 10 years.`);

  const labelCents = LABEL_CENTS[category];
  if (labelCents) {
    const gap = rate.cents / labelCents - 1;
    if (Math.abs(gap) >= 0.05) {
      body.push(`The yellow EnergyGuide label prices power at ${labelCents}¢ per kWh, so at this rate the real cost is ${Math.round(Math.abs(gap) * 100)}% ${gap > 0 ? 'higher' : 'lower'} than the label shows.`);
    }
  }

  let status = 'none';
  const similar = peers(index, match.row);
  if (similar.length) {
    const more = similar.filter((r) => r[5] > kwh).length;
    const share = more / similar.length;
    const sizes = similar.map((r) => r[6]).filter((v) => v != null);
    const range = sizes.length ? ` of ${sizeRange(category, Math.min(...sizes), Math.max(...sizes))}` : '';
    body.push(`Of ${similar.length} certified ${plural(kind)}${range}, ${Math.round(share * 100)}% use more electricity than this one.`);
    const best = similar.reduce((a, b) => (b[5] < a[5] ? b : a));
    const saving = ((kwh - best[5]) * rate.cents) / 100;
    if (saving >= 5) body.push(`The most efficient of them, the ${best[2]} ${displayModel(best[3])}, uses ${kwhText(best[5])} kWh, ${money(saving)} a year less.`);
    status = share >= 2 / 3 ? 'low' : share >= 1 / 3 ? 'mid' : 'high';
  }

  const shown = match.via === 'upc' || !match.text ? displayModel(model) : match.text;
  return {
    status,
    headline: `About ${money(yearly)} a year to run`,
    model: `${brand} ${shown}`.trim(),
    body,
    source: { label: 'ENERGY STAR', url: SLUG_URL(slug, pdId) },
    badge: yearlyBadge(yearly),
  };
}

export const yearlyBadge = (yearly) => (yearly < 1000 ? `$${Math.round(yearly)}` : `${Math.round(yearly / 100) / 10}k`);

// Listings for models that aren't ENERGY STAR certified often still state
// the yearly kWh from the yellow label in their specifications:
// "Annual Energy Consumption (kWh/year) 650", "650 Kilowatt Hours Per Year".
const YEARLY_KWH = /\b(annual|yearly|per year|a year|estimated)\b.*\b(kwh|kilowatt)|\b(kwh|kilowatt[- ]hours?)\s*(\/|per)\s*(yr|year)/i;

export function specKwh(snippets = []) {
  for (const snippet of snippets) {
    if (!YEARLY_KWH.test(snippet) || /\$|\bcost\b/i.test(snippet)) continue;
    const numbers = [...snippet.replace(/\([^)]*\)/g, ' ').matchAll(/\d{1,2},\d{3}|\d+(?:\.\d+)?/g)]
      .map((m) => Number(m[0].replace(',', '')))
      .filter((n) => n >= 10 && n <= 5000);
    if (numbers.length) return numbers[0];
  }
  return null;
}

export function specFinding(kwh, rate) {
  const yearly = (kwh * rate.cents) / 100;
  return {
    status: 'none',
    headline: `About ${money(yearly)} a year to run`,
    model: `${kwhText(kwh)} kWh a year, from the listing`,
    body: [
      `The listing's specifications give ${kwhText(kwh)} kWh a year. ENERGY STAR doesn't list this model, so there's no comparison with similar ones.`,
      `At ${cents(rate.cents)} per kWh (${rateWhere(rate)}), that's ${money(yearly)} a year, about ${roughly(yearly * 10)} over 10 years.`,
    ],
    source: { label: 'EIA electricity prices', url: rate.source },
    badge: yearlyBadge(yearly),
  };
}
