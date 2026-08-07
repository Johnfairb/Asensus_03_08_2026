import { store } from '../state/store.js';

export const SPORT_MATRIX = {
    'None': { quad: false, ham: false, groin: false, ankle: false, shoulder: false, knee: false, elbow: false, arm_imbalance: false, cardio: 'steady' },
    'Football': { quad: true, ham: true, groin: true, ankle: true, shoulder: true, knee: false, elbow: false, arm_imbalance: false, cardio: 'anaerobic' },
    'Basketball': { quad: false, ham: false, groin: false, ankle: true, shoulder: true, knee: true, elbow: true, lanky: true, arm_imbalance: false, cardio: 'anaerobic' },
    'Rugby': { quad: true, ham: false, groin: false, ankle: true, shoulder: true, knee: false, neck: true, elbow: false, arm_imbalance: false, cardio: 'positional' },
    'Volleyball': { quad: false, ham: false, groin: false, ankle: false, shoulder: true, knee: true, calf: true, elbow: false, arm_imbalance: true, cardio: 'anaerobic' },
    'Cricket': { quad: false, ham: false, groin: false, ankle: false, shoulder: true, lower_back: true, knee: false, elbow: false, arm_imbalance: true, cardio: 'low' },
    'Tennis': { quad: false, ham: false, groin: false, ankle: true, shoulder: true, knee: true, elbow: true, arm_imbalance: true, cardio: 'aerobic' }
};

export const AUXILIARY_DICTIONARY = {
    rotator_cuff: ["Cable Abduction/Adduction", "Lateral Raises", "DB Bench Press"],
    groin: ["Cable Adductor"],
    glute_medius: ["Glute Abduction Machine", "Cable Abduction"], 
    ankle: ["3-Way Ankle (Controlled Eccentric)", "Wobble Board Proprioception"],
    core: ["Marcasciano Crunch", "Knee Raise Machine"],
    serratus: ["DB Pullovers"], 
    neck: ["Neck Resistance (Isometric)"],
    elbow: ["Bicep Curls", "Reverse Curls", "DB Wrist Flexion"],
    hamstring: ["Single Leg Deadlift", "Hamstring Curls"]
};

// Band-friendly auxiliary alternatives (home / no-machine work)
export const BAND_AUXILIARY_DICTIONARY = {
    rotator_cuff: ["Band Pull-Aparts", "Band External Rotation", "Band Face Pulls"],
    groin: ["Band Lateral Walks", "Band Adduction"],
    glute_medius: ["Band Monster Walks", "Band Clamshells"],
    ankle: ["Band Ankle Inversion/Eversion", "Band Dorsiflexion"],
    core: ["Band Pallof Press", "Dead Bug (Band)"],
    serratus: ["Band Serratus Punch"],
    neck: ["Band Neck Isometrics"],
    elbow: ["Band Curls", "Band Reverse Curls"],
    hamstring: ["Band Hamstring Curl", "Single Leg RDL (Band)"]
};

