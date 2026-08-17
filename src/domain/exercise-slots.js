/**
 * Programming slot → equivalent exercise pools (strength + hypertrophy).
 * Swap-for-equivalent uses exact slot labels, not muscle_group.
 */
import { HYPERTROPHY_POOLS } from './hypertrophy-engine.js';
import { getExerciseMeta, resolveCatalogName } from './exercise-catalog.js';
import { isExerciseBanned } from './bans.js';
import { store } from '../state/store.js';
import { equivalentPowerNames, isPowerSlotLabel, powerMovementForName, powerNamesForSlot } from './power-engine.js';

/** Slot label → hypertrophy pool keys (when unilateral/bilateral is specified, one key). */
export const SLOT_LABEL_POOLS = {
    'Posterior Compound': ['posterior_bilateral', 'posterior_unilateral'],
    'Anterior Compound': ['anterior_bilateral', 'anterior_unilateral'],
    'Bilateral Posterior': ['posterior_bilateral'],
    'Unilateral Posterior': ['posterior_unilateral'],
    'Bilateral Anterior': ['anterior_bilateral'],
    'Unilateral Anterior': ['anterior_unilateral'],
    'Unilateral Legs': ['anterior_unilateral', 'posterior_unilateral'],
    'Horizontal Push': ['horizontal_push_db', 'horizontal_push_bb'],
    'Vertical Push': ['vertical_push_db', 'vertical_push_bb'],
    'Horizontal Pull': ['horizontal_pull'],
    'Vertical Pull': ['vertical_pull'],
    'Bicep Isolation': ['bicep_isolation'],
    'Tricep Isolation': ['tricep_isolation'],
    'Calf Isolation': ['calf_isolation'],
    'Groin Isolation': ['groin_isolation'],
    'Abductor Isolation': ['abductor_isolation'],
    'Quad Isolation': ['quad_isolation'],
    'Hamstring Isolation': ['hamstring_isolation'],
    'Rear Delt Isolation': ['rear_delt_isolation'],
    'Front Delt Isolation': ['front_delt_isolation'],
    'Side Delt Isolation': ['side_delt_isolation'],
    'Mid Trap Isolation': ['mid_trap_isolation'],
    'Pec Isolation': ['pec_isolation'],
    'Rotator Cuff Isolation': ['rotator_cuff_isolation'],
    'Sport / Extra Isolation': []
};

const ISOLATION_MUSCLE_TO_POOL = {
    biceps: 'bicep_isolation',
    triceps: 'tricep_isolation',
    calves: 'calf_isolation',
    groin: 'groin_isolation',
    abductor: 'abductor_isolation',
    glute: 'abductor_isolation',
    quad: 'quad_isolation',
    hamstrings: 'hamstring_isolation',
    rear_delt: 'rear_delt_isolation',
    front_delt: 'front_delt_isolation',
    side_delt: 'side_delt_isolation',
    mid_trap: 'mid_trap_isolation',
    pecs: 'pec_isolation',
    pec: 'pec_isolation',
    rotator_cuff: 'rotator_cuff_isolation',
    // strength iso muscleKey variants
    hamstring: 'hamstring_isolation',
    bicep: 'bicep_isolation',
    tricep: 'tricep_isolation',
    calf: 'calf_isolation'
};

function canonName(name) {
    return String(resolveCatalogName(name) || name || '').trim().toLowerCase();
}

function namesFromPoolKeys(keys) {
    const names = [];
    for (const key of keys || []) {
        for (const n of (HYPERTROPHY_POOLS[key] || [])) {
            if (n && !names.includes(n)) names.push(n);
        }
    }
    return names;
}

