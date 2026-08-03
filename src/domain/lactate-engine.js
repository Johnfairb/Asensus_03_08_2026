/**
 * Lactate / HIT session engine.
 * - ~45 min total (warmup + 10 min HIT block + stretch)
 * - Per-set random work:rest (multiples of 5s, each ≥ 20s), summing to 10 min
 * - Multi-select HIT modalities; mixed sessions alternate sets
 */

export const LACTATE_WORK_BLOCK_SEC = 10 * 60; // 10 minutes of HIT block

export const HIT_TYPE_OPTIONS = [
    { id: 'interval_sprints', label: 'Interval sprints' },
    { id: 'attack_bike', label: 'Attack bike intervals' },
    { id: 'skier', label: 'Skier intervals' },
    { id: 'swimming', label: 'Swimming intervals' },
    { id: 'battle_rope', label: 'Battle rope intervals' },
    { id: 'rower', label: 'Rower intervals' },
    { id: 'hill_sprint', label: 'Hill sprint intervals' },
    { id: 'spinning', label: 'Spinning' },
    { id: 'hit_class', label: 'HIT class' }
];

function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function getLactateMonthKey(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() * 100 + (d.getMonth() + 1);
}

function shuffleCopy(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function formatSec(sec) {
    if (sec % 60 === 0) return `${sec / 60}m`;
    if (sec > 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${sec}s`;
}

export function formatWorkRestLabel(workSec, restSec) {
    return `${formatSec(workSec)} work / ${formatSec(restSec)} rest`;
}

/**
 * Random work/rest pairs for a HIT block.
 * - Each work and rest ≥ 20s, multiples of 5
 * - Sum of (work + rest) across sets = totalSec (default 10 min)
 * - Ratios vary set-to-set
 */
export function generateVariableIntervalSets(totalSec = LACTATE_WORK_BLOCK_SEC, rng = Math.random) {
    const rand = typeof rng === 'function' ? rng : Math.random;
    const sets = [];
    let remaining = Math.max(40, Math.round(totalSec / 5) * 5);

    while (remaining >= 40) {
        const leaveRoom = remaining - 40;
        const forceLast = leaveRoom < 40 || (remaining <= 120 && rand() < 0.45);
        let cycle;
        if (forceLast) {
            cycle = remaining;
        } else {
            const maxCycle = Math.min(150, remaining - 40);
            const choices = [];
            for (let c = 40; c <= maxCycle; c += 5) choices.push(c);
            cycle = choices[Math.floor(rand() * choices.length)] || 40;
        }

        // Split cycle into work + rest (both ≥ 20, multiples of 5)
        const workChoices = [];
        for (let w = 20; w <= cycle - 20; w += 5) workChoices.push(w);
        const workSec = workChoices[Math.floor(rand() * workChoices.length)] || 20;
        const restSec = cycle - workSec;
        sets.push({ workSec, restSec, cycleSec: cycle });
        remaining -= cycle;
    }

    // Fold any leftover seconds into the last rest (keep multiples of 5 / ≥20)
    if (remaining > 0 && sets.length) {
        sets[sets.length - 1].restSec += remaining;
        sets[sets.length - 1].cycleSec += remaining;
        remaining = 0;
    }

    return sets;
}

/**
 * Two distinct “session flavours” for the month (A/B labels for the week).
 * Actual per-set ratios are generated fresh each workout.
 */
export function getMonthlyLactateProtocols(date = new Date()) {
    const monthKey = getLactateMonthKey(date);
    const rng = mulberry32(monthKey * 9973 + 42);
    const wrap = (slot) => {
        const sample = generateVariableIntervalSets(LACTATE_WORK_BLOCK_SEC, rng);
        const avgWork = Math.round(sample.reduce((s, x) => s + x.workSec, 0) / sample.length);
        const avgRest = Math.round(sample.reduce((s, x) => s + x.restSec, 0) / sample.length);
        return {
            slot,
            monthKey,
            sets: sample.length,
            workSec: avgWork,
            restSec: avgRest,
            blockMinutes: LACTATE_WORK_BLOCK_SEC / 60,
            label: `variable intervals (~${formatSec(avgWork)} / ${formatSec(avgRest)} avg)`,
            summary: `${sample.length}× variable work/rest · 10 min HIT (ratios reshuffle each session)`
        };
    };
    return { A: wrap('A'), B: wrap('B'), monthKey };
}

export function getLactateProtocolForSlot(slot = 'A', date = new Date()) {
    const pair = getMonthlyLactateProtocols(date);
    return slot === 'B' ? pair.B : pair.A;
}

export function hitTypeLabel(id) {
    return HIT_TYPE_OPTIONS.find(t => t.id === id)?.label || id;
}

/**
 * Build ordered interval rows for selected HIT types.
 * Mixed types → alternate modalities; each set gets its own work/rest.
 */
export function buildLactateIntervalPlan({ types = [], slot = 'A', date = new Date() } = {}) {
    const selected = (types || []).filter(Boolean);
    const isHitClass = selected.length === 1 && selected[0] === 'hit_class';
    const intervalTypes = selected.filter(t => t !== 'hit_class');

    if (isHitClass || (!intervalTypes.length && selected.includes('hit_class'))) {
        return {
            isHitClass: true,
            slot,
            protocol: null,
            types: ['hit_class'],
            rows: [{
                typeId: 'hit_class',
                name: 'HIT class',
                setIndex: 1,
                workSec: LACTATE_WORK_BLOCK_SEC,
                restSec: 0,
                repsLabel: '~20–45 min class',
                durationSec: LACTATE_WORK_BLOCK_SEC,
                notes: 'Log the class as your Lactate/HIT session. Recovery is based on your RPE.'
            }],
            summary: 'HIT class · recovery from session RPE'
        };
    }

    const seed = Date.now() ^ (getLactateMonthKey(date) * 1009) ^ (slot === 'B' ? 77 : 13);
    const rng = mulberry32(seed);
    const intervals = generateVariableIntervalSets(LACTATE_WORK_BLOCK_SEC, rng);
    const modalities = intervalTypes.length ? intervalTypes : ['interval_sprints'];
    const totalSets = intervals.length;
    const rows = [];

    if (modalities.length === 1) {
        for (let i = 0; i < totalSets; i++) {
            const iv = intervals[i];
            rows.push({
                typeId: modalities[0],
                name: hitTypeLabel(modalities[0]),
                setIndex: i + 1,
                workSec: iv.workSec,
                restSec: iv.restSec,
                repsLabel: `${formatSec(iv.workSec)} work`,
                durationSec: iv.workSec,
                notes: `${formatWorkRestLabel(iv.workSec, iv.restSec)} · set ${i + 1}/${totalSets}`
            });
        }
    } else {
        const counts = Object.create(null);
        modalities.forEach(m => { counts[m] = 0; });
        const targetPer = Math.floor(totalSets / modalities.length);
        let remainder = totalSets - targetPer * modalities.length;
        const budget = Object.create(null);
        modalities.forEach(m => {
            budget[m] = targetPer + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
        });

        let mi = 0;
        for (let i = 0; i < totalSets; i++) {
            let tries = 0;
            while (counts[modalities[mi]] >= budget[modalities[mi]] && tries < modalities.length) {
                mi = (mi + 1) % modalities.length;
                tries++;
            }
            const typeId = modalities[mi];
            counts[typeId] += 1;
            const iv = intervals[i];
            rows.push({
                typeId,
                name: hitTypeLabel(typeId),
                setIndex: counts[typeId],
                workSec: iv.workSec,
                restSec: iv.restSec,
                repsLabel: `${formatSec(iv.workSec)} work`,
                durationSec: iv.workSec,
                notes: `${formatWorkRestLabel(iv.workSec, iv.restSec)} · ${hitTypeLabel(typeId)} set ${counts[typeId]}`
            });
            mi = (mi + 1) % modalities.length;
        }
    }

    const typeNames = modalities.map(hitTypeLabel).join(' + ');
    const protocol = {
        slot,
        sets: totalSets,
        blockMinutes: LACTATE_WORK_BLOCK_SEC / 60,
        label: 'variable work/rest',
        summary: `${totalSets}× variable work/rest · 10 min HIT`
    };
    return {
        isHitClass: false,
        slot,
        protocol,
        types: modalities,
        rows,
        summary: `Session ${slot}: ${protocol.summary} · ${typeNames}`
    };
}

/** Compact warmup so session lands near ~45 min with 10 min HIT + stretch. */
export function getLactateWarmupParts() {
    return [
        { name: 'Pulse Raising', reps: '3–5 Mins', notes: 'Light jog, skip, bike, or skip rope.' },
        { name: 'Mobilisation', reps: '10 Reps/Joint', notes: 'Neck, shoulders, hips, ankles.' },
        { name: 'Dynamic Stretching', reps: '5 Mins', notes: 'Leg swings, open/close gate, walking lunges.' }
    ];
}

/**
 * Recovery after a HIT class, driven by logged RPE.
 * Returns { nextDayOverride, message } or null.
 */
export function resolveHitClassRecovery(rpe) {
    const r = Number(rpe);
    if (!Number.isFinite(r)) return null;
    if (r >= 8) {
        return {
            nextDayOverride: 'Rest (Cardio Only)',
            message: 'HIT class RPE ≥ 8: tomorrow locked to Rest (optional steady is fine).'
        };
    }
    if (r > 6) {
        return {
            nextDayOverride: null,
            message: 'HIT class RPE > 6 counts as this week’s Lactate/HIT credit.'
        };
    }
    return {
        nextDayOverride: null,
        message: 'HIT class logged. Recovery looks manageable — keep hydration and sleep on point.'
    };
}

export function restSecFromHitClassRpe(rpe) {
    const r = Math.max(1, Math.min(10, Number(rpe) || 6));
    return Math.round(45 + (r - 1) * 15);
}
