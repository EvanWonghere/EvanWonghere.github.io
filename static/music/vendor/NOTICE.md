# ÉTUDE notation dependencies

These files are served locally and loaded only when their feature is used.
The site's original composition UI and playback scheduler are separate modules.

| File | Upstream release / source | License |
| --- | --- | --- |
| `abcjs-6.7.0.min.js` | [abcjs 6.7.0](https://github.com/paulrosen/abcjs), npm `abcjs@6.7.0`, `dist/abcjs-basic-min.js` | MIT, see `abcjs-LICENSE.md` and the adjacent `.LICENSE` file |
| `xml2abc-122.js` | [Willem Vree, revision 122](https://wim.vree.org/js/xml2abc-js_index.html), [original archive](https://wim.vree.org/js/xml2abc-js_122.zip) | GNU LGPL; upstream header does not specify a version. See bundled `LGPL-3.0.txt` and `GPL-3.0.txt` |
| `jquery-3.7.1.min.js` | [jQuery 3.7.1](https://code.jquery.com/jquery-3.7.1.min.js) | MIT, see `jquery-LICENSE.txt` |
| `fflate-0.8.2.mjs` | [fflate 0.8.2](https://github.com/101arrowz/fflate/tree/v0.8.2), npm `fflate@0.8.2`, `esm/browser.js` | MIT, see `fflate-LICENSE.txt` |

All four runtime files are unmodified upstream files (some renamed).
`xml2abc-122.js` is the complete, human-readable source, including its copyright
notice: Copyright (C) 2014–2025 Willem Vree. It is distributed without warranty.
It can be inspected, modified or replaced independently at this path; no bundle
or build step is needed. Modification and reverse engineering for debugging
changes to this LGPL library are permitted. To use a modified version, replace
that file in a local checkout and run `hugo server`. The calling interface is
`vertaal(xmlDocument, options)` in `../creative.mjs`.

SHA-256 of distributed runtime files:

```
b0cde4bc52bb33949181683a245005fff8a024a8c1f07ec6ce3222cd4bd72e51  abcjs-6.7.0.min.js
89abbb941edb6528d3bf3294eaf172203177ed5c6c03e3953c4585d290b16243  xml2abc-122.js
fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a  jquery-3.7.1.min.js
8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7  fflate-0.8.2.mjs
```

## Strudel

Strudel is an external application loaded on demand in a cross-origin iframe
from [strudel.cc](https://strudel.cc/), following its
[official embedding documentation](https://strudel.cc/technical-manual/project-start/).
Its source is [available under AGPL-3.0](https://codeberg.org/uzu/strudel).
No Strudel JavaScript or sound library is redistributed in this repository.
The four short exercise patterns and local draft/library interface are original
site content. The default Beethoven excerpt is transcribed from the public-domain
Mutopia-2011/10/25-295 score; see the repository THIRD_PARTY_NOTICES.md. The embedded editor has its own storage; copy edits back to the
site draft to include them in a site progress backup.
