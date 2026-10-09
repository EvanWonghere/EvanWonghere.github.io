// The archive page: what was practised, words to review, sounds that need work. Rendering is in reader.mjs's DOM helpers;
// the parts that decide something live here as plain functions.
import { splitUnits, tokenize } from './library.mjs';
import { wordKey } from './progress.mjs';

// The sentence (or poem line) of a work where a word occurs, to show it in context. null when it does not occur.
export function findContext(work, key) {
    for (const segment of work.segments) {
        for (const unit of splitUnits(segment.text, work.kind, { byLine: true })) {
            if (tokenize(unit).some(t => t.word && wordKey(t.text) === key)) return unit.replace(/\s*\n\s*/g, ' ');
        }
    }
    return null;
}
// A short line for the first screen: streak, time today and words waiting.
export function summaryLine({ streak, seconds, due }) {
    const parts = [];
    parts.push(streak > 0 ? `连续 ${streak} 天` : '今天开始第一天');
    parts.push(seconds > 0 ? `今天练了 ${Math.max(1, Math.round(seconds / 60))} 分钟` : '今天还没练');
    if (due > 0) parts.push(`${due} 个词等你复习`);
    return parts.join(' · ');
}
