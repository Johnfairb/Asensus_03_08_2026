import { store } from '../state/store.js';

export const SPORT_CATEGORIES = [
    'Field Team sports',
    'Indoor team sports',
    'Racket sports',
    'Water sports',
    'Winter sports',
    'Outdoor sports',
    'Combat sports',
    'Indoor individual sports',
    'General'
];

const ev = (id, role, label = id) => ({ id, role, label });

const PMT = [
    ev('Practice', 'practice'),
    ev('Technical session', 'practice'),
    ev('Match', 'match')
];
const PR = [ev('Practice', 'practice'), ev('Race', 'match')];
const PM = [ev('Practice', 'practice'), ev('Match', 'match')];
const BOXING = [
    ev('Technical Session', 'practice'),
    ev('Spar', 'practice'),
    ev('Fight', 'match')
];
const BJJ = [ev('Grappling', 'practice'), ev('Technical session', 'practice')];
const GYMNASTICS = [ev('Routine', 'practice'), ev('Competition', 'match')];
const COMP_ONLY = [ev('Competition', 'match')];
const PRACTICE_COMP = [ev('Practice', 'practice'), ev('Competition', 'match')];

const MUSCLE_FLAG = {
    adductors: 'groin',
    quads: 'quad',
    hamstrings: 'ham',
    'upper pecs': 'pec',
    pecs: 'pec',
    'lower back': 'lower_back',
    'rotator cuff': 'rotator_cuff',
    'glute medius': 'glute_medius',
    triceps: 'tricep',
    'front delts': 'front_delt',
    calves: 'calf',
    lats: 'lat',
    bicep: 'bicep',
    biceps: 'bicep'
};

function parseEnergy(energy) {
    if (energy === 4) return [1, 2, 3];
    if (Array.isArray(energy)) {
        if (energy.includes(4)) return [1, 2, 3];
        return energy.filter((n) => n === 1 || n === 2 || n === 3);
    }
    if (energy === 1 || energy === 2 || energy === 3) return [energy];
    return [1, 2, 3];
}

function flagsFromMuscles(muscles) {
    const flags = {
        quad: false,
        ham: false,
        groin: false,
        pec: false,
        lower_back: false,
        rotator_cuff: false,
        glute_medius: false,
        tricep: false,
        front_delt: false,
        calf: false,
        lat: false,
        bicep: false
    };
    (muscles || []).forEach((raw) => {
        const key = MUSCLE_FLAG[String(raw || '').trim().toLowerCase()];
        if (key) flags[key] = true;
    });
    flags.shoulder = !!(flags.rotator_cuff || flags.front_delt);
    flags.arm_imbalance = !!(flags.bicep || flags.tricep);
    return flags;
}

function defineSport({ category, muscles = [], energy = 4, events = [], sex = 'any' }) {
    return {
        category,
        muscles: [...muscles],
        energy: parseEnergy(energy),
        events: events.map((e) => ({ ...e })),
        sex,
        ...flagsFromMuscles(muscles)
    };
}