function titleCaseSlot(s) {
    return String(s || '')
        .replace(/_/g, ' ')
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

/** Resolve name list for a programming slot label. */
export function poolNamesForSlotLabel(slotLabel) {
    if (!slotLabel || typeof slotLabel !== 'string') return [];

    if (isPowerSlotLabel(slotLabel)) {
        return powerNamesForSlot(slotLabel);
    }

    const normalized = titleCaseSlot(slotLabel);
    if (SLOT_LABEL_POOLS[slotLabel]) {
        return namesFromPoolKeys(SLOT_LABEL_POOLS[slotLabel]);
    }
    if (SLOT_LABEL_POOLS[normalized]) {
        return namesFromPoolKeys(SLOT_LABEL_POOLS[normalized]);
    }

    // "Isolation · hamstrings" / "Isolation · biceps"
    const isoMatch = /^Isolation\s*·\s*(.+)$/i.exec(slotLabel.trim());
    if (isoMatch) {
        const key = String(isoMatch[1] || '').trim().toLowerCase().replace(/\s+/g, '_');
        const pool = ISOLATION_MUSCLE_TO_POOL[key] || ISOLATION_MUSCLE_TO_POOL[key.replace(/s$/, '')];
        if (pool) return namesFromPoolKeys([pool]);
        // try direct hypertrophy pool name
        const direct = `${key}_isolation`;
        if (HYPERTROPHY_POOLS[direct]) return namesFromPoolKeys([direct]);
    }

    // Exact hypertrophy pool-style labels already covered; try fuzzy "X Isolation"
    const isol = /^(.+?)\s+Isolation$/i.exec(slotLabel.trim());
    if (isol) {
        const nice = isol[1].trim();
        const mapped = SLOT_LABEL_POOLS[`${nice} Isolation`];
        if (mapped) return namesFromPoolKeys(mapped);
        const snake = nice.toLowerCase().replace(/\s+/g, '_');
        if (HYPERTROPHY_POOLS[`${snake}_isolation`]) return namesFromPoolKeys([`${snake}_isolation`]);
    }

    return [];
}

/**
 * Infer slot label from exercise name by scanning known pools
 * (prefer more specific unilateral/bilateral pools over combined compounds).
 */
export function inferSlotLabelFromExerciseName(name) {
    if (!name) return null;
    const powerMov = powerMovementForName(name);
    if (powerMov?.slot) return powerMov.slot;
    const n = canonName(name);

    const specificOrder = [
        ['Bilateral Posterior', ['posterior_bilateral']],
        ['Unilateral Posterior', ['posterior_unilateral']],
        ['Bilateral Anterior', ['anterior_bilateral']],
        ['Unilateral Anterior', ['anterior_unilateral']],
        ['Horizontal Push', ['horizontal_push_db', 'horizontal_push_bb']],
        ['Vertical Push', ['vertical_push_db', 'vertical_push_bb']],
        ['Horizontal Pull', ['horizontal_pull']],
        ['Vertical Pull', ['vertical_pull']],
        ['Bicep Isolation', ['bicep_isolation']],
        ['Tricep Isolation', ['tricep_isolation']],
        ['Calf Isolation', ['calf_isolation']],
        ['Groin Isolation', ['groin_isolation']],
        ['Abductor Isolation', ['abductor_isolation']],
        ['Quad Isolation', ['quad_isolation']],
        ['Hamstring Isolation', ['hamstring_isolation']],
        ['Rear Delt Isolation', ['rear_delt_isolation']],
        ['Front Delt Isolation', ['front_delt_isolation']],
        ['Side Delt Isolation', ['side_delt_isolation']],
        ['Mid Trap Isolation', ['mid_trap_isolation']],
        ['Pec Isolation', ['pec_isolation']],
        ['Rotator Cuff Isolation', ['rotator_cuff_isolation']]
    ];

    for (const [label, keys] of specificOrder) {
        if (namesFromPoolKeys(keys).some((poolName) => canonName(poolName) === n)) return label;
    }
    return null;
}

export function resolveItemSlotLabel(item) {
    if (!item) return null;
    if (item.slotLabel) return item.slotLabel;
    const name = item.exercise?.name || item.name;
    return inferSlotLabelFromExerciseName(name);
}

/**
 * Equivalents for swap UI: same slot pool, exclude current + banned.
 * Returns exercise DB rows.
 */
export function getEquivalentExercises(item) {
    const slotLabel = resolveItemSlotLabel(item);
    const currentName = item?.exercise?.name || item?.name || '';
    let names = [];
    if (isPowerSlotLabel(slotLabel) || powerMovementForName(currentName)) {
        names = equivalentPowerNames(currentName);
        if (!names.length && slotLabel) names = powerNamesForSlot(slotLabel, powerMovementForName(currentName)?.band);
    } else {
        names = poolNamesForSlotLabel(slotLabel);
        if (!names.length && currentName) {
            const inferred = inferSlotLabelFromExerciseName(currentName);
            names = poolNamesForSlotLabel(inferred);
        }
    }
    const currentCanon = canonName(currentName);
    const nameSet = new Set(names.map((n) => canonName(n)).filter(Boolean));

    let matches = (store.globalExerciseDB || []).filter((e) => {
        if (!e || !e.name) return false;
        const ln = canonName(e.name);
        if (!ln || ln === currentCanon) return false;
        if (!nameSet.has(ln)) return false;
        if (isExerciseBanned(e.id)) return false;
        return true;
    });

    // Fallback: same catalog muscle group when the slot pool didn't resolve to DB rows
    if (!matches.length && currentName) {
        const meta = getExerciseMeta(currentName);
        const group = String(meta?.muscle_group || item?.exercise?.muscle_group || '').toLowerCase();
        if (group) {
            matches = (store.globalExerciseDB || []).filter((e) => {
                if (!e || !e.name) return false;
                if (canonName(e.name) === currentCanon) return false;
                if (isExerciseBanned(e.id)) return false;
                const em = getExerciseMeta(e.name);
                const eg = String(em?.muscle_group || e.muscle_group || '').toLowerCase();
                return eg && eg === group;
            });
        }
    }

    return matches;
}

/** Pick a random equivalent name from the same slot (for ban auto-replace). */
export function pickReplacementNameForSlot(slotLabel, excludeNames = []) {
    const names = poolNamesForSlotLabel(slotLabel).filter(
        (n) => !excludeNames.includes(n) && !excludeNames.map((x) => String(x).toLowerCase()).includes(String(n).toLowerCase())
    );
    // Also exclude banned by looking up DB
    const viable = names.filter((n) => {
        const ex = (store.globalExerciseDB || []).find((e) => e.name === n);
        if (ex && isExerciseBanned(ex.id)) return false;
        return true;
    });
    if (!viable.length) return null;
    return viable[Math.floor(Math.random() * viable.length)];
}

/** Replace a banned exercise across locked monthly session plans. */
export function replaceBannedExerciseInLockedPlans(bannedId, bannedName) {
    try {
        const plans = JSON.parse(localStorage.getItem('ascensus_cycle_session_plans_v1') || '{}');
        let changed = false;
        Object.keys(plans).forEach((sid) => {
            const plan = plans[sid];
            if (!plan) return;
            const lists = [plan.lockedItems, plan.plan?.items, plan.items].filter(Array.isArray);
            lists.forEach((list) => {
                list.forEach((it) => {
                    const name = it.exercise?.name || it.name;
                    const id = it.exercise?.id;
                    const hit = (bannedId != null && id != null && String(id) === String(bannedId))
                        || (bannedName && name === bannedName);
                    if (!hit) return;
                    const slot = resolveItemSlotLabel(it) || inferSlotLabelFromExerciseName(name);
                    const replacement = pickReplacementNameForSlot(slot, [name, bannedName].filter(Boolean));
                    if (!replacement) return;
                    if (it.exercise) it.exercise = { ...it.exercise, name: replacement };
                    if (it.name != null) it.name = replacement;
                    changed = true;
                });
            });
        });
        if (changed) localStorage.setItem('ascensus_cycle_session_plans_v1', JSON.stringify(plans));
        return changed;
    } catch (e) {
        return false;
    }
}
