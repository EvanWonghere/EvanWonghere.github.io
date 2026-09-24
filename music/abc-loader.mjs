// Loads the vendored abcjs once for any panel that renders a staff.
let loading = null;
export function loadABC() {
    if (window.ABCJS) return Promise.resolve();
    return loading ||= new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src="/music/vendor/abcjs-6.7.0.min.js"]');
        const tag = existing || document.createElement('script');
        tag.addEventListener('load', resolve, { once: true });
        tag.addEventListener('error', () => { loading = null; reject(new Error('排谱工具未能加载，请检查网络后重试。')); }, { once: true });
        if (!existing) { tag.src = '/music/vendor/abcjs-6.7.0.min.js'; document.head.append(tag); }
    });
}
/** Adds the playing class to abcjs notes whose source range contains one of the given offsets. */
export function highlightStarts(visual, container, starts) {
    container.querySelectorAll('.score-playing').forEach(el => el.classList.remove('score-playing'));
    if (!starts.size) return;
    for (const s of visual?.engraver?.selectables || []) {
        const abc = s.absEl?.abcelem;
        if (abc?.el_type === 'note' && [...starts].some(x => x >= abc.startChar && x < abc.endChar)) for (const el of s.absEl.elemset || []) el.classList.add('score-playing');
    }
}