export const SPORT_MATRIX = {
    Football: defineSport({ category: 'Field Team sports', muscles: ['Adductors', 'Quads'], energy: 4, events: PMT }),
    Rugby: defineSport({ category: 'Field Team sports', muscles: ['Quads', 'hamstrings', 'upper pecs', 'lower back'], energy: 4, events: PMT }),
    Cricket: defineSport({ category: 'Field Team sports', muscles: ['Rotator cuff', 'glute medius'], energy: [1, 3], events: PMT }),
    'Field Hockey': defineSport({ category: 'Field Team sports', muscles: ['Lower back'], energy: 4, events: PMT }),
    Baseball: defineSport({ category: 'Field Team sports', muscles: ['Triceps', 'front delts'], energy: 1, events: PMT }),
    'Rugby sevens': defineSport({ category: 'Field Team sports', muscles: ['Quads', 'hamstrings', 'upper pecs', 'lower back'], energy: 4, events: PMT }),

    Netball: defineSport({ category: 'Indoor team sports', muscles: ['Front delts'], energy: 4, events: PMT }),
    Basketball: defineSport({ category: 'Indoor team sports', muscles: ['Front delts', 'calves'], energy: 4, events: PMT }),
    Volleyball: defineSport({ category: 'Indoor team sports', muscles: ['Calves', 'rotator cuff'], energy: [1, 3], events: PMT }),
    Futsal: defineSport({ category: 'Indoor team sports', muscles: ['Adductors', 'quads'], energy: 4, events: PMT }),
    Handball: defineSport({ category: 'Indoor team sports', muscles: ['Rotator cuff'], energy: 4, events: PMT }),

    Tennis: defineSport({ category: 'Racket sports', muscles: ['Rotator cuff'], energy: 4, events: PMT }),
    Badminton: defineSport({ category: 'Racket sports', energy: 4, events: PMT }),
    Padel: defineSport({ category: 'Racket sports', energy: 4, events: PMT }),
    'Table Tennis': defineSport({ category: 'Racket sports', energy: [1, 3], events: PMT }),
    Squash: defineSport({ category: 'Racket sports', energy: 4, events: PMT }),
    Pickleball: defineSport({ category: 'Racket sports', energy: [1, 3], events: PMT }),

    Swimming: defineSport({ category: 'Water sports', muscles: ['Lats', 'bicep'], energy: [1, 2], events: PR }),
    Rowing: defineSport({
        category: 'Water sports',
        muscles: ['Lats', 'bicep'],
        energy: [2, 3],
        events: [...PR, ev('Erg session', 'practice')]
    }),
    'Water polo': defineSport({ category: 'Water sports', muscles: ['Lats', 'bicep'], energy: 4, events: PM }),
    Surfing: defineSport({ category: 'Water sports', muscles: ['Pecs', 'tricep'], energy: 1, events: [ev('Surf', 'match')] }),
    Sailing: defineSport({ category: 'Water sports', energy: 3, events: PR }),
    Kayaking: defineSport({ category: 'Water sports', muscles: ['Lats'], energy: 3, events: [ev('Kayak', 'match')] }),
    Diving: defineSport({
        category: 'Water sports',
        energy: 1,
        events: [ev('Technical session', 'practice'), ev('Competition', 'match')]
    }),

    Skiing: defineSport({
        category: 'Winter sports',
        muscles: ['Quads', 'lower back'],
        energy: 2,
        events: [ev('Practice run', 'practice'), ev('Race', 'match')]
    }),
    Snowboarding: defineSport({
        category: 'Winter sports',
        muscles: ['Quads'],
        energy: 2,
        events: [ev('Practice run', 'practice'), ev('Race', 'match')]
    }),
    'Ice Skating': defineSport({ category: 'Winter sports', energy: [1, 2], events: PRACTICE_COMP }),
    'Ice hockey': defineSport({ category: 'Winter sports', energy: 4, events: PM }),
    'Cross country skiing': defineSport({ category: 'Winter sports', muscles: ['Quads'], energy: 3, events: PR }),

    Golf: defineSport({ category: 'Outdoor sports', muscles: ['Lower back'], energy: 3, events: PM }),
    'Cycling (road)': defineSport({ category: 'Outdoor sports', muscles: ['Quads', 'calves'], energy: 3, events: PR }),
    Hiking: defineSport({ category: 'Outdoor sports', energy: 3, events: [ev('Hike', 'practice')] }),
    Jogging: defineSport({ category: 'Outdoor sports', muscles: ['Hamstrings'], energy: 3, events: [ev('Run', 'practice')] }),
    'Marathon running': defineSport({ category: 'Outdoor sports', muscles: ['Hamstrings'], energy: 3, events: PR }),
    Horseriding: defineSport({
        category: 'Outdoor sports',
        muscles: ['Adductors'],
        energy: 3,
        events: [ev('Riding', 'practice'), ev('Race', 'match'), ev('Performance', 'match')]
    }),
    Polo: defineSport({ category: 'Outdoor sports', muscles: ['Adductors', 'lower back'], energy: 3, events: PM }),
    Archery: defineSport({ category: 'Outdoor sports', energy: 3, events: PRACTICE_COMP }),
    Airsoft: defineSport({ category: 'Outdoor sports', energy: 2, events: [ev('Round', 'match')] }),
    Parkour: defineSport({
        category: 'Outdoor sports',
        muscles: ['Lats', 'biceps'],
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Route', 'match')]
    }),
    Mountaineering: defineSport({
        category: 'Outdoor sports',
        muscles: ['Lats', 'bicep'],
        energy: 4,
        events: [ev('Practice', 'practice'), ev('Climb', 'match')]
    }),
    'Rock climbing': defineSport({
        category: 'Outdoor sports',
        muscles: ['Lats', 'bicep'],
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Climb', 'match')]
    }),
    Skateboarding: defineSport({ category: 'Outdoor sports', energy: 2, events: PRACTICE_COMP }),
    'Ultimate frisbee': defineSport({ category: 'Outdoor sports', energy: 2, events: PM }),
    'Roller skating': defineSport({
        category: 'Outdoor sports',
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Skate', 'match')]
    }),

    Boxing: defineSport({
        category: 'Combat sports',
        muscles: ['Front delts', 'pecs', 'triceps'],
        energy: 4,
        events: BOXING
    }),
    MMA: defineSport({ category: 'Combat sports', energy: 4, events: BOXING }),
    Wrestling: defineSport({
        category: 'Combat sports',
        muscles: ['Biceps', 'lats', 'hamstrings', 'lower back'],
        energy: 4,
        events: PRACTICE_COMP
    }),
    'Jiu-Jitsu': defineSport({
        category: 'Combat sports',
        muscles: ['Biceps', 'lats', 'hamstrings'],
        energy: 4,
        events: BJJ
    }),
    Kickboxing: defineSport({
        category: 'Combat sports',
        muscles: ['Triceps', 'pecs', 'front delts', 'quads'],
        energy: 4,
        events: BOXING
    }),
    'Muay Thai': defineSport({
        category: 'Combat sports',
        muscles: ['Triceps', 'pecs', 'front delts', 'quads'],
        energy: 4,
        events: BOXING
    }),
    Fencing: defineSport({
        category: 'Combat sports',
        muscles: ['Triceps', 'pecs', 'quads'],
        energy: 4,
        events: PRACTICE_COMP
    }),
    Judo: defineSport({
        category: 'Combat sports',
        muscles: ['Biceps', 'lats', 'hamstrings'],
        energy: 4,
        events: BJJ
    }),
    Karate: defineSport({
        category: 'Combat sports',
        muscles: ['Quads', 'adductors'],
        energy: 4,
        events: PRACTICE_COMP
    }),

    'Gymnastics (All-around)': defineSport({
        category: 'Indoor individual sports',
        energy: [1, 2],
        events: GYMNASTICS
    }),
    'Gymnastics (floor exercise)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Calves', 'front delts'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'any'
    }),
    'Gymnastics (pommel horse)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Pecs', 'triceps', 'front delts'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'male'
    }),
    'Gymnastics (Rings)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Lats', 'biceps', 'Pecs', 'triceps'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'male'
    }),
    'Gymnastics (Vault)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Calves', 'front delts', 'triceps'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'any'
    }),
    'Gymnastics (horizontal bar)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Lats', 'Biceps'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'male'
    }),
    'Gymnastics (parallel bars)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Front delts', 'biceps', 'triceps'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'male'
    }),
    'Gymnastics (uneven bars)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Lats', 'biceps', 'triceps'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'female'
    }),
    'Gymnastics (balance beam)': defineSport({
        category: 'Indoor individual sports',
        muscles: ['Glute medius', 'Quads'],
        energy: [1, 2],
        events: GYMNASTICS,
        sex: 'female'
    }),
    'Cycling (track)': defineSport({ category: 'Indoor individual sports', muscles: ['Quads'], energy: [1, 2], events: PR }),
    Bouldering: defineSport({ category: 'Indoor individual sports', muscles: ['Lats', 'biceps'], energy: [1, 2], events: PR }),

    'General fitness': defineSport({ category: 'General', energy: 4, events: [] }),
    Hyrox: defineSport({ category: 'General', energy: [2, 3], events: COMP_ONLY }),
    Crossfit: defineSport({ category: 'General', energy: 4, events: COMP_ONLY }),
    Darts: defineSport({ category: 'General', energy: 3, events: PRACTICE_COMP }),
    Cheerleading: defineSport({
        category: 'General',
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Routine', 'match')]
    }),
    Breakdancing: defineSport({
        category: 'General',
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Routine', 'match')]
    }),
    Dancing: defineSport({
        category: 'General',
        energy: 2,
        events: [ev('Practice', 'practice'), ev('Routine', 'match')]
    })
};

