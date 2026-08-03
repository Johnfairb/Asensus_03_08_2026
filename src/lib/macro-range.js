/** Derive daily aim ranges from point targets (Cronometer-style). */
export function getMacroRange(metric, target) {
    const t = Math.max(0, Number(target) || 0);
    if (metric === 'pro') {
        return { min: t * 0.90, max: t * 1.15 };
    }
    if (metric === 'cals') {
        return { min: t * 0.92, max: t * 1.08 };
    }
    if (metric === 'cost') {
        return { min: t * 0.88, max: t * 1.12 };
    }
    // carb / fat / water (±12%)
    return { min: t * 0.88, max: t * 1.12 };
}

/** Domain tracking aim range (±12% around day/week target). */
export function getDomainRange(target) {
    const t = Math.max(0, Number(target) || 0);
    return { min: t * 0.88, max: t * 1.12 };
}

function aimLabelParts(currentHtml, targetHtml) {
    if (targetHtml == null) {
        return `<span class="macro-aim-current">${currentHtml}</span>`;
    }
    return `<span class="macro-aim-current">${currentHtml}</span><span class="macro-aim-sep"> / </span><span class="macro-aim-target">${targetHtml}</span>`;
}

/** Short HUD label HTML: consumed / aim. Range detail stays in the breakdown sheet. */
export function formatMacroAimLabel(metric, current, target) {
    const t = Math.max(0, Number(target) || 0);
    const hasAim = t > 0;

    if (metric === 'water') {
        const cur = Number(current).toFixed(1);
        return hasAim ? aimLabelParts(cur, `${t.toFixed(1)} L`) : aimLabelParts(`${cur} L`);
    }
    if (metric === 'sleep') {
        const cur = Number(current).toFixed(1);
        return hasAim ? aimLabelParts(cur, `${t.toFixed(1)} h`) : aimLabelParts(`${cur} h`);
    }
    if (metric === 'cost') {
        const cur = `£${Number(current).toFixed(2)}`;
        return hasAim ? aimLabelParts(cur, `£${t.toFixed(2)}`) : aimLabelParts(cur);
    }
    const cur = Math.round(Number(current) || 0);
    const aim = Math.round(t);
    if (metric === 'cals') {
        return hasAim ? aimLabelParts(String(cur), `${aim} kcal`) : aimLabelParts(`${cur} kcal`);
    }
    return hasAim ? aimLabelParts(String(cur), `${aim} g`) : aimLabelParts(`${cur} g`);
}

/** Domain HUD label HTML: current / target. */
export function formatDomainAimLabel(current, target) {
    const cur = Math.round(Number(current) || 0);
    const t = Math.max(0, Number(target) || 0);
    if (t <= 0) return aimLabelParts(String(cur), '0');
    return aimLabelParts(String(cur), String(Math.round(t)));
}

/** Track fraction where the aim (or over tip) is parked. */
const AIM_BAR_ANCHOR = 0.75;

/**
 * Shared Goals-style bar geometry (fill %, aim band, under/in-range/over).
 * Under/in-range: target at 75%. Over: fill tip at 75%, aim band slides left.
 * @returns {{ fillPct: number, bandLeft: number, bandWidth: number, state: string, inRangeT: number, bandGradient: string, aimPct: number }}
 */
export function computeAimBarLayout(range, current, target) {
    const cur = Math.max(0, Number(current) || 0);
    const t = Math.max(0, Number(target) || 0);
    const scaleMax = cur > range.max
        ? Math.max(cur, 1) / AIM_BAR_ANCHOR
        : Math.max(t, 1) / AIM_BAR_ANCHOR;
    const fillPct = Math.min(100, (cur / scaleMax) * 100);
    const bandLeft = (range.min / scaleMax) * 100;
    const bandWidth = Math.max(0, ((range.max - range.min) / scaleMax) * 100);
    const aimPct = Math.min(100, Math.max(0, (t / scaleMax) * 100));

    let state = 'under';
    let inRangeT = 0;
    if (cur > range.max) {
        state = 'over';
    } else if (cur >= range.min) {
        state = 'in-range';
        const half = Math.max(t - range.min, range.max - t, 1);
        inRangeT = 1 - Math.min(1, Math.abs(cur - t) / half);
    }

    const idealPct = range.max > range.min
        ? ((t - range.min) / (range.max - range.min)) * 100
        : 50;
    const bandGradient = `linear-gradient(
        90deg,
        transparent 0%,
        var(--aim-soft) ${Math.max(0, idealPct - 35)}%,
        var(--aim-peak) ${idealPct}%,
        var(--aim-soft) ${Math.min(100, idealPct + 35)}%,
        transparent 100%
    )`;

    return { fillPct, bandLeft, bandWidth, state, inRangeT, bandGradient, aimPct };
}

export function computeMacroBarLayout(metric, current, target) {
    return computeAimBarLayout(getMacroRange(metric, target), current, target);
}

export function computeDomainBarLayout(current, target) {
    return computeAimBarLayout(getDomainRange(target), current, target);
}
