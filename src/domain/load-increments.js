/**
 * Per-exercise load increments (PDF 25/07/2026) — mins, steps, warmup rounding.
 */
import { store } from '../state/store.js';
import { getExerciseMeta, resolveCatalogName } from './exercise-catalog.js';

/** Converted lb stacks → kg (nearest 1dp for cables; nearest whole for M/C). */
export const DEFAULT_PROFILES = {
    B: { code: 'B', label: 'Barbell', min: 10, step: 2.5 },
    D: { code: 'D', label: 'Dumbbell', min: 1, step: null },
    Fca: { code: 'Fca', label: 'Functional cable', min: 2.5, step: 0.9 },
    Cca: { code: 'Cca', label: 'Crossover cable', min: 2.3, step: 2.3 },
    M: { code: 'M', label: 'Machine', min: 5, step: 7 },
    C: { code: 'C', label: 'Custom', min: 5, step: 5 },
    H: { code: 'H', label: 'Halo', min: 5, step: 5, max: 25 },
    P: { code: 'P', label: 'Plate-loaded', min: 0, step: 1.25 },
    free: { code: 'free', label: 'Free weight', min: 0, step: 0 },
    none: { code: 'none', label: 'No weight', min: 0, step: 0 }
};

const LEGACY_TO_CODE = {
    barbell: 'B',
    dumbbell: 'D',
    pullup_dip: 'P'
};

const OPTION_LABELS = {
    B: 'Barbell',
    D: 'Dumbbell',
    Ca: 'Cable',
    Fca: 'Functional cable',
    Cca: 'Crossover cable',
    M: 'Machine',
    C: 'Custom',
    H: 'Halo',
    P: 'Plate-loaded',
    free: 'Free weight'
};

export function getDbIncrements() {
    const cfg = store.userConfig?.dbIncrements;
    const legacy = parseFloat(store.userConfig?.dumbbellIncrement);
    const mid = Number.isFinite(legacy) && legacy > 0 ? legacy : 2;
    return {
        low: Number(cfg?.low) > 0 ? Number(cfg.low) : 1,
        mid: Number(cfg?.mid) > 0 ? Number(cfg.mid) : mid,
        high: Number(cfg?.high) > 0 ? Number(cfg.high) : mid
    };
}

/** Step for a dumbbell weight; boundaries 10/20 may use either adjacent range. */
export function getDumbbellStepForWeight(w) {
    const { low, mid, high } = getDbIncrements();
    const v = Number(w) || 0;
    if (v < 10) return low;
    if (v < 20) return mid;
    return high;
}

export function optionLabel(code) {
    return OPTION_LABELS[code] || code;
}

/**
 * Expand catalog loadOptions for UI picks.
 * Ca → Fca + Cca (user must choose; no silent default at confirm).
 */
export function expandLoadChoices(loadOptions) {
    const opts = Array.isArray(loadOptions) ? loadOptions : [];
    const out = [];
    for (const o of opts) {
        if (o === 'Ca') {
            out.push('Fca', 'Cca');
        } else if (o && o !== 'none') {
            out.push(o);
        }
    }
    return [...new Set(out)];
}

export function catalogLoadOptions(exName) {
    const meta = getExerciseMeta(exName);
    if (!meta) return [];
    if (Array.isArray(meta.loadOptions)) return meta.loadOptions.slice();
    if (meta.bodyweight && meta.role === 'compound') return ['P'];
    if (meta.dumbbell) return ['D'];
    return ['B'];
}

/** True when user must pick before first confirm (multi-choice or Ca). */
export function needsEquipmentPick(exName, currentChoice = null) {
    const expanded = expandLoadChoices(catalogLoadOptions(exName));
    if (expanded.length <= 1) return false;
    if (expanded.includes('free') && expanded.length === 1) return false;
    return !currentChoice || !expanded.includes(currentChoice);
}

export function exercisesNeedingEquipmentPick(items) {
    const list = Array.isArray(items) ? items : [];
    const needing = [];
    for (const it of list) {
        if (!it || it.isWarmupGroup || it.isStretchGroup || it.isSportSessionBlock) continue;
        const name = it.exercise?.name || it.name;
        if (!name) continue;
        const opts = expandLoadChoices(catalogLoadOptions(name));
        if (opts.length <= 1) continue;
        if (!it.equipmentChoice || !opts.includes(it.equipmentChoice)) {
            needing.push({ name, options: opts, item: it });
        }
    }
    return needing;
}

