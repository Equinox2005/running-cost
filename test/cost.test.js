import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchListing } from '../src/lib/match.js';
import { modelFinding, money, noun, periodLabel, rateFor, specFinding, specKwh } from '../src/lib/cost.js';
import { heaterFinding, wattages } from '../src/lib/heater.js';
import { index, RATES } from './helpers.js';

const PA = rateFor({ state: 'PA' }, RATES);

test('the rate comes from a custom value, then the state, then the US average', () => {
  assert.equal(rateFor({ customCents: 23.4, state: 'PA' }, RATES).cents, 23.4);
  assert.deepEqual([PA.cents, PA.label], [21.13, 'Pennsylvania average, Jan–Aug 2026']);
  const us = rateFor({}, RATES);
  assert.equal(us.cents, 18.19);
  assert.ok(us.unset);
});

test('period labels', () => {
  assert.equal(periodLabel('August 2026'), 'Jan–Aug 2026');
  assert.equal(periodLabel('January 2027'), 'Jan 2027');
});

test('money rounds to dollars, except under $10', () => {
  assert.equal(money(168.8), '$169');
  assert.equal(money(1234.5), '$1,235');
  assert.equal(money(4.8), '$4.80');
});

test('nouns', () => {
  assert.equal(noun('fridge', 'Bottom Freezer'), 'bottom-freezer refrigerator');
  assert.equal(noun('dryer', 'Electric Compact Ventless 240V'), 'compact ventless electric dryer');
  assert.equal(noun('tv', 'TV'), 'TV');
});

test('a refrigerator finding gives the yearly cost, the label gap and the comparison', () => {
  const match = matchListing(index, { title: 'LG refrigerator', snippets: ['Model Number: LRMVS3006S'] });
  const finding = modelFinding(index, match, PA);
  assert.equal(finding.headline, 'About $169 a year to run');
  assert.equal(finding.model, 'LG LRMVS3006S');
  assert.match(finding.body[0], /^ENERGY STAR lists 799 kWh a year for this bottom-freezer refrigerator \(29\.5 cu ft\)\.$/);
  assert.match(finding.body[1], /21\.1¢ per kWh \(Pennsylvania average, Jan–Aug 2026\), that's \$169 a year, about \$1,700 over 10 years\./);
  assert.match(finding.body[2], /prices power at 14¢ per kWh, so at this rate the real cost is 51% higher/);
  assert.match(finding.body[3], /^Of 13 certified bottom-freezer refrigerators of 28 to 29\.5 cu ft, 31% use more electricity than this one\.$/);
  assert.match(finding.body[4], /the Acme AC29BF00, uses 620 kWh, \$38 a year less\./);
  assert.equal(finding.status, 'high');
  assert.equal(finding.source.url, 'https://www.energystar.gov/productfinder/product/certified-residential-refrigerators/details/2356292');
  assert.equal(finding.badge, '$169');
});

test('TVs are compared with the 16¢ label and room ACs explain the hours', () => {
  const tv = modelFinding(index, matchListing(index, { title: 'LG OLED TV', ld: [{ model: 'OLED65C5PUA' }] }), rateFor({ state: 'HI' }, RATES));
  assert.match(tv.body[0], /5 hours of viewing a day/);
  assert.match(tv.body.join(' '), /prices power at 16¢ per kWh, so at this rate the real cost is 190% higher/);
  const ac = modelFinding(index, matchListing(index, { title: 'Midea AC', snippets: ['Model MAW08V1QWT'] }), PA);
  assert.match(ac.body[0], /750 hours of cooling a year/);
});

test('no label comparison when the rate is close to the label', () => {
  const near = rateFor({ customCents: 14.3 }, RATES);
  const finding = modelFinding(index, matchListing(index, { title: 'GE', snippets: ['Model # GDE21DMKES'] }), near);
  assert.ok(!finding.body.some((line) => /EnergyGuide/.test(line)));
});

test('an unset rate tells you where to set it', () => {
  const finding = modelFinding(index, matchListing(index, { title: 'GE', snippets: ['Model # GDE21DMKES'] }), rateFor({}, RATES));
  assert.match(finding.body[1], /US average, Jan–Aug 2026; pick your state in the extension's menu/);
});

test('yearly kWh from a spec table', () => {
  assert.equal(specKwh(['Annual Energy Consumption (kWh/year) 650']), 650);
  assert.equal(specKwh(['Annual Energy Consumption 1,220 Kilowatt Hours Per Year']), 1220);
  assert.equal(specKwh(['Energy Consumption 116 kilowatt hours per year']), 116);
  assert.equal(specKwh(['Estimated Yearly Energy Cost $56']), null);
  assert.equal(specKwh(['Energy Consumption 0.85 kWh/cycle']), null);
  const finding = specFinding(650, PA);
  assert.equal(finding.headline, 'About $137 a year to run');
  assert.equal(finding.model, '650 kWh a year, from the listing');
});

test('space heaters: wattage, cost per hour and per month', () => {
  assert.deepEqual(wattages('Space Heater 1500W/750W, 2 settings'), [1500, 750]);
  assert.deepEqual(wattages('1,500-Watt Oil-Filled Radiator Heater'), [1500]);
  const finding = heaterFinding({ title: 'Dreo Space Heater, 1500W/750W Portable Electric Heater' }, PA);
  assert.equal(finding.headline, 'About 32¢ an hour on high');
  assert.match(finding.body[1], /8 hours a day comes to about \$76 a month\. 4 hours: \$38\. 12 hours: \$114\./);
  assert.match(finding.body[2], /750 W setting it costs about 16¢ an hour/);
});

test('water heaters, propane heaters and heater parts are not space heaters', () => {
  assert.equal(heaterFinding({ title: 'Rheem 50 Gal. 4500-Watt Electric Water Heater' }, PA), null);
  assert.equal(heaterFinding({ title: 'Mr. Heater Big Buddy Propane Heater 18,000 BTU' }, PA), null);
  assert.equal(heaterFinding({ title: 'Replacement 1500W heating element for space heater' }, PA), null);
});
