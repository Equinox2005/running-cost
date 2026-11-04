import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRates } from '../scripts/build-data.mjs';
import { buildIndex, findModel } from '../src/lib/match.js';
import { STATE_NAMES } from '../src/lib/states.js';
import { real } from './helpers.js';

test('the shipped model list covers every category with sane numbers', () => {
  const { rows, categories } = real.models;
  assert.ok(rows.length > 5000, `${rows.length} rows`);
  for (const category of Object.keys(categories)) assert.ok(rows.some((r) => r[0] === category), category);
  for (const row of rows) {
    assert.ok(row[5] > 0 && row[5] < 20000, `${row[3]}: ${row[5]} kWh`);
    assert.ok(categories[row[0]].groups[row[1]] !== undefined, row[3]);
  }
});

test('almost every certified model can be found by its own number', () => {
  const index = buildIndex(real.models);
  const plain = real.models.rows.filter((r) => /^[A-Z0-9-]{6,}$/.test(r[3]) && /\d/.test(r[3]) && r[3].replace(/\D/g, '').length >= (/[A-Z]/.test(r[3]) ? 1 : 7));
  const missed = plain.filter((r) => !findModel(index, r[3].replace(/-/g, '')).length);
  assert.ok(missed.length / plain.length < 0.01, `${missed.length} of ${plain.length} missed`);
});

test('the shipped rates have every state', () => {
  const { states, us, period } = real.rates;
  assert.deepEqual(Object.keys(states).sort(), Object.keys(STATE_NAMES).sort());
  assert.ok(us > 5 && us < 60);
  assert.match(period, /^[A-Z][a-z]+ \d{4}$/);
});

test('the EIA table parser reads state rows and the US total', () => {
  const rows = Object.entries(STATE_NAMES)
    .map(([, name], i) => `<tr><td>${name}</td><td>${(15 + i / 10).toFixed(2)}</td><td>14.00</td></tr>`)
    .join('');
  const html = `<table><tr><th>by State, Year-to-Date through August 2026 and 2025</th></tr>${rows}<tr><td>U.S. Total</td><td>18.19</td></tr></table>`;
  const parsed = parseRates(html);
  assert.equal(parsed.period, 'August 2026');
  assert.equal(parsed.us, 18.19);
  assert.equal(parsed.states.AL, 15);
  assert.equal(Object.keys(parsed.states).length, 51);
});

test('the data script only runs its downloads when called directly', () => {
  const source = readFileSync(new URL('../scripts/build-data.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(process\.argv\[1\] === fileURLToPath\(import\.meta\.url\)\)/);
});
