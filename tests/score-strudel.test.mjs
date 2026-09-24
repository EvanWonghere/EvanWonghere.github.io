import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreKey, scoreToStrudel, totalBeatsFromAudio, tracksFromAudio } from '../static/music/score-strudel.mjs';
import { parseStrudel, parsedScore } from '../static/music/strudel-parse.mjs';
import { compileABC } from '../static/music/arrange-abc.mjs';

test('key and mode come from the K: line', () => {
    assert.deepEqual(scoreKey('X:1\nK:G\n'), { key: 'G', mode: 'major' });
    assert.deepEqual(scoreKey('X:1\nK:Bbm\n'), { key: 'B♭', mode: 'minor' });
    assert.deepEqual(scoreKey('X:1\nK:F#min\n'), { key: 'F♯', mode: 'minor' });
    assert.deepEqual(scoreKey('no key'), { key: 'C', mode: 'major' });
});

test('abcjs audio tracks become voices in quarter-note beats; percussion and invalid notes are dropped', () => {
    const tracks = tracksFromAudio({ tracks: [
        [{ cmd: 'program' }, { cmd: 'note', pitch: 60, start: 0, duration: 0.25 }, { cmd: 'note', pitch: 62, start: 0.25, duration: 0.125 }],
        [{ cmd: 'note', pitch: 36, start: 0, duration: 0.5, instrument: 128 }],
        [{ cmd: 'note', pitch: 48, start: 0, duration: 1 }, { cmd: 'note', pitch: 200, start: 0, duration: 1 }]
    ] });
    assert.deepEqual(tracks, [[{ pitch: 60, start: 0, beats: 1 }, { pitch: 62, start: 1, beats: 0.5 }], [{ pitch: 48, start: 0, beats: 4 }]]);
});

test('score → Strudel keeps every note, one cycle per bar, and round-trips through the parser', () => {
    const melody = [60, 62, 64, 65, 67, 65, 64, 62].map((pitch, i) => ({ pitch, start: i, beats: 1 }));
    const bass = [{ pitch: 48, start: 0, beats: 4 }, { pitch: 43, start: 4, beats: 4 }];
    const { code, offGrid, bars } = scoreToStrudel({ tracks: [melody, bass], tempo: 96, meter: { num: 4, den: 4 }, title: '测试', key: 'C', mode: 'major' });
    assert.equal(offGrid, 0); assert.equal(bars, 2);
    assert.match(code, /setcpm\(24\)/); assert.match(code, /声部 1/); assert.match(code, /声部 2/);
    const parsed = parseStrudel(code);
    assert.deepEqual(parsed.warnings, []); assert.equal(parsed.cycles, 2);
    const pitches = parsed.voices.flatMap(v => v.events.map(e => e.pitch)).sort((a, b) => a - b);
    assert.deepEqual(pitches, [...melody, ...bass].map(n => n.pitch).sort((a, b) => a - b));
    // …and back to ABC through the live page's own route.
    const score = parsedScore(parsed, { meter: '4/4', title: '测试' });
    assert.match(compileABC(score.real, score.doc, { mode: 'score' }).abc, /^X:1/m);
});

test('3/4 and 6/8 meters set the bar length; triplets are counted as moved', () => {
    assert.equal(scoreToStrudel({ tracks: [[{ pitch: 67, start: 0, beats: 3 }, { pitch: 69, start: 3, beats: 3 }]], meter: { num: 3, den: 4 } }).bars, 2);
    assert.match(scoreToStrudel({ tracks: [[{ pitch: 67, start: 0, beats: 1.5 }]], meter: { num: 6, den: 8 } }).code, /6\/8/);
    const trip = [0, 1 / 3, 2 / 3].map((start, i) => ({ pitch: 60 + i, start, beats: 1 / 3 }));
    assert.equal(scoreToStrudel({ tracks: [trip] }).offGrid, 3);
});

test('notes held across a barline keep sounding in the next bar; trailing rests keep the loop length', () => {
    const held = scoreToStrudel({ tracks: [[{ pitch: 60, start: 3, beats: 2 }, { pitch: 64, start: 5, beats: 3 }]] });
    const events = parseStrudel(held.code).voices[0].events.map(e => [e.pitch, e.time, e.dur]);
    assert.deepEqual(events, [[60, 0.75, 0.25], [60, 1, 0.25], [64, 1.25, 0.75]], 'C4 sounds from beat 4 of bar 1 through beat 1 of bar 2');
    assert.equal(totalBeatsFromAudio({ totalDuration: 2 }), 8);
    const rests = scoreToStrudel({ tracks: [[{ pitch: 60, start: 0, beats: 1 }]], totalBeats: 8 });
    assert.equal(rests.bars, 2); assert.equal(parseStrudel(rests.code).cycles, 2);
});
