import { readFileSync } from 'node:fs';
import { buildIndex } from '../src/lib/match.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
export const real = { models: load('models'), rates: load('rates') };

// A small hand-made list in the same shape as data/models.json, so the
// matching tests don't depend on what ENERGY STAR certifies this week.
// rows: [category, group, brand, model, upcs, kWh/yr, size, pd_id, mostEfficient]
export const fixture = {
  fetched: '2026-11-04',
  categories: {
    fridge: { slug: 'certified-residential-refrigerators', groups: ['Bottom Freezer', 'Top Freezer'] },
    dryer: { slug: 'certified-clothes-dryers', groups: ['Electric Standard Vented'] },
    tv: { slug: 'certified-televisions', groups: ['TV'] },
    roomac: { slug: 'certified-room-air-conditioners', groups: ['Window'] },
  },
  rows: [
    ['fridge', 0, 'LG', 'LRMVS3006*', '48231806145 48231806152', 799, 29.5, 2356292, 0],
    ['fridge', 0, 'GE', 'GDE21DMK****', '67732152421', 488, 20.9, 2394073, 0],
    ['fridge', 0, 'Fisher & Paykel', 'RS2484W*E* Ice & Water', '', 363, 12.2, 3891608, 1],
    ['fridge', 0, 'Frigidaire', 'MFI2568AE(W/S/B)', '', 640, 25.6, 1000001, 0],
    ['fridge', 0, 'DCS', 'RS36(X)', '', 561, 16.8, 2245081, 0],
    ['dryer', 0, 'Whirlpool', 'WED5605M**', '883049626567', 608, 7.4, 2384396, 0],
    ['tv', 0, 'LG', 'OLED65C5***', '195174102688', 275, 64.5, 3798866, 0],
    ['roomac', 0, 'Midea', 'MAW08V1QWT', '', 400, 8000, 3000001, 0],
    // Twelve bottom-freezer refrigerators around 29 cu ft for the comparison.
    ...[620, 650, 680, 700, 720, 740, 760, 780, 820, 840, 860, 900].map((kwh, i) => ['fridge', 0, 'Acme', `AC29BF${String(i).padStart(2, '0')}`, '', kwh, 28 + (i % 4) * 0.5, 4000000 + i, 0]),
  ],
};
export const index = buildIndex(fixture);

export const RATES = { fetched: '2026-11-04', period: 'August 2026', us: 18.19, states: { PA: 21.13, HI: 46.41, TX: 16.03 }, source: 'https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_b' };
