// Listing text is messy: trademark signs, odd dashes, curly quotes,
// non-breaking spaces and the invisible direction marks Amazon puts around
// its "Item model number : ..." labels. Everything is matched against this
// cleaned form.
export function clean(text) {
  return String(text ?? '')
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[®™©]|\((?:r|tm)\)/gi, ' ')
    .replace(/[‐-―−]/g, '-')
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export const lower = (text) => clean(text).toLowerCase();
