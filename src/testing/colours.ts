/**
 * The "no hard-coded colours" rule, ported from spikes 14, 17 and 19 in its strengthened form.
 *
 * Every colour must come from a token, so dark mode, an app's brand hue and the contrast check
 * cover every colour actually on screen. A design may write colour literals only in the files it
 * declares as its token files. The rule fails on:
 * - hex colours (`#fff`, `#3366ff80`);
 * - colour functions in any case (`rgb`, `hsl`, `hwb`, `oklch`, `oklab`, `lab`, `lch`, `color`,
 *   `color-mix`, `device-cmyk`);
 * - any utility ending in a Tailwind palette colour or black/white (`bg-red-500`,
 *   `inset-shadow-red-500`, `hover:text-white`);
 * - arbitrary colour values (`bg-[#fff]`, `text-[color:tomato]`);
 * - the 148 CSS named colours used as values (`color: 'red'`, `fill="white"`, `1px solid crimson`,
 *   `color: red;`).
 *
 * Allowed: `var(--sv-…)`, `currentColor`, `transparent`, and words that merely contain a colour
 * name (`whitespace-nowrap`, `aria-label="Redo"`).
 *
 * @module
 */

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe'

/** Every CSS named colour (CSS Color 4), except `transparent` and `currentColor`. */
const NAMED = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
].join('|')

/** Every hard-coded colour form, each with a friendly name for the failure message. */
const RULES: readonly (readonly [name: string, pattern: RegExp])[] = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b(?![\w-])/g],
  ['colour function', /\b(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix|device-cmyk)\(/gi],
  [
    'Tailwind palette class',
    new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*[a-z][\w-]*-(?:${PALETTE})-\d{2,3}\b`, 'g'),
  ],
  ['black/white class', /(?<![\w-])(?:[\w-]+:)*[a-z][\w-]*-(?:black|white)\b(?!-)/g],
  [
    'arbitrary colour value',
    /-\[(?:color:)?(?:#|rgba?\(|hsla?\(|hwb\(|oklch\(|oklab\(|lab\(|lch\(|color\()/gi,
  ],
  ['arbitrary named colour', new RegExp(String.raw`-\[(?:color:)?(?:${NAMED})\]`, 'gi')],
  ['named colour', new RegExp(String.raw`(['"\x60])\s*(?:${NAMED})\s*\1`, 'gi')],
  [
    'named colour',
    new RegExp(
      String.raw`\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset)\s+(?:${NAMED})\b`,
      'gi',
    ),
  ],
  ['named colour', new RegExp(String.raw`[\w-]:\s*(?:${NAMED})\s*[;}!]`, 'gi')],
]

/**
 * Every hard-coded colour in one source text, as `file:line: rule "match"` lines.
 *
 * @example
 * findHardCodedColours('x.css', '.a{color:#fff}') // ['x.css:1: hex colour "#fff"']
 */
export function findHardCodedColours(file: string, source: string): string[] {
  const found: string[] = []
  for (const [name, pattern] of RULES) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length
      found.push(`${file}:${line}: ${name} "${match[0]}"`)
    }
  }
  return found
}