SPORT_MATRIX.None = SPORT_MATRIX['General fitness'];

const GYMNASTICS_APPARATUS = Object.keys(SPORT_MATRIX).filter((name) => (
    name.startsWith('Gymnastics (') && name !== 'Gymnastics (All-around)'
));

function normalizeSex(sex) {
    const s = String(sex || store.userConfig?.sex || 'Male').toLowerCase();
    if (s.startsWith('f')) return 'female';
    return 'male';
}

function allAroundMuscles(sex) {
    const want = normalizeSex(sex);
    const muscles = [];
    GYMNASTICS_APPARATUS.forEach((name) => {
        const data = SPORT_MATRIX[name];
        if (!data) return;
        if (data.sex !== 'any' && data.sex !== want) return;
        (data.muscles || []).forEach((m) => {
            if (!muscles.includes(m)) muscles.push(m);
        });
    });
    return muscles;
}

export function resolveSportKey(name) {
    if (!name || name === 'None') return 'General fitness';
    if (SPORT_MATRIX[name]) return name;
    return 'General fitness';
}

export function isGeneralFitnessSport(name) {
    return resolveSportKey(name) === 'General fitness';
}

export function getSportData(name = store.userConfig?.sport, sex = store.userConfig?.sex) {
    const key = resolveSportKey(name);
    const base = SPORT_MATRIX[key] || SPORT_MATRIX['General fitness'];
    if (key !== 'Gymnastics (All-around)') return base;
    const muscles = allAroundMuscles(sex);
    return {
        ...base,
        muscles,
        ...flagsFromMuscles(muscles)
    };
}

