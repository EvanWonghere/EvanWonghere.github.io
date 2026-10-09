// The learner's archive in localStorage. Every change re-reads the stored value first, so two open tabs cannot lose each other's work,
// and nothing is written over data this page cannot read.
import { PROGRESS_KEY, loadProgress, saveProgress } from './progress.mjs';

export function createLearner(storage) {
    return {
        read: () => loadProgress(storage).progress,
        // The stored text exactly as it is, even when this page cannot read it, so a backup never comes out empty.
        raw() { try { return storage.getItem(PROGRESS_KEY); } catch { return null; } },
        // false when the stored archive is damaged or from a newer version: it is kept as it is.
        writable: () => loadProgress(storage).writable,
        update(change) {
            const { progress, writable } = loadProgress(storage);
            if (!writable) return false;
            try { change(progress); saveProgress(storage, progress); return true; } catch { return false; }
        },
    };
}
// localStorage can throw on access (blocked site data); then the archive stays empty, and writable() says it cannot be saved.
export function browserStorage() {
    try { return globalThis.localStorage ?? null; } catch { return null; }
}
export const noStorage = { getItem: () => { throw new Error('storage unavailable'); }, setItem: () => { throw new Error('storage unavailable'); } };
