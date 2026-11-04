// Loads the unpacked extension into a throwaway headless Chrome, answers
// requests for store URLs with the stand-in pages in pages.js, and checks the
// panel, the rate setting and the popup. Nothing reaches the real stores.
//
//   npm run e2e
//   npm run e2e -- --screenshots docs    also writes the README screenshots
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, launchChrome, sleep, waitFor } from './cdp.js';
import { buildPages, storeModel } from './pages.js';
import { cents, displayModel, money, periodLabel } from '../../src/lib/cost.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const screenshotDir = args.includes('--screenshots') ? args[args.indexOf('--screenshots') + 1] : null;

const models = JSON.parse(readFileSync(join(root, 'data/models.json'), 'utf8'));
const rates = JSON.parse(readFileSync(join(root, 'data/rates.json'), 'utf8'));
const plainPattern = /^[A-Z]{2,}\d[A-Z0-9]{3,}\**$/;
const pick = (category, extra = () => true) => models.rows.find((r) => r[0] === category && plainPattern.test(r[3]) && /^[A-Za-z]+$/.test(r[2]) && extra(r));
const rows = { fridge: pick('fridge', (r) => r[1] === models.categories.fridge.groups.indexOf('Bottom Freezer')), tv: pick('tv', (r) => r[4]), dryer: pick('dryer') };
const PAGES = buildPages(rows);
const yearly = (kwh, cents) => `About ${money((kwh * cents) / 100)} a year to run`;

const chromePath = findChrome();
if (!chromePath) {
  console.error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.');
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'running-cost-e2e-'));
const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? `\n     ${detail}` : ''}`);
};

const chrome = await launchChrome({ chromePath, profileDir: join(workDir, 'profile'), width: 1100, height: 760 });
const problems = [];

async function attach(url) {
  const { targetId } = await chrome.send('Target.createTarget', { url });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => chrome.send(method, params, sessionId);
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
  chrome.events.on('Runtime.exceptionThrown', (p, s) => s === sessionId && problems.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
  chrome.events.on('Fetch.requestPaused', async ({ requestId, request }, s) => {
    if (s !== sessionId) return;
    const { host, pathname } = new URL(request.url);
    const body = PAGES[`${host}${pathname}`];
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: body ? 200 : 404,
      responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
      body: Buffer.from(body ?? '').toString('base64'),
    });
  });
  await send('Fetch.enable', { patterns: ['homedepot.com', 'bestbuy.com', 'amazon.com', 'lowes.com', 'walmart.com'].map((d) => ({ urlPattern: `https://www.${d}/*` })) });
  await send('Runtime.enable');
  await send('Page.enable');
  const open = async (target) => {
    await send('Page.navigate', { url: target });
    await waitFor(async () => (await evaluate('document.readyState')) === 'complete', { label: target });
  };
  const panel = (expr) => evaluate(`(() => { const root = document.getElementById('running-cost')?.shadowRoot; return root ? ${expr} : null; })()`);
  const headlines = () => panel(`[...root.querySelectorAll('.row')].map((r) => r.querySelector('.headline').textContent + ' | ' + r.querySelector('.model').textContent)`);
  const waitForPanel = (label, test = (h) => h?.length) => waitFor(async () => test(await headlines()), { label: `panel on ${label}`, timeout: 8000 }).catch(() => null);
  return { send, evaluate, open, panel, headlines, waitForPanel };
}

