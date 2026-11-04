// Stand-in store pages. They copy only what the content script reads (the
// URL shape, the title element, product data and spec labels), not any
// store's look. Model numbers come from the shipped data, so the pages keep
// working when ENERGY STAR's list changes.
const shell = (title, body, head = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}
<style>
  body { font: 15px/1.5 Georgia, serif; color: #222; margin: 0; background: #fafafa; }
  main { max-width: 860px; margin: 0 auto; padding: 28px 32px; display: grid; grid-template-columns: 260px 1fr; gap: 28px; }
  .photo { background: #e8e8e8; border-radius: 4px; aspect-ratio: 1; display: grid; place-items: center; color: #888; font: 13px system-ui; }
  h1, #productTitle { font: 600 22px/1.3 system-ui, sans-serif; margin: 0; display: block; }
  .ids { font: 13px system-ui; color: #555; margin-top: 6px; display: flex; gap: 14px; }
  .price { font: 600 20px system-ui; margin: 12px 0; }
  table { border-collapse: collapse; font: 14px system-ui; margin-top: 12px; }
  th, td { padding: 4px 14px 4px 0; border-bottom: 1px solid #e3e3e3; text-align: left; font-weight: normal; }
  .spec { display: flex; gap: 12px; font: 14px system-ui; border-bottom: 1px solid #e3e3e3; padding: 4px 0; }
</style></head>
<body><main>${body}</main></body></html>`;

const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

// A store's version of an ENERGY STAR family: each wildcard becomes a colour letter.
export const storeModel = (pattern) => pattern.replace(/[*#?]/g, 'S');

export function buildPages({ fridge, tv, dryer }) {
  const fridgeModel = storeModel(fridge[3]);
  const dryerModel = storeModel(dryer[3]);
  return {
    'www.homedepot.com/p/fridge/320014533': shell(
      'Refrigerator',
      `<div class="photo">photo</div>
       <div><h1>${fridge[2]} ${fridge[6]} cu. ft. Refrigerator in Stainless Steel</h1>
         <div class="ids"><span>Internet #320014533</span><span><span>Model # </span><span>${fridgeModel}</span></span><span>Store SKU #1001234567</span></div>
         <div class="price">$1,298.00</div>
         <div class="spec"><span>Color/Finish</span><span>Stainless Steel</span></div>
       </div>`,
      jsonLd({ '@context': 'https://schema.org', '@type': 'Product', name: 'Refrigerator', brand: { '@type': 'Brand', name: fridge[2] }, sku: '320014533' }),
    ),
    'www.bestbuy.com/site/oled-tv/6578123.p': shell(
      'TV',
      `<div class="photo">photo</div>
       <div><div class="sku-title"><h1>${tv[2]} ${Math.round(tv[6])}" Class OLED 4K UHD Smart TV</h1></div>
         <div class="ids"><span>SKU: 6578123</span></div>
         <div class="price">$1,799.99</div></div>`,
      jsonLd({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', name: 'TV' }, { '@type': 'Product', name: 'TV', gtin13: `0${tv[4].split(' ')[0]}`, brand: { name: tv[2] } }] }),
    ),
    'www.amazon.com/dp/B0TESTDRY1': shell(
      'Dryer',
      `<div class="photo">photo</div>
       <div><div id="titleSection"><span id="productTitle">${dryer[2]} ${dryer[6]} cu. ft. Electric Dryer with Wrinkle Shield</span></div>
         <div class="price">$849.00</div>
         <table id="productDetails_techSpec_section_1">
           <tr><th>Brand</th><td>${dryer[2]}</td></tr>
           <tr><th>Item model number</th><td>‎${dryerModel}</td></tr>
           <tr><th>Capacity</th><td>${dryer[6]} Cubic Feet</td></tr>
         </table></div>`,
    ),
    'www.lowes.com/pd/fridge/5013456789': shell(
      'Refrigerator',
      `<div class="photo">photo</div>
       <div><h1>Nordvik 18-cu ft Top-Freezer Refrigerator (White)</h1>
         <div class="ids"><span>Item #5013456789</span><span>Model #NV18TFW</span></div>
         <div class="price">$649.00</div>
         <div class="spec"><span>Annual Energy Consumption (kWh/year)</span><span>650</span></div>
         <div class="spec"><span>Capacity (cu. feet)</span><span>18</span></div></div>`,
    ),
    'www.walmart.com/ip/Space-Heater/552020': shell(
      'Space heater',
      `<div class="photo">photo</div><div id="slot"><div class="price">Loading...</div></div>
       <script>
         // Like a store that renders after load: the title shows up late.
         setTimeout(() => {
           document.getElementById('slot').innerHTML =
             '<h1 id="main-title">Ceramic Space Heater, 1500W/750W Portable Electric Heater with Thermostat</h1><div class="price">$39.99</div>';
         }, 700);
       </script>`,
    ),
    'www.homedepot.com/s/refrigerator': shell(
      'Search',
      `<div><h1>Refrigerators</h1></div><div><div>${fridge[2]} refrigerator</div><div>Model# ${fridgeModel}</div></div>`,
    ),
  };
}
