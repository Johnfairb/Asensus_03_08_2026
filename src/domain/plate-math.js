/**
 * Barbell plate combinations (per side), preferring warmup plates
 * and never stacking equal plates unless they are 20 kg or 25 kg.
 * No previous load → prefer 25s. Previous load used a 20 → keep 20s
 * (so 100 kg is 20|20 instead of 25|15).
 */
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];

function nearly(a, b) {
    return Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.02;
}

export function platesForSide(sideKg) {
    const target = Math.round((Number(sideKg) || 0) * 100) / 100;
    if (!(target > 0)) return [];
    const found = [];
    const walk = (remain, startIdx, acc) => {
        if (nearly(remain, 0)) {
            found.push(acc.slice());
            return;
        }
        if (remain < 1.24) return;
        for (let i = startIdx; i < PLATE_SIZES.length; i++) {
            const p = PLATE_SIZES[i];
            if (remain + 0.01 < p) continue;
            acc.push(p);
            if (isValidPlateStack(acc)) walk(Math.round((remain - p) * 100) / 100, i, acc);
            acc.pop();
        }
    };
    walk(target, 0, []);
    return found;
}

/** First plate can be doubled only when it is 20 or 25; other sizes must drop after the first. */
export function isValidPlateStack(plates) {
    const list = Array.isArray(plates) ? plates : [];
    if (!list.length) return true;
    const first = Number(list[0]);
    const allowPair = first === 20 || first === 25;
    const counts = new Map();
    for (let i = 0; i < list.length; i++) {
        const p = Number(list[i]);
        if (!(p > 0)) return false;
        if (i > 0) {
            if (allowPair) {
                if (p > first) return false;
            } else if (p >= first) {
                return false;
            }
        }
        counts.set(p, (counts.get(p) || 0) + 1);
    }
    for (const [p, n] of counts) {
        if (p !== 20 && p !== 25 && n > 1) return false;
    }
    return true;
}

function scoreCombo(combo, prefer) {
    const pref = (prefer || []).slice();
    let kept = 0;
    combo.forEach((p) => {
        const i = pref.indexOf(p);
        if (i >= 0) {
            kept += 1;
            pref.splice(i, 1);
        }
    });
    const preferHas20 = (prefer || []).includes(20);
    const twentyCount = combo.filter((p) => p === 20).length;
    return { kept, removed: pref.length, count: combo.length, first: combo[0] || 0, preferHas20, twentyCount };
}

export function choosePlatesForSide(sideKg, preferPlates = []) {
    const combos = platesForSide(sideKg).filter(isValidPlateStack);
    if (!combos.length) return greedyValid(sideKg);
    const prefer = Array.isArray(preferPlates) ? preferPlates : [];
    combos.sort((a, b) => {
        const sa = scoreCombo(a, prefer);
        const sb = scoreCombo(b, prefer);
        if (sb.kept !== sa.kept) return sb.kept - sa.kept;
        if (sa.removed !== sb.removed) return sa.removed - sb.removed;
        if (sa.count !== sb.count) return sa.count - sb.count;
        if (sa.preferHas20 || sb.preferHas20) {
            if (sb.twentyCount !== sa.twentyCount) return sb.twentyCount - sa.twentyCount;
        }
        return (sb.first || 0) - (sa.first || 0);
    });
    return combos[0];
}

function greedyValid(sideKg) {
    let remain = Math.round((Number(sideKg) || 0) * 100) / 100;
    const loaded = [];
    for (const plate of PLATE_SIZES) {
        while (remain >= plate - 0.01) {
            const next = [...loaded, plate];
            if (!isValidPlateStack(next)) break;
            loaded.push(plate);
            remain = Math.round((remain - plate) * 100) / 100;
        }
    }
    return loaded;
}

export function platesForBarWeight(totalKg, preferFromKg = null) {
    const target = Number(totalKg) || 0;
    if (target < 20) return [];
    const side = Math.round(((target - 20) / 2) * 100) / 100;
    let prefer = [];
    const prev = Number(preferFromKg);
    if (Number.isFinite(prev) && prev >= 20) {
        prefer = platesForBarWeight(prev);
    }
    return choosePlatesForSide(side, prefer);
}

export function formatPlatesPerSide(totalKg, preferFromKg = null) {
    const target = Number(totalKg) || 0;
    if (target < 20) return 'BAR ONLY';
    const loaded = platesForBarWeight(target, preferFromKg);
    return loaded.length ? loaded.join(' | ') : 'BAR ONLY';
}
