import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandsAgree, candidateKeys, compilePattern, extractCandidates, matchListing, searchModels, titleModels } from '../src/lib/match.js';
import { index } from './helpers.js';

const modelOf = (match) => (match ? index.rows[match.row][3] : null);

test('wildcards stand for one character or none, with a short revision suffix after a trailing one', () => {
  const { re } = compilePattern('WRS325SDH*');
  assert.ok(re.test('WRS325SDHZ'));
  assert.ok(re.test('WRS325SDH'));
  assert.ok(re.test('WRS325SDHZ08'));
  assert.ok(!re.test('WRS325SDHZ0812'));
  assert.ok(!re.test('WRS325SDA'));
  assert.ok(compilePattern('GDE21DMK****').re.test('GDE21DMKES'));
});

test('a model without a trailing wildcard must match exactly', () => {
  const { re } = compilePattern('MAW08V1QWT');
  assert.ok(re.test('MAW08V1QWT'));
  assert.ok(!re.test('MAW08V1QWT2'));
});

test('options in brackets become wildcards', () => {
  const { re } = compilePattern('MFI2568AE(W/S/B)');
  assert.ok(re.test('MFI2568AEW'));
  assert.ok(re.test('MFI2568AES'));
});

test('patterns that are too short or have no digits are dropped', () => {
  assert.equal(compilePattern('RS*'), null);
  assert.equal(compilePattern('Double E'), null);
});

test('store punctuation and region codes are ignored', () => {
  assert.deepEqual(candidateKeys('DV45K7100GW/A2'), ['DV45K7100GWA2', 'DV45K7100GW']);
  assert.deepEqual(candidateKeys('lrmvs-3006s'), ['LRMVS3006S']);
});

test('brands compare on their first word', () => {
  assert.ok(brandsAgree('GE Appliances', 'GE'));
  assert.ok(brandsAgree('Café', 'CAFE'));
  assert.ok(!brandsAgree('Whirlpool', 'Maytag'));
});

test('model-like words in a title skip units and sizes', () => {
  assert.deepEqual(titleModels('LG LRMVS3006S 30 cu. ft. 4-Door French Door Refrigerator, 1500W, 120V, 36-Inch'), ['LRMVS3006S']);
});

test('labels, structured data and UPCs are all read', () => {
  const found = extractCandidates({
    title: 'Refrigerator',
    ld: [{ brand: 'GE', model: 'GDE21DMKES', mpn: '', gtin: ['0084691812345'] }],
    snippets: ['Item model number ‏ : ‎ LRMVS3006S', 'Brand LG', 'UPC 048231806145'],
  });
  assert.deepEqual(found.candidates.map((c) => [c.text, c.from]), [['GDE21DMKES', 'ld'], ['LRMVS3006S', 'label']]);
  assert.deepEqual(found.upcs, ['84691812345', '48231806145']);
  assert.equal(found.brand, 'GE');
});

test('"Model Name" and "Model Year" are not model numbers', () => {
  const found = extractCandidates({ snippets: ['Model Name Gallery 2024', 'Model Year 2024'] });
  assert.deepEqual(found.candidates, []);
});

test('a labelled model number on the page finds the certified family', () => {
  const match = matchListing(index, { title: 'GE 20.9 cu. ft. Bottom Freezer Refrigerator', snippets: ['Model # GDE21DMKES', 'Internet #320014533'] });
  assert.equal(modelOf(match), 'GDE21DMK****');
  assert.equal(match.text, 'GDE21DMKES');
});

test('a UPC wins over everything else', () => {
  const match = matchListing(index, { title: 'Washer', ld: [{ model: 'GDE21DMKES', gtin: ['00883049626567'] }] });
  assert.equal(modelOf(match), 'WED5605M**');
  assert.equal(match.via, 'upc');
});

test('a title model only counts when the brand is in the title', () => {
  assert.equal(modelOf(matchListing(index, { title: 'LG LRMVS3006S 30 cu ft Refrigerator' })), 'LRMVS3006*');
  assert.equal(matchListing(index, { title: 'Generic LRMVS3006S replacement shelf' }), null);
});

test('a short model number from another brand is rejected', () => {
  assert.equal(matchListing(index, { title: 'Samsung refrigerator', ld: [{ brand: 'Samsung', model: 'RS36A' }] }), null);
  assert.equal(modelOf(matchListing(index, { title: 'DCS refrigerator', ld: [{ brand: 'DCS', model: 'RS36X' }] })), 'RS36(X)');
});

test('a description after the model number is ignored', () => {
  assert.equal(modelOf(matchListing(index, { title: 'Fisher & Paykel refrigerator', snippets: ['Model: RS2484WLE1'] })), 'RS2484W*E* Ice & Water');
});

test('lookup finds families and model numbers that start with the query', () => {
  assert.deepEqual(searchModels(index, 'OLED65C5PUA').map((r) => index.rows[r][3]), ['OLED65C5***']);
  assert.deepEqual(searchModels(index, 'AC29BF0', 3).length, 3);
});
