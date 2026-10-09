// Styled stand-ins for the browser's own <select> and <audio> widgets. The real elements stay in the page and stay the source of truth,
// so every other module keeps reading and setting `select.value` and calling `audio.play()`; this only draws them.
// Without this script the plain elements still work.

const painters = new Set();
// Call after setting a select's value or disabled state from script: those do not fire an event.
export const refreshControls = () => painters.forEach(paint => paint());

// A select with a handful of options becomes a row of segments.
export function enhanceSelect(select) {
    if (select.dataset.segmented) { refreshControls(); return; }
    select.dataset.segmented = 'yes';
    const group = document.createElement('div');
    group.className = 'segmented'; group.setAttribute('role', 'radiogroup');
    const caption = select.labels?.[0] && [...select.labels[0].childNodes].find(node => node.nodeType === Node.TEXT_NODE)?.textContent.trim();   // the label's own words, not its options
    if (caption) group.setAttribute('aria-label', caption);
    select.after(group);
    select.classList.add('visually-hidden'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    let shown = '';
    const paint = () => {
        const options = [...select.options];
        const signature = options.map(o => `${o.value}\u0000${o.textContent}`).join('\u0001');
        if (signature !== shown) {   // the options changed (the speed list is built when a text opens): draw them again
            shown = signature;
            group.replaceChildren(...options.map(option => {
                const button = document.createElement('button');
                button.type = 'button'; button.setAttribute('role', 'radio'); button.dataset.value = option.value; button.textContent = option.textContent;
                button.onclick = () => { if (select.value === option.value) return; select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); paint(); };
                return button;
            }));
        }
        for (const button of group.children) { button.setAttribute('aria-checked', String(button.dataset.value === select.value)); button.disabled = select.disabled; }
        group.toggleAttribute('aria-disabled', select.disabled);
    };
    select.addEventListener('change', paint);
    painters.add(paint);
    paint();
}

const clock = seconds => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '–:––';

// A play button, a seek bar and the time, driving the audio element. data-duration on the element gives the length to show
// before the file has loaded (a file that is not preloaded does not know it yet).
export function enhanceAudio(audio) {
    if (audio.dataset.enhanced) return;
    audio.dataset.enhanced = 'yes'; audio.controls = false;
    const box = document.createElement('div');
    box.className = 'player';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'toggle';
    const bar = document.createElement('input');
    bar.type = 'range'; bar.min = '0'; bar.max = '1000'; bar.value = '0'; bar.setAttribute('aria-label', '播放进度');
    const time = document.createElement('span');
    time.className = 'time';
    box.append(toggle, bar, time);
    audio.after(box);
    const length = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Number(audio.dataset.duration) || NaN;
    const paint = () => {
        box.hidden = audio.hidden;
        const total = length(), now = audio.currentTime || 0;
        toggle.textContent = audio.paused ? '▶' : '❚❚'; toggle.setAttribute('aria-label', audio.paused ? '播放' : '暂停');
        bar.disabled = !Number.isFinite(total) || !audio.src;
        const part = Number.isFinite(total) ? Math.min(1000, Math.round(now / total * 1000)) : 0;
        bar.value = String(part); bar.style.setProperty('--p', `${part / 10}%`);
        time.textContent = `${clock(now)} / ${clock(total)}`;
        toggle.disabled = !audio.src;
    };
    toggle.onclick = () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
    bar.oninput = () => { const total = length(); if (Number.isFinite(total)) audio.currentTime = Number(bar.value) / 1000 * total; paint(); };
    for (const name of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'emptied', 'seeked']) audio.addEventListener(name, paint);
    new MutationObserver(paint).observe(audio, { attributes: true, attributeFilter: ['hidden', 'src'] });
    paint();
}