export function canEditIncrements(exName) {
    const opts = catalogLoadOptions(exName);
    if (!opts.length) return false;
    const expanded = expandLoadChoices(opts);
    if (expanded.length === 1 && (expanded[0] === 'B' || expanded[0] === 'D' || expanded[0] === 'free')) {
        return false;
    }
    if (expanded.every((c) => c === 'B' || c === 'D' || c === 'free')) return false;
    // Editable when any non-B/D/free option exists
    return expanded.some((c) => c !== 'B' && c !== 'D' && c !== 'free');
}

/** Codes shown in Edit increments (both panels when multi). */
export function editableIncrementCodes(exName) {
    return expandLoadChoices(catalogLoadOptions(exName)).filter(
        (c) => c !== 'B' && c !== 'D' && c !== 'free'
    );
}

function readUserOverride(exName, code) {
    const resolved = resolveCatalogName(exName) || exName;
    const map = store.userConfig?.exerciseIncrements;
    if (!map || typeof map !== 'object') return null;
    const row = map[resolved] || map[exName];
    if (!row || typeof row !== 'object') return null;
    const o = row[code];
    if (!o || typeof o !== 'object') return null;
    const min = parseFloat(o.min);
    const step = parseFloat(o.step);
    if (!Number.isFinite(min) && !Number.isFinite(step)) return null;
    return {
        min: Number.isFinite(min) ? min : undefined,
        step: Number.isFinite(step) && step > 0 ? step : undefined
    };
}

/**
 * Resolve active load profile for an exercise + optional equipmentChoice.
 * @param {string} exName
 * @param {string|null} choice - B|D|Fca|Cca|M|C|P|free
 * @param {{ weight?: number }} opts - weight helps dumbbell range step
 */
export function resolveLoadProfile(exName, choice = null, opts = {}) {
    const meta = getExerciseMeta(exName);
    const loadOpts = catalogLoadOptions(exName);
    if (!loadOpts.length) {
        return { ...DEFAULT_PROFILES.none, allowsWeight: false };
    }

    let code = choice || null;
    const expanded = expandLoadChoices(loadOpts);

    if (!code) {
        if (expanded.length === 1) code = expanded[0];
        else if (loadOpts.includes('Ca') && meta?.cableDefault === 'Cca') code = 'Cca';
        else if (loadOpts.includes('Ca')) code = 'Fca'; // runtime default for planning before pick
        else code = expanded[0];
    }

    if (code === 'Ca') code = 'Fca';

    // Legacy equipment strings from older call sites
    if (LEGACY_TO_CODE[code]) code = LEGACY_TO_CODE[code];

    if (code === 'free' || loadOpts.includes('free') && expanded.length === 1) {
        return { ...DEFAULT_PROFILES.free, allowsWeight: true, skipProgression: true };
    }

    const base = DEFAULT_PROFILES[code] ? { ...DEFAULT_PROFILES[code] } : { ...DEFAULT_PROFILES.B };
    const override = readUserOverride(exName, code);
    if (override?.min != null) base.min = override.min;
    if (override?.step != null) base.step = override.step;

    // Catalog hard max (e.g. Halo 25 kg) — not user-overridable
    const catalogMax = meta?.loadMax != null ? Number(meta.loadMax) : (base.max != null ? Number(base.max) : null);
    if (Number.isFinite(catalogMax) && catalogMax > 0) {
        base.max = catalogMax;
        if (base.min != null && base.min > base.max) base.min = base.max;
    }

    if (code === 'D') {
        const w = opts.weight != null ? Number(opts.weight) : base.min;
        base.step = getDumbbellStepForWeight(w);
    }

    base.allowsWeight = true;
    base.skipProgression = false;
    return base;
}

