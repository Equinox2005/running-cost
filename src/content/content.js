// Collects what identifies the product (its structured data, any "Model #",
// "UPC" or "Brand" labels, and the title), asks the service worker what it
// costs to run, and puts a small panel under the product title. Stores
// rebuild their pages after load, so the scan reruns when the page changes.
(() => {
  const site = globalThis.RUNNING_COST_SITES.find((s) => s.host.test(location.hostname));
  if (!site) return;

  const HOST_ID = 'running-cost';
  let lastKey = '';

  const text = (el) => (el?.innerText ?? el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 80) : '');

  function titleElement() {
    for (const selector of site.title) {
      const el = [...document.querySelectorAll(selector)].find((e) => text(e) && !e.closest(`#${HOST_ID}`));
      if (el) return el;
    }
    return null;
  }

  // schema.org Product data, from JSON-LD and microdata.
  function products() {
    const found = [];
    const visit = (node, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 6) return;
      if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
      const type = [].concat(node['@type'] ?? []).join(' ');
      if (/\bProduct\b/.test(type)) found.push(node);
      for (const key of ['@graph', 'mainEntity', 'itemOffered']) if (node[key]) visit(node[key], depth + 1);
    };
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        visit(JSON.parse(script.textContent));
      } catch {
        // Some stores ship invalid JSON-LD; skip it.
      }
    }
    const list = found.slice(0, 3).map((p) => ({
      brand: str(p.brand?.name ?? p.brand),
      model: str(p.model?.name ?? p.model),
      mpn: str(p.mpn),
      gtin: [p.gtin, p.gtin8, p.gtin12, p.gtin13, p.gtin14, p.upc].map(str).filter(Boolean),
    }));
    const prop = (name) => {
      const el = document.querySelector(`[itemprop="${name}"]`);
      return el ? str(el.getAttribute('content') ?? text(el)) : '';
    };
    const micro = { brand: prop('brand'), model: prop('model'), mpn: prop('mpn'), gtin: ['gtin12', 'gtin13', 'gtin14'].map(prop).filter(Boolean) };
    if (micro.model || micro.mpn || micro.gtin.length) list.push(micro);
    return list;
  }

  // Short text nodes that label a model number, part number, UPC, brand or
  // yearly energy use, with the value next to them. Stores put the value in
  // the same element ("Model # WRS325SDHZ"), the next table cell, or the
  // next sibling.
  const LABEL = /(\bmodel\s*(#|number|no\b|num\b|:|$)|\bitem model\b|\bmpn\b|\bupc\b|\bgtin\b|manufacturer part|part number|^\s*brand\s*(name)?\s*:?\s*$|^\s*brand\s*:|\bkwh\b|kilowatt|energy consumption|electricity use)/i;
  function labelled() {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.data.length < 120 && LABEL.test(node.data.trim()) && !node.parentElement?.closest(`script, style, noscript, #${HOST_ID}`)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    });
    for (let node = walker.nextNode(); node && out.length < 24; node = walker.nextNode()) {
      const element = node.parentElement;
      const cell = element.closest('th, td, dt, li') ?? element;
      let snippet = text(cell.closest('tr') ?? cell);
      // A label on its own ("Model #", "Annual Energy Consumption (kWh/year)") has its value next door.
      if (cell.matches('dt') || !/\d/.test(snippet.replace(/\([^)]*\)/g, ''))) snippet += ` ${text(cell.nextElementSibling ?? element.nextElementSibling)}`;
      out.push(snippet.slice(0, 200));
    }
    return out;
  }

  const STYLE = `
    :host { all: initial; display: block; margin: 8px 0 10px; }
    .panel { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2328; background: #fff;
      border: 1px solid #d0d7de; border-radius: 6px; max-width: 620px; overflow: hidden; }
    .label { font-size: 11px; color: #59636e; padding: 6px 10px 0; letter-spacing: .02em; }
    button { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; gap: 8px; align-items: baseline;
      padding: 6px 10px 7px; }
    button:focus-visible { outline: 2px solid #0969da; outline-offset: -2px; }
    .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; transform: translateY(-1px); background: #8c959f; }
    .low .dot { background: #1a7f37; } .high .dot { background: #bc4c00; }
    .headline { font-weight: 600; }
    .model { color: #59636e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
    .more { flex: none; color: #59636e; font-size: 12px; }
    .body { padding: 0 10px 9px 26px; color: #424a53; }
    .body p { margin: 0 0 4px; }
    .body a { color: #0969da; }
  `;

  function render(anchor, findings) {
    document.getElementById(HOST_ID)?.remove();
    if (!findings.length) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Running Cost');
    panel.append(Object.assign(document.createElement('div'), { className: 'label', textContent: 'Running Cost' }));

    for (const finding of findings) {
      const row = document.createElement('div');
      row.className = `row ${finding.status}`;
      const button = document.createElement('button');
      button.setAttribute('aria-expanded', 'false');
      const more = Object.assign(document.createElement('span'), { className: 'more', textContent: 'Details' });
      button.append(
        Object.assign(document.createElement('span'), { className: 'dot' }),
        Object.assign(document.createElement('span'), { className: 'headline', textContent: finding.headline }),
        Object.assign(document.createElement('span'), { className: 'model', textContent: finding.model, title: finding.model }),
        more,
      );
      const body = document.createElement('div');
      body.className = 'body';
      body.hidden = true;
      for (const line of finding.body) body.append(Object.assign(document.createElement('p'), { textContent: line }));
      const source = document.createElement('p');
      source.append('Source: ', Object.assign(document.createElement('a'), { href: finding.source.url, textContent: finding.source.label, target: '_blank', rel: 'noopener noreferrer' }));
      body.append(source);
      button.addEventListener('click', () => {
        body.hidden = !body.hidden;
        button.setAttribute('aria-expanded', String(!body.hidden));
        more.textContent = body.hidden ? 'Details' : 'Hide';
      });
      row.append(button, body);
      panel.append(row);
    }
    root.append(style, panel);
    anchor.insertAdjacentElement('afterend', host);
  }

  async function scan(force = false) {
    if (!site.page.test(location.pathname)) {
      document.getElementById(HOST_ID)?.remove();
      lastKey = '';
      return;
    }
    const titleEl = titleElement();
    if (!titleEl) return;
    const listing = { title: text(titleEl), ld: products(), snippets: labelled() };
    const key = JSON.stringify([location.pathname, listing]);
    if (!force && key === lastKey && document.getElementById(HOST_ID)) return;
    lastKey = key;
    try {
      const { findings = [] } = await chrome.runtime.sendMessage({ type: 'check', ...listing });
      render(titleEl, findings);
    } catch {
      // The extension was reloaded or updated; this page's copy of the script is orphaned.
    }
  }

  let timer;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 400);
  };
  new MutationObserver((records) => {
    if (records.every((r) => r.target.closest?.(`#${HOST_ID}`) || r.target.id === HOST_ID)) return;
    later();
  }).observe(document.documentElement, { childList: true, subtree: true });
  // A new rate in the popup changes every figure on the panel.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && ('state' in changes || 'customCents' in changes)) scan(true);
  });
  scan();
})();
