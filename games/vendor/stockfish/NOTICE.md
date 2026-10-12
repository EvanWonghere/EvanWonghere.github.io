# Stockfish.js 19 (lite, single-threaded)

The computer player of the chess game (`/games/chess-app/`) is the Stockfish chess engine, in the WebAssembly build made by
Nathan Rugg for Chess.com ([Stockfish.js](https://github.com/nmrugg/stockfish.js)), unmodified.

- Package: `stockfish@19.0.1` on npm, files `bin/stockfish-19-lite-single.js` and `bin/stockfish-19-lite-single.wasm`
- Licence: **GNU General Public License v3** (`Copying.txt` here). Stockfish is a work of the Stockfish developers
  (T. Romstad, M. Costalba, J. Kiiski, G. Linscott and others); this build includes a small network by sscg13.
- Source code of the engine and of this build: <https://github.com/nmrugg/stockfish.js> (tag `v19.0.1`) and
  <https://github.com/official-stockfish/Stockfish>. The network is `nn-61e7af4bb97d`
  (<https://tests.stockfishchess.org/nns?network_name=nn-61e7af4bb97d>).
- Credits and thanks: `README.md` here and the AUTHORS file of the project.

The files were taken from the npm registry tarball of `stockfish@19.0.1` and are byte-for-byte what it contains
(checked with `shasum -a 256` against the tarball the registry serves, which npm verifies against the published integrity hash):

| File | SHA-256 |
| --- | --- |
| `stockfish-19-lite-single.js` | `ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a` |
| `stockfish-19-lite-single.wasm` | `ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de` |

The engine runs in its own Web Worker and talks to the game only through UCI text commands (`chess-app/ai-worker.js`), so it is a
separate program from the rest of this site. If the engine cannot start, the game falls back to its small built-in search.
Do not edit the vendored files; to update the engine, replace both files and the hashes above.
