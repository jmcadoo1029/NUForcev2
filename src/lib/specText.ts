// Cleanup for imported (Salesforce) specifications & notes, which arrive as one
// giant unformatted blob, often with encoding artifacts (a "°" that came through
// as "Â°" or the replacement char "�"). This is non-destructive display/seed
// formatting — it doesn't change stored data unless the quote is later saved.
//
// Two passes:
//   fixEncoding      — repair common UTF-8-mangled-as-CP1252 sequences (mojibake).
//   sentencesPerLine — put each sentence on its own line so a later manual edit is
//                      manageable (heuristic; guards list markers, initials, and
//                      common abbreviations so it doesn't over-split).
//
// Mojibake keys are written as \u escapes so the source encoding can't corrupt
// them. Add more pairs here as real examples surface.

const MOJIBAKE: [string, string][] = [
  ['Â°', '°'], // Â° -> °
  ['Â±', '±'], // ±
  ['Âµ', 'µ'], // µ
  ['Â²', '²'], // ²
  ['Â³', '³'], // ³
  ['Â½', '½'], // ½
  ['Â¼', '¼'], // ¼
  ['Â¾', '¾'], // ¾
  ['Â®', '®'], // ®
  ['Â©', '©'], // ©
  ['Â ', ' '],      // non-breaking space mojibake -> space
  ['â€™', '’'], // ’ right single quote
  ['â€˜', '‘'], // ‘ left single quote
  ['â€œ', '“'], // “ left double quote
  ['â€', '”'], // ” right double quote
  ['â€”', '—'], // — em dash
  ['â€“', '–'], // – en dash
  ['â€¦', '…'], // … ellipsis
  ['â€¢', '•'], // • bullet
  ['Ã·', '÷'],       // ÷
]

export function fixEncoding(text: string): string {
  let s = text || ''
  for (const [bad, good] of MOJIBAKE) s = s.split(bad).join(good)
  // A number followed by the replacement char before C/F is almost always a
  // dropped degree sign (e.g. "125�C" -> "125°C").
  s = s.replace(/(\d)\s*�\s*(?=[CF])/g, '$1°')
  // Any remaining replacement chars are unrecoverable noise — drop them.
  s = s.replace(/�/g, '')
  // Convert leftover non-breaking spaces to normal spaces.
  s = s.replace(/ /g, ' ')
  return s
}

const ABBR = new Set(['no', 'nos', 'fig', 'figs', 'approx', 'vs', 'ref', 'rev', 'sec', 'etc', 'std', 'mil', 'dept', 'inc', 'co', 'ltd', 'dr', 'mr', 'mrs', 'ms', 'vol', 'pg', 'pp', 'e.g', 'i.e', 'min', 'max', 'temp', 'spec', 'para'])

function isGuarded(word: string): boolean {
  if (/^\d+\.$/.test(word)) return true // list marker "5."
  if (/^[A-Za-z]\.$/.test(word)) return true // single-letter initial "J."
  const w = word.replace(/\.$/, '').toLowerCase()
  return ABBR.has(w)
}

export function sentencesPerLine(text: string): string {
  return (text || '')
    .split('\n')
    .map((line) =>
      line.replace(/([.!?])[ \t]+(?=[A-Z0-9(])/g, (m: string, punct: string, offset: number, full: string) => {
        const lastWord = (full.slice(0, offset + 1).match(/(\S+)$/) || ['', ''])[1]
        return isGuarded(lastWord) ? m : punct + '\n'
      }),
    )
    .join('\n')
}

/** Fix encoding always; split into sentences only when asked (imported quotes). */
export function cleanSpecText(text: string, split = false): string {
  const fixed = fixEncoding(text || '')
  return split ? sentencesPerLine(fixed) : fixed
}