export function migrateUserSport() {
    const next = resolveSportKey(store.userConfig?.sport);
    if (store.userConfig && store.userConfig.sport !== next) store.userConfig.sport = next;
    return next;
}

export function sportVisibleForSex(sportName, sex = store.userConfig?.sex) {
    const data = SPORT_MATRIX[sportName];
    if (!data) return false;
    if (!data.sex || data.sex === 'any') return true;
    return data.sex === normalizeSex(sex);
}

export function listSportsForSelect(sex = store.userConfig?.sex, keepName = '') {
    const keep = keepName && SPORT_MATRIX[keepName] ? keepName : '';
    return Object.keys(SPORT_MATRIX).filter((name) => {
        if (name === 'None') return false;
        return sportVisibleForSex(name, sex) || name === keep;
    });
}

export function getSportEvents(name = store.userConfig?.sport) {
    return (getSportData(name).events || []).slice();
}

export function sportEventRole(eventName, sportName = store.userConfig?.sport) {
    if (!eventName || typeof eventName !== 'string') return null;
    if (eventName === 'Game' || eventName === 'Match') return 'match';
    if (eventName === 'Practice') return 'practice';
    const current = getSportEvents(sportName);
    const hit = current.find((e) => e.id === eventName || e.label === eventName);
    if (hit) return hit.role;
    let found = null;
    for (const key of Object.keys(SPORT_MATRIX)) {
        if (key === 'None') continue;
        const evHit = (SPORT_MATRIX[key].events || []).find((e) => e.id === eventName || e.label === eventName);
        if (!evHit) continue;
        if (!found) found = evHit.role;
        else if (found !== evHit.role) return null;
    }
    return found;
}

export function isPracticeEvent(e) {
    return sportEventRole(e) === 'practice';
}

export function isGameEvent(e) {
    return sportEventRole(e) === 'match';
}

export function isSportEvent(e) {
    const role = sportEventRole(e);
    return role === 'practice' || role === 'match';
}

export function sportEventLabel(eventName, sportName = store.userConfig?.sport) {
    if (!eventName) return eventName;
    if (eventName === 'Game') return 'Match';
    const hit = getSportEvents(sportName).find((e) => e.id === eventName || e.label === eventName);
    if (hit) return hit.label;
    return eventName;
}

export function sameSportEvent(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const generic = (n) => n === 'Match' || n === 'Game';
    return generic(a) && generic(b);
}

export function sportHasEnergy(system, sport = getSportData()) {
    return (sport?.energy || []).includes(system);
}

export function getSportWeeklyQuotas(sport = getSportData()) {
    const energy = sport?.energy || [1, 2, 3];
    return {
        power: energy.includes(1) ? 1 : 0,
        lactate: energy.includes(2) ? 2 : 1,
        steady: energy.includes(3) ? 2 : 1
    };
}

function escapeAttr(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
}

