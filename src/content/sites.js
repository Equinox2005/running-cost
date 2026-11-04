// Where the product title is on each store, and which paths are product
// pages. The model number itself is found from the page's product data and
// its "Model #" style labels, which works the same way on every store.
globalThis.RUNNING_COST_SITES = [
  { name: 'Amazon', host: /(^|\.)amazon\.(com|ca)$/, page: /\/(dp|gp\/product|gp\/aw\/d)\/[A-Z0-9]{10}/, title: ['#productTitle', '#title'] },
  { name: 'Home Depot', host: /(^|\.)homedepot\.(com|ca)$/, page: /^\/(p|product)\//, title: ['h1'] },
  { name: "Lowe's", host: /(^|\.)lowes\.com$/, page: /^\/pd\//, title: ['h1'] },
  { name: 'Best Buy', host: /(^|\.)bestbuy\.(com|ca)$/, page: /^\/site\/[^/]+\/\d+\.p$|^\/product\/|^\/en-ca\/product\//, title: ['.sku-title h1', 'h1'] },
  { name: 'Walmart', host: /(^|\.)walmart\.(com|ca)$/, page: /\/ip\//, title: ['h1#main-title', 'h1[itemprop="name"]', 'h1'] },
  { name: 'Costco', host: /(^|\.)costco\.(com|ca)$/, page: /\.product\.\d+\.html$|^\/p\//, title: ['h1'] },
  { name: 'Target', host: /(^|\.)target\.com$/, page: /^\/p\//, title: ['h1[data-test="product-title"]', 'h1'] },
  { name: 'Wayfair', host: /(^|\.)wayfair\.(com|ca)$/, page: /\/pdp\//, title: ['h1'] },
  { name: 'AJ Madison', host: /(^|\.)ajmadison\.com$/, page: /^\/cgi-bin\/ajmadison\/[^/]+\.html$/, title: ['h1'] },
  { name: 'Abt', host: /(^|\.)abt\.com$/, page: /\/p\/\d+\.html$/, title: ['h1'] },
];
