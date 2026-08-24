# Third-party notices

The arcade is implemented locally and does not load third-party code, fonts,
art, audio, dictionaries, or APIs at runtime.

## Bundled rule engines

### sudoku.js

- Project: https://github.com/robatron/sudoku.js
- Commit: `4362a13510925f03a2f749b4657a8e4c5f36a869`
- Bundled files: `static/games/vendor/sudoku.js/`
- License: MIT

### chess.js

- Project: https://github.com/jhlywa/chess.js
- Commit: `d43e6683efeefbd07f8c53e8e7a47c62cf612439`
- Bundled files: `static/games/vendor/chess.js/`
- Version: 1.4.0
- License: BSD-2-Clause

The browser ESM file was built from the cited source commit. Build-only npm
dependencies are not shipped with the site.

### xiangqi.js

- Project: https://github.com/lengyanyu258/xiangqi.js
- Commit: `f9019ac2303d4b80ef0b82fd0515bfb55a80a62b`
- Bundled files: `static/games/vendor/xiangqi.js/`
- License: BSD-2-Clause

Each vendor directory contains the corresponding upstream license text.

## Bundled data

### SCOWL / English Speller Database word list

- Project: https://github.com/en-wl/wordlist
- Bundled file: `static/games/wordle-app/words.txt`
- Source snapshot: LibreOffice `en_US` Hunspell dictionary, version 2020.12.07
- Use: local accepted-guess dictionary for Hive Words and Typing Rain

Copyright 2000-2018 Kevin Atkinson and contributors.

Permission to use, copy, modify, distribute and sell these word lists, the
associated scripts, the output created from the scripts, and its documentation
for any purpose is granted without fee, provided that the copyright and
permission notices appear in copies and supporting documentation. The material
is provided as-is without warranty.

The SCOWL distribution also incorporates permissively licensed and public
domain sources. See the upstream `Copyright` file for the complete notices.

## Implementation references

These projects were consulted for expected behavior and test cases. Their source
code and assets are not copied into this repository.

- Chromium dinosaur runner extraction — BSD-3-Clause:
  https://github.com/wayou/t-rex-runner
- Flappy Bird vanilla implementation — MIT:
  https://github.com/pyforgedev/flappy-bird
- 2048 — MIT:
  https://github.com/gabrielecirulli/2048
- Breakout Roguelite — Apache-2.0; physics and state-machine architecture reference only:
  https://github.com/foslock/breakout-roguelite
- JavaScript Breakout; classic game-state and control reference only:
  https://github.com/jakesgordon/javascript-breakout
- Nonogram — MIT:
  https://github.com/monkeyArms/nonogram
- Nonopelagram — MIT; difficulty-pool and mobile interaction reference only:
  https://github.com/StefanDucharme/nonogram-archipelago
- JSMinesweeper — MIT:
  https://github.com/DavidNHill/JSMinesweeper

All newly drawn arcade graphics in this repository are original Canvas/CSS
artwork unless a game-specific notice states otherwise.
