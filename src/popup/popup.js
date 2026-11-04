import { STATE_NAMES } from '../lib/states.js';
import { cents } from '../lib/cost.js';

const $ = (id) => document.getElementById(id);

function item(finding, expanded) {
  const li = document.createElement('li');
  li.className = finding.status;
  const top = document.createElement('div');
  top.className = 'top';
  top.append(Object.assign(document.createElement('span'), { className: 'dot' }), Object.assign(document.createElement('span'), { className: 'headline', textContent: finding.headline }));
  li.append(top, Object.assign(document.createElement('div'), { className: 'model', textContent: finding.model }));
  if (expanded) {
    const body = document.createElement('div');
    body.className = 'body';
    for (const line of finding.body) body.append(Object.assign(document.createElement('p'), { textContent: line }));
    const source = document.createElement('p');
    source.append('Source: ', Object.assign(document.createElement('a'), { href: finding.source.url, textContent: finding.source.label, target: '_blank', rel: 'noopener noreferrer' }));
    body.append(source);
    li.append(body);
  }
  return li;
}

function show(list, empty, findings, expanded) {
  list.replaceChildren(...findings.map((f) => item(f, expanded)));
  empty.hidden = findings.length > 0;
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const key = tab ? `tab:${tab.id}` : null;
  const showPage = async () => {
    const stored = key ? (await chrome.storage.session.get(key))[key] : null;
    show($('page'), $('page-empty'), stored && stored.url === tab.url ? stored.findings : [], false);
  };
  await showPage();
  // The page's panel is recalculated when the rate changes; follow it.
  chrome.storage.session.onChanged.addListener((changes) => key in changes && showPage());

  const about = await chrome.runtime.sendMessage({ type: 'about' });
  if (about.fetched) $('fetched').textContent = `Data from ${new Date(`${about.fetched}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const select = $('state');
  select.append(new Option(`US average (${cents(about.rates.us)})`, ''));
  for (const [code, name] of Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]))) {
    select.append(new Option(`${name} (${cents(about.rates.states[code])})`, code));
  }
  const { state = null, customCents = null } = await chrome.storage.sync.get(['state', 'customCents']);
  select.value = state ?? '';
  $('custom').value = customCents ?? '';

  const using = async () => {
    const { rate } = await chrome.runtime.sendMessage({ type: 'about' });
    $('using').textContent = `Using ${cents(rate.cents)} per kWh (${rate.label}).`;
  };
  await using();

  let pending;
  const lookup = async () => {
    const query = $('query').value.trim();
    if (!query) {
      show($('results'), $('results-empty'), [], true);
      $('results-empty').hidden = true;
      return;
    }
    const { findings = [] } = await chrome.runtime.sendMessage({ type: 'lookup', query });
    show($('results'), $('results-empty'), findings, true);
  };

  select.addEventListener('change', async () => {
    await chrome.storage.sync.set({ state: select.value || null });
    await using();
    await lookup();
  });
  let typing;
  $('custom').addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(async () => {
      const value = Number.parseFloat($('custom').value);
      await chrome.storage.sync.set({ customCents: value > 0 && value <= 200 ? value : null });
      await using();
      await lookup();
    }, 300);
  });

  $('query').addEventListener('input', () => {
    clearTimeout(pending);
    pending = setTimeout(lookup, 200);
  });
  $('lookup').addEventListener('submit', (e) => {
    e.preventDefault();
    lookup();
  });
}

init();
