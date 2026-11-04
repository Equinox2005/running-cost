// Rebuilds data/models.json and data/rates.json from public sources:
//   - ENERGY STAR's certified product lists (data.energystar.gov), which give
//     the yearly kWh of every certified model
//   - EIA Electric Power Monthly table 5.6.B, the average residential price of
//     electricity in each state so far this year
//
//   npm run data
//
// The GitHub workflow runs this weekly and commits any change.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STATE_NAMES } from '../src/lib/states.js';

const out = fileURLToPath(new URL('../data/', import.meta.url));
const UA = 'Mozilla/5.0 (compatible; running-cost-data/1.0; +https://github.com/Equinox2005/running-cost)';

const num = (v) => {
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

// Which ENERGY STAR list each category comes from, where its yearly kWh is,
// what "size" means for it, and the field that splits it into kinds that are
// fair to compare (a chest freezer against chest freezers).
export const CATEGORIES = {
  fridge: {
    dataset: 'p5st-her9',
    slug: 'certified-residential-refrigerators',
    kwh: (r) => num(r.annual_energy_use_kwh_yr),
    size: (r) => num(r.capacity_total_volume_ft3),
    group: (r) => r.type,
  },
  freezer: {
    dataset: '8t9c-g3tn',
    slug: 'certified-residential-freezers',
    kwh: (r) => num(r.annual_energy_use_kwh_yr),
    size: (r) => num(r.capacity_total_volume_ft3),
    group: (r) => r.type,
  },
  dishwasher: {
    dataset: 'q8py-6w3f',
    slug: 'certified-residential-dishwashers',
    kwh: (r) => num(r.annual_energy_use_kwh_year),
    size: (r) => num(r.capacity_maximum_number_of_place_settings),
    group: (r) => r.type,
  },
  washer: {
    dataset: 'bghd-e2wd',
    slug: 'certified-clothes-washers',
    // An all-in-one washer-dryer reports the drying part separately.
    kwh: (r) => {
      const wash = num(r.annual_energy_use_kwh_year);
      const dry = num(r.estimated_annual_energy_use_kwh_yr_for_the_dryer_in_a_combination_all_in_one_washer_dryer);
      return wash === null ? null : wash + (dry ?? 0);
    },
    size: (r) => num(r.volume_cubic_feet),
    group: (r) => (/combination/i.test(r.special_type ?? '') ? 'Washer-Dryer Combo' : r.load_configuration),
  },
  dryer: {
    dataset: 't9u7-4d2j',
    slug: 'certified-clothes-dryers',
    kwh: (r) => num(r.estimated_annual_energy_use_kwh_yr),
    size: (r) => num(r.drum_capacity_cu_ft),
    group: (r) => r.product_type,
    // Gas dryers report gas and electricity together as kWh, which can't be
    // priced at an electric rate.
    keep: (r) => r.type === 'Electric',
  },
  roomac: {
    dataset: '5xn2-dv4h',
    slug: 'certified-room-air-conditioners',
    kwh: (r) => num(r.annual_energy_use_kwh_yr),
    size: (r) => num(r.cooling_capacity_btu_hour),
    group: (r) => r.type,
  },
  dehumidifier: {
    dataset: 'mgiu-hu4z',
    slug: 'certified-dehumidifiers',
    kwh: (r) => num(r.annual_energy_consumption_kwh_yr),
    size: (r) => num(r.dehumidifier_water_removal_capacity_per_appendix_x1_pints_day),
    group: (r) => r.dehumidifier_type,
  },
  tv: {
    dataset: 'pd96-rr3d',
    slug: 'certified-televisions',
    kwh: (r) => num(r.reported_annual_energy_consumption_kwh),
    size: (r) => num(r.diagonal_viewable_screen_size_inches),
    group: () => 'TV',
  },
  waterheater: {
    dataset: 'pbpq-swnu',
    slug: 'certified-heat-pump-water-heaters',
    kwh: (r) => num(r.electric_usage_kwh_yr),
    size: (r) => num(r.storage_volume_gallons),
    group: (r) => r.heat_pump_type,
    keep: (r) => r.fuel === 'Electric',
  },
  aircleaner: {
    dataset: 'gaa3-swy6',
    slug: 'certified-room-air-cleaners',
    kwh: (r) => num(r.annual_energy_use_kwh_yr),
    size: (r) => num(r.pm25_cadr),
    group: () => 'Air Cleaner',
  },
};

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json,text/html' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

const upcs = (value) =>
  String(value ?? '')
    .split(/[;,\s]+/)
    .map((u) => u.replace(/\D/g, '').replace(/^0+/, ''))
    .filter((u) => u.length >= 8);

async function models() {
  const categories = {};
  const rows = [];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const records = await (await get(`https://data.energystar.gov/resource/${cat.dataset}.json?$limit=50000`)).json();
    const groups = [];
    let kept = 0;
    for (const r of records) {
      if (cat.keep && !cat.keep(r)) continue;
      const kwh = cat.kwh(r);
      const model = String(r.model_number ?? '').replace(/\s+/g, ' ').trim();
      if (!kwh || kwh <= 0 || !model) continue;
      const group = cat.group(r) || 'Other';
      if (!groups.includes(group)) groups.push(group);
      rows.push([
        key,
        groups.indexOf(group),
        String(r.brand_name ?? '').trim(),
        model,
        upcs(r.upc).join(' '),
        Math.round(kwh * 10) / 10,
        cat.size(r),
        Number(r.pd_id) || 0,
        r.meets_most_efficient_criteria === 'Yes' ? 1 : 0,
      ]);
      kept++;
    }
    categories[key] = { slug: cat.slug, dataset: cat.dataset, groups };
    console.log(`${key}: ${kept} of ${records.length} models`);
  }
  return { categories, rows };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/gi, (_, e) => (e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? ' ')))
    .replace(/\s+/g, ' ')
    .trim();

const STATES = Object.fromEntries(Object.entries(STATE_NAMES).map(([code, name]) => [name, code]));

export const EIA_TABLE = 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_b';

export function parseRates(html) {
  const text = textOf(html);
  const period = text.match(/Year-to-Date through (\w+ \d{4})/)?.[1];
  if (!period) throw new Error('EIA table: no "Year-to-Date through" heading');
  const states = {};
  let us = null;
  for (const [row] of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)) {
    const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) => textOf(m[1]));
    const residential = num(cells[1]);
    if (!residential) continue;
    if (STATES[cells[0]]) states[STATES[cells[0]]] = residential;
    if (cells[0] === 'U.S. Total') us = residential;
  }
  if (Object.keys(states).length < 51 || !us) throw new Error(`EIA table: found ${Object.keys(states).length} states`);
  return { period, us, states };
}

async function rates() {
  const html = await (await get(EIA_TABLE)).text();
  return { ...parseRates(html), source: EIA_TABLE };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fetched = new Date().toISOString().slice(0, 10);
  const { categories, rows } = await models();
  writeFileSync(`${out}models.json`, JSON.stringify({ fetched, categories, rows }).replace(/\],\[/g, '],\n['));
  const r = await rates();
  writeFileSync(`${out}rates.json`, `${JSON.stringify({ fetched, ...r }, null, 1)}\n`);
  console.log(`${rows.length} models, rates through ${r.period} (US ${r.us}¢)`);
}
