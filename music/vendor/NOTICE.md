# ÉTUDE notation dependencies

These files are served locally and loaded only when their feature is used.
The site's original composition UI and playback scheduler are separate modules.

| File | Upstream release / source | License |
| --- | --- | --- |
| `abcjs-6.7.0.min.js` | [abcjs 6.7.0](https://github.com/paulrosen/abcjs), npm `abcjs@6.7.0`, `dist/abcjs-basic-min.js` | MIT, see `abcjs-LICENSE.md` and the adjacent `.LICENSE` file |
| `xml2abc-122.js` | [Willem Vree, revision 122](https://wim.vree.org/js/xml2abc-js_index.html), [original archive](https://wim.vree.org/js/xml2abc-js_122.zip) | GNU LGPL; upstream header does not specify a version. See bundled `LGPL-3.0.txt` and `GPL-3.0.txt` |
| `jquery-3.7.1.min.js` | [jQuery 3.7.1](https://code.jquery.com/jquery-3.7.1.min.js) | MIT, see `jquery-LICENSE.txt` |
| `fflate-0.8.2.mjs` | [fflate 0.8.2](https://github.com/101arrowz/fflate/tree/v0.8.2), npm `fflate@0.8.2`, `esm/browser.js` | MIT, see `fflate-LICENSE.txt` |
| `supabase-js-2.112.4.mjs` | [supabase-js 2.112.4](https://github.com/supabase/supabase-js), npm `@supabase/supabase-js@2.112.4` with its bundled dependencies (see below) | MIT (tslib: 0BSD), see `supabase-js-LICENSES.txt` |

The first four runtime files are unmodified upstream files (some renamed).
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
d8290c68c5362ccdbef284b89c0595f129e5153b4be6c78a9d77537a43c15003  supabase-js-2.112.4.mjs
```

## supabase-js (administrator AI only)

`supabase-js-2.112.4.mjs` is loaded only by `../ai.mjs`, and only when the AI
assistant is enabled and a visitor signs in or already has a session. Anonymous
practice never loads it. It is a single-file ES module bundle of the unmodified
npm packages `@supabase/supabase-js`, `@supabase/auth-js`, `@supabase/functions-js`,
`@supabase/postgrest-js`, `@supabase/realtime-js`, `@supabase/storage-js`
(all 2.112.4), `@supabase/phoenix` 0.4.5, `iceberg-js` 0.8.1 and `tslib` 2.8.1,
the same version the Interview Question Bank uses. Their licence texts are in
`supabase-js-LICENSES.txt`. Rebuild with esbuild 0.28.2 from an install of
`@supabase/supabase-js@2.112.4`:

```sh
echo "export { createClient } from '@supabase/supabase-js';" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2020 \
  --minify --legal-comments=eof --outfile=supabase-js-2.112.4.mjs
```

## Strudel

Two ways to use Strudel, both separate from the practice room's own code:

1. **strudel.cc** in a cross-origin iframe or a new tab, following its
   [official embedding documentation](https://strudel.cc/technical-manual/project-start/).
2. **The in-site sandbox.** `strudel-web-1.3.0.js` is the unmodified file
   `dist/index.js` of npm `@strudel/web@1.3.0` (Strudel, AGPL-3.0-or-later,
   source at [codeberg.org/uzu/strudel](https://codeberg.org/uzu/strudel)). It
   bundles further AGPL-3.0-or-later packages (`@strudel/*`, `superdough`,
   `supradough`, `@kabelsalat/*`) and permissively licensed ones; every package
   and licence text is listed in `strudel-LICENSES.txt`.

   The file is never loaded as a script of this site. `../strudel-sandbox.mjs`
   reads it as text and runs it, together with `../strudel-runtime.js`, inside an
   `<iframe sandbox="allow-scripts">` document. That document has an opaque
   origin, cannot read this site's storage or login session, and talks to the
   page only through `postMessage` (code in, note events out). Its Content
   Security Policy allows no network access unless the visitor switches on
   online samples, which then may load only from `raw.githubusercontent.com`.

   Corresponding source: the npm package `@strudel/web@1.3.0` and the tagged
   source on Codeberg. To check or rebuild:

   ```sh
   npm pack @strudel/web@1.3.0 && tar xzf strudel-web-1.3.0.tgz
   sha256sum package/dist/index.js   # equals the hash below
   ```

   The four example patterns and the page's own code are original site content.
   The default Beethoven excerpt is transcribed from the public-domain
   Mutopia-2011/10/25-295 score; see the repository THIRD_PARTY_NOTICES.md. The
   strudel.cc editor has its own storage; copy edits back to the site draft to
   include them in a site progress backup.

   SHA-256:

   ```
   265cae9cf769a7dc2c1ac253784fce80fef5062db9a1aac5be7fa5f205af5e86  strudel-web-1.3.0.js
   ```
