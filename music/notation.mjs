import { noteName, isBlack } from './core.mjs';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const degree = midi => Math.floor(midi / 12 - 1) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][midi % 12];
export function staff(events, { clef = 'treble', active = -1, label = '五线谱', showNames = false, meter = null } = {}) {
    const grand = clef === 'grand', width = Math.max(440, 120 + events.length * 65), height = grand ? 292 : 172;
    const position=(event,midi)=>{
        const bass=grand?midi<60:clef==='bass',offset=grand&&bass?128:0;
        const parsed=event.spellings?.[midi]?.match(/^([A-G])(♯|♭|𝄫|𝄪)?(-?\d+)$/u);
        const diatonic=parsed?Number(parsed[3])*7+'CDEFGAB'.indexOf(parsed[1]):degree(midi);
        return {bass,offset,diatonic,mark:parsed?parsed[2]||'':isBlack(midi)?'♯':'',y:90+offset-(diatonic-(bass?18:30))*6};
    };
    const positions=events.flatMap(e=>e.notes.map(n=>position(e,n).y));
    const top=Math.max(0,44-Math.min(44,...positions)),bottom=Math.max(0,Math.max(0,...positions)+40-(height-30));
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" class="score" data-clef="${grand?'grand':clef}" style="min-width:${width}px" viewBox="0 ${-top} ${width} ${height+top+bottom}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>`;
    const staves = grand ? ['treble', 'bass'] : [clef];
    staves.forEach((c, i) => {
        const offset = i * 128;
        for (let line = 0; line < 5; line++) svg += `<line x1="20" y1="${42 + line * 12 + offset}" x2="${width - 15}" y2="${42 + line * 12 + offset}" stroke="#72746b" stroke-width="1"/>`;
        svg += `<text x="28" y="${c === 'bass' ? 83 + offset : 87 + offset}" font-size="${c === 'bass' ? 49 : 66}" font-family="Apple Symbols, Noto Music, serif" fill="#262a26">${c === 'bass' ? '𝄢' : '𝄞'}</text>`;
    });
    if (meter) for (let i = 0; i < staves.length; i++) svg += `<text x="72" y="${63 + i * 128}" text-anchor="middle" font-size="23" font-family="serif" fill="#262a26">${meter}</text><text x="72" y="${84 + i * 128}" text-anchor="middle" font-size="23" font-family="serif" fill="#262a26">4</text>`;
    let elapsed = 0; const accidentals = new Map();
    events.forEach((event, index) => {
        const x = 120 + index * 65, beats = event.beats || 1;
        if (index === active) svg += `<rect x="${x - 22}" y="10" width="45" height="${height - 25}" rx="7" fill="#e9bd702e"/>`;
        for (const midi of event.notes) {
            const {bass,offset,diatonic,mark,y}=position(event,midi);
            const key = `${bass}:${diatonic}`;
            const accidental = mark || (accidentals.get(key) ? '♮' : '');
            accidentals.set(key, mark);
            const noteBeats = event.durations?.[midi] ?? beats, bottom = 90 + offset;
            const color = index === active ? '#a9630a' : '#222922';
            for (let ledger = bottom + 12; ledger <= y; ledger += 12) svg += `<line x1="${x - 14}" x2="${x + 14}" y1="${ledger}" y2="${ledger}" stroke="#353b33"/>`;
            for (let ledger = bottom - 60; ledger >= y; ledger -= 12) svg += `<line x1="${x - 14}" x2="${x + 14}" y1="${ledger}" y2="${ledger}" stroke="#353b33"/>`;
            if (accidental) svg += `<text x="${x - 25}" y="${y + 6}" font-size="20" fill="${color}">${accidental}</text>`;
            svg += `<ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" transform="rotate(-18 ${x} ${y})" fill="${noteBeats >= 2 ? '#f4f1e9' : color}" stroke="${color}" stroke-width="2"/>`;
            const down = y < bottom - 24;
            if (noteBeats < 4) {
                const stemX = x + (down ? -7 : 7), stemY = y + (down ? 31 : -31);
                svg += `<line x1="${stemX}" y1="${y}" x2="${stemX}" y2="${stemY}" stroke="${color}" stroke-width="1.6"/>`;
                if (noteBeats < 1) svg += `<path d="M${stemX} ${stemY} q18 ${down ? -6 : 6} 7 ${down ? -21 : 21}" fill="none" stroke="${color}" stroke-width="2"/>`;
            }
            if (noteBeats === 1.5 || noteBeats === 3) svg += `<circle cx="${x + 16}" cy="${y - 3}" r="2.5" fill="${color}"/>`;
        }
        if (!event.notes.length) svg += `<text x="${x}" y="72" text-anchor="middle" font-family="serif" font-size="${event.sustain ? 12 : 27}" fill="#353b33">${event.sustain ? '保持' : beats >= 4 ? '𝄻' : beats >= 2 ? '𝄼' : beats < 1 ? '𝄾' : '𝄽'}</text>`;
        elapsed += beats;
        if (meter && elapsed % meter === 0) accidentals.clear();
        if (meter && elapsed % meter === 0) for (let i = 0; i < staves.length; i++) svg += `<line x1="${x + 30}" x2="${x + 30}" y1="${42 + i * 128}" y2="${90 + i * 128}" stroke="#43473e"/>`;
        svg += `<text x="${x}" y="${height + bottom - 15}" text-anchor="middle" font-size="12" fill="#616454">${showNames ? escape(event.notes.map(n => event.spellings?.[n] || noteName(n)).join('/')) : `${beats}拍`}</text>`;
    });
    return svg + '</svg>';
}