export function sportSelectOptionsHtml(selected, sex = store.userConfig?.sex) {
    const current = resolveSportKey(selected);
    const names = listSportsForSelect(sex, current);
    const byCat = {};
    SPORT_CATEGORIES.forEach((cat) => { byCat[cat] = []; });
    names.forEach((name) => {
        const cat = SPORT_MATRIX[name]?.category || 'General';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(name);
    });
    let html = '';
    SPORT_CATEGORIES.forEach((cat) => {
        const list = byCat[cat] || [];
        if (!list.length) return;
        html += `<optgroup label="${escapeAttr(cat)}">`;
        list.forEach((name) => {
            html += `<option value="${escapeAttr(name)}"${name === current ? ' selected' : ''}>${escapeAttr(name)}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

export function sportEventSelectOptionsHtml({
    selected = '',
    includeNone = false,
    includeRest = false,
    noneLabel = 'None',
    sportName = store.userConfig?.sport
} = {}) {
    const events = getSportEvents(sportName);
    let html = '';
    if (includeNone) {
        const noneSel = !selected || selected === 'None';
        html += `<option value="None"${noneSel ? ' selected' : ''}>${escapeAttr(noneLabel)}</option>`;
    }
    events.forEach((event) => {
        const sel = selected === event.id
            || selected === event.label
            || ((selected === 'Game' || selected === 'Match') && event.id === 'Match');
        html += `<option value="${escapeAttr(event.id)}"${sel ? ' selected' : ''}>${escapeAttr(event.label)}</option>`;
    });
    if (includeRest) {
        html += `<option value="Rest"${selected === 'Rest' ? ' selected' : ''}>Cannot Workout / Rest</option>`;
    }
    return html;
}

const TRAINING_EVENT_OPTIONS = [
    { value: 'Lactate', label: 'Lactate/HIT' },
    { value: 'Cardio (Steady)', label: 'Steady State' },
    { value: 'Full Body / Strength', label: 'Gym / Strength' },
    { value: 'Full Body / Power', label: 'Power' }
];

export function spontaneousEventSelectOptionsHtml(selected = '', sportName = store.userConfig?.sport) {
    let html = sportEventSelectOptionsHtml({ selected, sportName });
    TRAINING_EVENT_OPTIONS.forEach((opt) => {
        html += `<option value="${escapeAttr(opt.value)}"${selected === opt.value ? ' selected' : ''}>${escapeAttr(opt.label)}</option>`;
    });
    return html;
}

function fillSelect(el, html, preferred) {
    if (!el) return;
    const prev = preferred != null ? preferred : el.value;
    el.innerHTML = html;
    if (prev && [...el.options].some((o) => o.value === prev)) el.value = prev;
}

export function populateSportSelects() {
    migrateUserSport();
    const sport = resolveSportKey(store.userConfig?.sport);
    const sex = store.userConfig?.sex;
    fillSelect(document.getElementById('set-sport'), sportSelectOptionsHtml(sport, sex), sport);
    fillSelect(document.getElementById('ob-sport'), sportSelectOptionsHtml(sport, document.getElementById('ob-sex')?.value || sex), sport);
    fillSelect(document.getElementById('sched-event'), sportEventSelectOptionsHtml({
        includeRest: true,
        sportName: sport
    }));
    fillSelect(document.getElementById('cal-event-select'), sportEventSelectOptionsHtml({
        includeNone: true,
        includeRest: true,
        noneLabel: 'Clear Event',
        sportName: sport
    }));
    fillSelect(document.getElementById('spontaneous-type'), spontaneousEventSelectOptionsHtml('', sport));
}

export const AUXILIARY_DICTIONARY = {
    rotator_cuff: ['Cable Abduction/Adduction', 'Lateral Raises', 'DB Bench Press'],
    groin: ['Cable Adductor'],
    glute_medius: ['Glute Abduction Machine', 'Cable Abduction'],
    ankle: ['3-Way Ankle (Controlled Eccentric)', 'Wobble Board Proprioception'],
    core: ['Marcasciano Crunch', 'Knee Raise Machine'],
    serratus: ['DB Pullovers'],
    neck: ['Neck Resistance (Isometric)'],
    elbow: ['Bicep Curls', 'Reverse Curls', 'DB Wrist Flexion'],
    hamstring: ['Single Leg Deadlift', 'Hamstring Curls'],
    quad: ['Leg Extension'],
    calf: ['Calf Raise Machine'],
    front_delt: ['Standing Dumbbell Front Raise'],
    tricep: ['Rope Push Down'],
    pec: ['Flye'],
    lat: ['Lat Machine Pull'],
    bicep: ['Dumbbell Curl'],
    lower_back: ['Side-sit on Hyperextension Bench']
};

export const BAND_AUXILIARY_DICTIONARY = {
    rotator_cuff: ['Band Pull-Aparts', 'Band External Rotation', 'Band Face Pulls'],
    groin: ['Band Lateral Walks', 'Band Adduction'],
    glute_medius: ['Band Monster Walks', 'Band Clamshells'],
    ankle: ['Band Ankle Inversion/Eversion', 'Band Dorsiflexion'],
    core: ['Band Pallof Press', 'Dead Bug (Band)'],
    serratus: ['Band Serratus Punch'],
    neck: ['Band Neck Isometrics'],
    elbow: ['Band Curls', 'Band Reverse Curls'],
    hamstring: ['Band Hamstring Curl', 'Single Leg RDL (Band)'],
    quad: ['Band Terminal Knee Extensions'],
    calf: ['Band Calf Raise'],
    front_delt: ['Band Front Raise'],
    tricep: ['Band Pushdown'],
    pec: ['Band Chest Flye'],
    lat: ['Band Lat Pulldown'],
    bicep: ['Band Curls'],
    lower_back: ['Band Side Plank Row']
};