/** Round up to profile step; free/none leave value alone. */
export function roundUpLoad(val, equipmentOrProfile = 'barbell', choiceOrOpts = null) {
    const v = Number(val) || 0;
    if (v <= 0) return 0;

    let profile;
    if (equipmentOrProfile && typeof equipmentOrProfile === 'object' && 'step' in equipmentOrProfile) {
        profile = equipmentOrProfile;
    } else if (typeof equipmentOrProfile === 'string' && !LEGACY_TO_CODE[equipmentOrProfile]
        && !DEFAULT_PROFILES[equipmentOrProfile] && equipmentOrProfile.length > 2) {
        // Treat as exercise name
        const choice = typeof choiceOrOpts === 'string' ? choiceOrOpts : choiceOrOpts?.choice;
        const weight = typeof choiceOrOpts === 'object' && choiceOrOpts ? choiceOrOpts.weight : v;
        profile = resolveLoadProfile(equipmentOrProfile, choice, { weight });
    } else {
        const legacy = LEGACY_TO_CODE[equipmentOrProfile] || equipmentOrProfile || 'B';
        if (legacy === 'D' || equipmentOrProfile === 'dumbbell') {
            profile = {
                ...DEFAULT_PROFILES.D,
                step: getDumbbellStepForWeight(v),
                allowsWeight: true
            };
        } else if (DEFAULT_PROFILES[legacy]) {
            profile = { ...DEFAULT_PROFILES[legacy], allowsWeight: true };
        } else {
            profile = { ...DEFAULT_PROFILES.B, allowsWeight: true };
        }
    }

    if (!profile || profile.code === 'none') return 0;
    if (profile.code === 'free' || !profile.step || profile.step <= 0) {
        let loose = Math.round(v * 100) / 100;
        if (profile.max != null && Number.isFinite(Number(profile.max)) && loose > Number(profile.max)) {
            loose = Number(profile.max);
        }
        return loose;
    }

    const step = profile.step;
    let rounded = Math.ceil(v / step - 1e-9) * step;
    // Avoid float noise (e.g. 0.9 steps)
    rounded = Math.round(rounded * 1000) / 1000;
    if (profile.min != null && rounded > 0 && rounded < profile.min) {
        rounded = profile.min;
    }
    if (profile.max != null && Number.isFinite(Number(profile.max)) && rounded > Number(profile.max)) {
        rounded = Number(profile.max);
    }
    return rounded;
}

/** Barbell warmups only: 1st → ceil multiple of 10; 2nd → ceil multiple of 5. */
export function roundBarbellWarmup(weight, which = 1) {
    const v = Number(weight) || 0;
    if (v <= 0) return 0;
    const mult = which === 2 ? 5 : 10;
    return Math.ceil(v / mult - 1e-9) * mult;
}

export function applyWarmupRounding(weight, profile, warmupIndex = 1) {
    const code = profile?.code || profile;
    let w = roundUpLoad(weight, profile);
    if (code === 'B') {
        w = roundBarbellWarmup(w, warmupIndex);
    }
    return w;
}

/** When total ≥ 20 kg, plate math always uses a 20 kg bar. */
export function barbellBarWeight(totalKg) {
    const t = Number(totalKg) || 0;
    if (t >= 20) return 20;
    return Math.min(20, Math.max(0, t));
}

export function allowsWeightInput(exName, choice = null) {
    const opts = catalogLoadOptions(exName);
    if (!opts.length) return false;
    const profile = resolveLoadProfile(exName, choice);
    return !!profile.allowsWeight && profile.code !== 'none';
}

export function skipsWeightProgression(exName, choice = null) {
    const meta = getExerciseMeta(exName);
    if (meta?.movement === 'core' || meta?.ppl === 'Core' || meta?.coreLevel) return true;
    const profile = resolveLoadProfile(exName, choice);
    return !!profile.skipProgression || profile.code === 'free' || profile.code === 'none';
}

/** One equipment increment above current load. Unchanged if progression is skipped or already at max. */
export function increaseLoadOneStep(weight, exName, choice = null) {
    const w = Number(weight) || 0;
    if (w <= 0) return w;
    if (skipsWeightProgression(exName, choice)) return w;
    const profile = resolveLoadProfile(exName, choice, { weight: w });
    const step = Number(profile?.step);
    if (!Number.isFinite(step) || step <= 0) return w;
    return roundUpLoad(w + step, profile);
}

/** Map profile → legacy equipment string still used in a few call sites. */
export function profileToLegacyEquipment(profile) {
    const code = typeof profile === 'string' ? profile : profile?.code;
    if (code === 'D') return 'dumbbell';
    if (code === 'P') return 'pullup_dip';
    return 'barbell';
}

export function equipmentChoiceFromItem(item) {
    return item?.equipmentChoice || item?.exercise?.equipmentChoice || null;
}
