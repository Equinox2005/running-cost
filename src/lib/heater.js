import { clean } from './text.js';
import { cents, money, rateWhere } from './cost.js';

// Electric space heaters aren't ENERGY STAR products, but their listings
// state the wattage, and a heater draws close to its rating on high.
const HEATER = /\bheaters?\b/i;
const NOT_ELECTRIC_SPACE_HEATER =
  /\b(water|pool|spa|tank|engine|block|aquarium|fish|reptile|terrarium|incubator|propane|kerosene|gas|diesel|wood|pellet|oil burner|car|truck|rv)\s+heaters?\b|\bheaters?\s+(core|hose|element|parts?|motor|control board|thermostat|replacement|cover|guard|stand|mount|bracket|switch|knob|filter)\b|\b(for|compatible with|replacement for|fits)\s+(\S+\s+){0,4}heaters?\b|\bmr\.? heater\b|\bbuddy\b/i;
const PAIR = /(\d{3,4})\s*\/\s*(\d{3,4})\s*-?\s*(?:w|watts?)\b/gi;
const SINGLE = /(\d{1,2},\d{3}|\d{3,4})\s*-?\s*(?:w|watts?)\b/gi;

export function wattages(text) {
  const found = new Set();
  for (const m of text.matchAll(PAIR)) [m[1], m[2]].forEach((w) => found.add(Number(w)));
  for (const m of text.matchAll(SINGLE)) found.add(Number(m[1].replace(',', '')));
  return [...found].filter((w) => w >= 200 && w <= 5000).sort((a, b) => b - a);
}

const perHourText = (c) => (c >= 100 ? money(c / 100) : `${Math.round(c)}¢`);

export function heaterFinding(listing, rate) {
  const title = clean(listing.title);
  if (!HEATER.test(title) || NOT_ELECTRIC_SPACE_HEATER.test(title)) return null;
  const [high, low] = wattages(title);
  if (!high) return null;
  const perHour = (high / 1000) * rate.cents;
  const month = (hours) => money((perHour * hours * 30) / 100);
  const body = [
    `At ${cents(rate.cents)} per kWh (${rateWhere(rate)}), drawing ${high.toLocaleString('en-US')} W costs about ${perHourText(perHour)} an hour.`,
    `8 hours a day comes to about ${month(8)} a month. 4 hours: ${month(4)}. 12 hours: ${month(12)}.`,
  ];
  if (low) body.push(`On its ${low.toLocaleString('en-US')} W setting it costs about ${perHourText((low / 1000) * rate.cents)} an hour.`);
  body.push('Its thermostat switches it off once the room is warm, so real use is often lower than this.');
  return {
    status: 'none',
    headline: `About ${perHourText(perHour)} an hour on high`,
    model: `${high.toLocaleString('en-US')} W heater`,
    body,
    source: { label: 'EIA electricity prices', url: rate.source },
    badge: perHourText(perHour),
  };
}
