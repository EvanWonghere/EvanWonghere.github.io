// The two translations between this game's rules library (xiangqi.js) and Fairy-Stockfish's UCI. Plain script, so that both the
// classic worker (importScripts) and the tests (require) can load it.
(function (root) {
    // The rules library writes "r" for the side to move when it is Red; Fairy-Stockfish writes "w".
    function toEngineFen(fen) { return fen.replace(/^(\S+)\s+r\s/, '$1 w '); }
    // Fairy-Stockfish numbers the ranks 1-10 from Red's side; the rules library numbers them 0-9 ("h2" there is "h3" here).
    // Returns { from, to } in the library's squares, or null when the line is not a move ("bestmove (none)").
    function fromEngineMove(line) {
        const match = /^bestmove\s+([a-i])(10|[1-9])([a-i])(10|[1-9])/.exec(line);
        return match ? { from: match[1] + (Number(match[2]) - 1), to: match[3] + (Number(match[4]) - 1) } : null;
    }
    const api = { toEngineFen, fromEngineMove };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.UciGlue = api;
})(typeof self !== 'undefined' ? self : this);
