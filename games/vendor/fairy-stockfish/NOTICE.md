# Fairy-Stockfish (WebAssembly)

The computer player of the xiangqi game (`/games/xiangqi-app/`) is Fairy-Stockfish, in the WebAssembly build made by Fabian Fichter
([fairy-stockfish.wasm](https://github.com/fairy-stockfish/fairy-stockfish.wasm)), unmodified.

- Package: `fairy-stockfish-nnue.wasm@1.1.12` on npm, files `stockfish.js`, `stockfish.wasm`, `stockfish.worker.js`
- Licence: **GNU General Public License v3** (`Copying.txt` here, authors in `AUTHORS`). Fairy-Stockfish is a work of
  Fabian Fichter and contributors, based on Stockfish by T. Romstad, M. Costalba, J. Kiiski, G. Linscott and others.
- Source code: <https://github.com/fairy-stockfish/fairy-stockfish.wasm> and <https://github.com/fairy-stockfish/Fairy-Stockfish>.
- The game plays the built-in `xiangqi` variant with the engine's own hand-written evaluation (no network file is shipped).

The files are what the npm registry serves for that version (npm checks the tarball against the published integrity hash):

| File | SHA-256 |
| --- | --- |
| `stockfish.js` | `9080a62e3133e50da0c47b88b186d9c29ed37cc5129401bdeed8bffb5b9a4ca9` |
| `stockfish.wasm` | `7cea742b8ca1a324fbc500f89112f168134cf68eb49475df23be6c42336255c6` |
| `stockfish.worker.js` | `067be484ac62f728b0dad28496997e5862f3c61f9091f59bb35d9d1b1ed14573` |

This build uses threads, so it needs a cross-origin isolated page. GitHub Pages cannot send the headers, so the page registers
`/games/coi-sw.js`, a small service worker (scope `/games/`) that adds them; where that is not possible (Safari, a blocked service
worker) the game falls back to its small built-in search. The engine runs in workers of its own and talks to the game only through
UCI text commands (`xiangqi-app/ai-worker.js`, `xiangqi-app/fairy-host.js`), so it is a separate program from the rest of this site.
Do not edit the vendored files; to update the engine, replace the three files and the hashes above.