try {
  const { id: extensionId } = await chrome.send('Extensions.loadUnpacked', { path: root });
  check('extension loads unpacked', Boolean(extensionId));
  const page = await attach('about:blank');
  const { open, panel, headlines, waitForPanel, evaluate, send } = page;

  // Home Depot: a certified refrigerator, found from its "Model #" label.
  const { fridge, tv, dryer } = rows;
  const fridgeLine = `${yearly(fridge[5], rates.us)} | ${fridge[2]} ${storeModel(fridge[3])}`;
  await open('https://www.homedepot.com/p/fridge/320014533');
  await waitForPanel('Home Depot');
  check('Home Depot refrigerator: yearly cost at the US average', (await headlines())?.[0] === fridgeLine, `${JSON.stringify(await headlines())} vs ${fridgeLine}`);
  check('panel sits right after the title', await panel(`document.getElementById('running-cost').previousElementSibling?.tagName === 'H1'`));
  await panel(`root.querySelector('.row button').click()`);
  const body = await panel(`root.querySelector('.row .body').hidden ? '' : root.querySelector('.row .body').textContent`);
  check('details give the kWh, the 10-year cost and the label gap', /ENERGY STAR lists/.test(body) && /over 10 years/.test(body) && /EnergyGuide label prices power at 14¢/.test(body), body);
  check('details say where to set the rate', /pick your state in the extension's menu/.test(body), body);
  check('details link to the ENERGY STAR page', (await panel(`root.querySelector('.row .body a').href`)) === `https://www.energystar.gov/productfinder/product/certified-residential-refrigerators/details/${fridge[7]}`);

  // The popup's state setting updates the open page.
  const popup = await attach(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await waitFor(async () => (await popup.evaluate(`document.getElementById('state').options.length`)) > 50, { label: 'state list' });
  await popup.evaluate(`(() => { const s = document.getElementById('state'); s.value = 'PA'; s.dispatchEvent(new Event('change')); })()`);
  const paLine = `${yearly(fridge[5], rates.states.PA)} | ${fridge[2]} ${storeModel(fridge[3])}`;
  await waitForPanel('Home Depot after the rate change', (h) => h?.[0] === paLine);
  check('choosing Pennsylvania updates the open page', (await headlines())?.[0] === paLine, JSON.stringify(await headlines()));
  const using = await waitFor(async () => {
    const text = await popup.evaluate(`document.getElementById('using').textContent`);
    return /Pennsylvania/.test(text) ? text : null;
  }, { label: 'rate note' }).catch(() => null);
  check('popup says which rate it uses', using === `Using ${cents(rates.states.PA)} per kWh (Pennsylvania average, ${periodLabel(rates.period)}).`, using);
  if (screenshotDir) {
    await panel(`root.querySelector('.row .body').hidden && root.querySelector('.row button').click()`);
    await sleep(300);
    const clip = await evaluate(`(() => { const r = document.querySelector('main').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height + 8, 560), scale: 1 }; })()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(join(root, screenshotDir, 'refrigerator.png'), Buffer.from(data, 'base64'));
  }

  // Best Buy: a TV found by the UPC in its product data.
  await open('https://www.bestbuy.com/site/oled-tv/6578123.p');
  await waitForPanel('Best Buy');
  const tvLine = `${yearly(tv[5], rates.states.PA)} | ${tv[2]} ${displayModel(tv[3])}`;
  check('Best Buy TV: matched by UPC', (await headlines())?.[0] === tvLine, `${JSON.stringify(await headlines())} vs ${tvLine}`);

  // Amazon: a dryer from the "Item model number" row.
  await open('https://www.amazon.com/dp/B0TESTDRY1');
  await waitForPanel('Amazon');
  const dryerLine = `${yearly(dryer[5], rates.states.PA)} | ${dryer[2]} ${storeModel(dryer[3])}`;
  check('Amazon dryer: model number from the details table', (await headlines())?.[0] === dryerLine, `${JSON.stringify(await headlines())} vs ${dryerLine}`);

  // Lowe's: not certified, but the spec table has the yearly kWh.
  await open('https://www.lowes.com/pd/fridge/5013456789');
  await waitForPanel("Lowe's");
  check("Lowe's: falls back to the listing's kWh", (await headlines())?.[0] === `${yearly(650, rates.states.PA)} | 650 kWh a year, from the listing`, JSON.stringify(await headlines()));

  // Walmart: a space heater whose title appears after load.
  await open('https://www.walmart.com/ip/Space-Heater/552020');
  await waitForPanel('Walmart');
  const perHour = `${Math.round(1.5 * rates.states.PA)}¢`;
  check('Walmart space heater: cost per hour', (await headlines())?.[0] === `About ${perHour} an hour on high | 1,500 W heater`, JSON.stringify(await headlines()));

  // Search results get nothing, even with model numbers on the page.
  await open('https://www.homedepot.com/s/refrigerator');
  await sleep(1200);
  check('search results page gets no panel', (await headlines()) === null);

  // The popup's lookup box.
  await popup.evaluate(`(() => { const q = document.getElementById('query'); q.value = ${JSON.stringify(storeModel(fridge[3]))}; q.dispatchEvent(new Event('input')); })()`);
  const lookup = await waitFor(async () => popup.evaluate(`document.querySelector('#results .headline')?.textContent`), { label: 'lookup result' }).catch(() => null);
  check('popup lookup finds the model', lookup === yearly(fridge[5], rates.states.PA), lookup);
  const fetched = await popup.evaluate(`document.getElementById('fetched').textContent`);
  check('popup shows the data date', /^Data from /.test(fetched), fetched);
  if (screenshotDir) {
    await popup.evaluate(`document.body.style.margin = '0'`);
    const clip = await popup.evaluate(`(() => { const r = document.body.getBoundingClientRect(); return { x: 0, y: 0, width: r.width, height: r.height, scale: 1 }; })()`);
    const { data } = await popup.send('Page.captureScreenshot', { format: 'png', clip });
    writeFileSync(join(root, screenshotDir, 'popup.png'), Buffer.from(data, 'base64'));
  }

  check('no page errors', problems.length === 0, problems.join('\n     '));
} catch (error) {
  check('run finished', false, error.stack);
} finally {
  await chrome.close();
  rmSync(workDir, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
