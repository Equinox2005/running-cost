import { buildIndex, matchListing, searchModels } from './lib/match.js';
import { modelFinding, rateFor, specFinding, specKwh } from './lib/cost.js';
import { heaterFinding } from './lib/heater.js';

let ready;
function data() {
  ready ??= Promise.all(['models', 'rates'].map((name) => fetch(chrome.runtime.getURL(`data/${name}.json`)).then((r) => r.json()))).then(
    ([models, rates]) => ({ index: buildIndex(models), rates, fetched: models.fetched }),
  );
  return ready;
}

async function rate() {
  const { rates } = await data();
  const settings = await chrome.storage.sync.get(['state', 'customCents']);
  return rateFor(settings, rates);
}

async function check(listing) {
  const { index } = await data();
  const current = await rate();
  const match = matchListing(index, listing);
  if (match) return [modelFinding(index, match, current)];
  const kwh = specKwh(listing.snippets);
  if (kwh) return [specFinding(kwh, current)];
  const heater = heaterFinding(listing, current);
  return heater ? [heater] : [];
}

async function showOnToolbar(tabId, findings) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#24292f' });
  await chrome.action.setBadgeText({ tabId, text: findings[0]?.badge ?? '' });
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    if (message.type === 'check') {
      const findings = await check(message);
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        await chrome.storage.session.set({ [`tab:${tabId}`]: { url: sender.tab.url, findings } });
        await showOnToolbar(tabId, findings);
      }
      reply({ findings });
    } else if (message.type === 'lookup') {
      const { index } = await data();
      const current = await rate();
      const rows = searchModels(index, message.query);
      reply({ findings: rows.map((row) => modelFinding(index, { row, text: null, via: 'lookup' }, current)) });
    } else if (message.type === 'about') {
      const { rates, fetched } = await data();
      reply({ fetched, rates, rate: await rate() });
    }
  })().catch((error) => reply({ error: String(error) }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab:${tabId}`));
