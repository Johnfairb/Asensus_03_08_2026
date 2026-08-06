import { store } from '../state/store.js';
import { PERIODIZATION } from './fitness-hud.js';
import { addDaysISO, dateToISO, getMondayISO } from './route-planner.js';
import { saveSettings } from './thermodynamics.js';

// ==========================================
// 14.5. AUTO-PERIODIZATION & REPAIR ENGINE
// ==========================================
export function saveSeasonDates() {
    store.userConfig.seasonDates = {
        off: document.getElementById('date-offseason').value,
        pre: document.getElementById('date-preseason').value,
        in: document.getElementById('date-inseason').value
    };
    document.getElementById('periodization-modal').classList.add('hidden');
    checkAutoSeason();
    saveSettings();
    alert("Macro-Periodization Locked. GPS will now automatically shift your phases.");
}

export function clearSeasonDates() {
    store.userConfig.seasonDates = null;
    document.getElementById('periodization-modal').classList.add('hidden');
    saveSettings();
}

export function checkAutoSeason() {
    if (!store.userConfig.seasonDates || !store.userConfig.seasonDates.off || !store.userConfig.seasonDates.pre || !store.userConfig.seasonDates.in) return;
    
    const today = new Date();
    const off = new Date(store.userConfig.seasonDates.off);
    const pre = new Date(store.userConfig.seasonDates.pre);
    const inSeason = new Date(store.userConfig.seasonDates.in);
    
    let newPhase = 'OffSeason_Hypertrophy';
    if (today >= inSeason) newPhase = 'OffSeason_Hypertrophy';
    else if (today >= pre) newPhase = 'PreSeason_Power';
    else if (today >= off) newPhase = 'OffSeason_Strength';
    
    // Migrate removed In-Season Maintenance phase
    if (store.userConfig.seasonPhase === 'InSeason_Maintenance') {
        store.userConfig.seasonPhase = 'OffSeason_Hypertrophy';
    }

    if (store.userConfig.seasonPhase !== newPhase) {
        store.userConfig.seasonPhase = newPhase;
        const select = document.getElementById('set-season-phase');
        if (select) select.value = newPhase;
        saveSettings();
        alert(`📅 SEASON SHIFT: You have entered the ${newPhase.split('_')[1]} Phase. Route recalibrated.`);
    }
}
// Run check on boot
setTimeout(checkAutoSeason, 2000);

export function injuryAreaLabel(area) {
    if (area === 'LowerBack') return 'Lower Back';
    if (area === 'Shoulder') return 'Shoulder';
    if (area === 'Knee') return 'Knee';
    return area || 'Injury';
}

export function repairLevelMeaning(level, area) {
    const isLower = area === 'LowerBack' || area === 'Knee';
    const map = isLower ? {
        1: 'Can you walk pain free?',
        2: 'Can you squat (full depth) pain free?',
        3: 'Can you jog pain free?',
        4: 'Can you complete a dynamic warmup pain free?'
    } : {
        1: 'Can the joint be moved pain free?',
        2: 'Can you do a push up / pull up pain free?',
        3: 'Can you do an explosive push up pain free?',
        4: 'Can you complete a dynamic warmup pain free?'
    };
    return map[level] || '';
}

export function daysBetweenISO(startISO, endISO) {
    if (!startISO || !endISO) return 0;
    const a = new Date(startISO + 'T12:00:00');
    const b = new Date(endISO + 'T12:00:00');
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
}

export function ensureInjuryRecordShape() {
    if (!store.userConfig.injuryRecord || typeof store.userConfig.injuryRecord !== 'object') {
        store.userConfig.injuryRecord = null;
    }
}

/** True from the Monday after injury was cleared until pain is logged once. */
export function needsInjuryPainFollowUp(dateISO) {
    ensureInjuryRecordShape();
    const rec = store.userConfig.injuryRecord;
    if (!rec || rec.followUpComplete || !rec.followUpWeekStart) return false;
    if (store.userConfig.injury && store.userConfig.injury !== 'None') return false;
    const today = dateISO || dateToISO(new Date());
    return today >= rec.followUpWeekStart;
}

/** Map diary pain 0–10 → repair level (1–4). 0–2 = normal (4). */
export function painScoreToRepairLevel(pain) {
    const p = Math.max(0, Math.min(10, Math.round(Number(pain))));
    if (p >= 8) return 1;
    if (p >= 5) return 2; // 5–7
    if (p >= 3) return 3; // 3–4 (5 claimed by band above)
    return 4;             // 0–2 normal
}

export function applyInjuryPainFollowUpFromJournal() {
    if (!needsInjuryPainFollowUp()) return true;
    const input = document.getElementById('journal-injury-pain');
    if (!input) return true;
    const raw = input.value;
    if (raw === '' || raw == null) {
        alert('Please rate injury-area pain (0–10) to complete your follow-up.');
        return false;
    }
    const pain = Math.max(0, Math.min(10, parseFloat(raw)));
    if (isNaN(pain)) {
        alert('Please enter a valid pain score from 0 to 10.');
        return false;
    }

    ensureInjuryRecordShape();
    const rec = store.userConfig.injuryRecord || {};
    const area = rec.area || 'Shoulder';
    const level = painScoreToRepairLevel(pain);
    rec.lastPainScore = pain;
    rec.followUpComplete = true;
    rec.followUpCompletedAt = dateToISO(new Date());
    store.userConfig.injuryRecord = rec;

    if (level >= 4) {
        store.userConfig.injury = 'None';
        store.userConfig.repairLevel = 4;
        const sel = document.getElementById('set-injury');
        if (sel) sel.value = 'None';
        alert(`Pain ${pain}/10 → normal function restored. Repair Mode cleared.`);
    } else {
        store.userConfig.injury = area;
        store.userConfig.repairLevel = level;
        const sel = document.getElementById('set-injury');
        if (sel) sel.value = area;
        // Re-open active injury tracking from today
        store.userConfig.injuryRecord = {
            area,
            startedAt: dateToISO(new Date()),
            clearedAt: null,
            durationDays: null,
            followUpWeekStart: null,
            followUpComplete: true,
            lastPainScore: pain,
            priorDurationDays: rec.durationDays
        };
        alert(`Pain ${pain}/10 → Repair Level ${level}/4 (${repairLevelMeaning(level, area)}).\nWeights throttled and Prehab injected.`);
    }
    saveSettings();
    updateInjuryStatusPanel();
    return true;
}

export function beginInjuryTracking(area) {
    const today = dateToISO(new Date());
    store.userConfig.injuryRecord = {
        area,
        startedAt: today,
        clearedAt: null,
        durationDays: null,
        followUpWeekStart: null,
        followUpComplete: false,
        lastPainScore: null
    };
}

export function clearInjuryAndScheduleFollowUp() {
    ensureInjuryRecordShape();
    const rec = store.userConfig.injuryRecord;
    const today = dateToISO(new Date());
    if (rec && rec.area && rec.startedAt && !rec.clearedAt) {
        const durationDays = daysBetweenISO(rec.startedAt, today);
        // Follow-up runs the calendar week AFTER the week of clearance
        const clearMonday = getMondayISO(new Date(today + 'T12:00:00'));
        const followUpWeekStart = addDaysISO(clearMonday, 7);
        store.userConfig.injuryRecord = {
            ...rec,
            clearedAt: today,
            durationDays,
            followUpWeekStart,
            followUpComplete: false
        };
    } else if (rec && rec.area) {
        const clearMonday = getMondayISO(new Date(today + 'T12:00:00'));
        store.userConfig.injuryRecord = {
            ...rec,
            clearedAt: today,
            durationDays: rec.durationDays != null ? rec.durationDays : daysBetweenISO(rec.startedAt || today, today),
            followUpWeekStart: addDaysISO(clearMonday, 7),
            followUpComplete: false
        };
    }
    store.userConfig.repairLevel = 4;
}

export function updateInjuryStatusPanel() {
    const panel = document.getElementById('injury-status-panel');
    if (!panel) return;
    ensureInjuryRecordShape();
    const injury = store.userConfig.injury || 'None';
    const rec = store.userConfig.injuryRecord;
    const level = store.userConfig.repairLevel != null ? store.userConfig.repairLevel : 4;

    if (injury !== 'None') {
        const started = rec && rec.area === injury && rec.startedAt && !rec.clearedAt
            ? rec.startedAt
            : (rec && rec.startedAt && !rec.clearedAt ? rec.startedAt : null);
        const today = dateToISO(new Date());
        const days = started ? daysBetweenISO(started, today) : 0;
        const meaning = repairLevelMeaning(level, injury);
        panel.innerHTML = `
            <div style="color:var(--gold-accent); margin-bottom:4px;">Active · ${injuryAreaLabel(injury)} · ${days} day${days === 1 ? '' : 's'}</div>
            <div>Repair Level <strong style="color:var(--text-main);">${level}/4</strong>${meaning ? ` — ${meaning}` : ''}</div>
            <div style="margin-top:6px; opacity:0.85;">L1 joint/walk · L2 strength · L3 explosive/jog · L4 dynamic warmup (normal)</div>
        `;
        return;
    }

    if (needsInjuryPainFollowUp()) {
        const days = rec.durationDays != null ? rec.durationDays : '—';
        panel.innerHTML = `
            <div style="color:var(--gold-accent);">Cleared · ${injuryAreaLabel(rec.area)} lasted ${days} day${days === 1 ? '' : 's'}</div>
            <div>Pain scale (0–10) due in diary this week to recalibrate Repair Mode.</div>
        `;
        return;
    }

    if (rec && rec.clearedAt && rec.durationDays != null) {
        panel.innerHTML = `<div>Last injury (${injuryAreaLabel(rec.area)}) lasted ${rec.durationDays} day${rec.durationDays === 1 ? '' : 's'}.</div>`;
        return;
    }

    panel.innerHTML = '';
}

export function triggerRepairModeCheck() {
    const injury = document.getElementById('set-injury').value;
    const prev = store.userConfig.injury || 'None';

    if (injury === 'None') {
        if (prev !== 'None') clearInjuryAndScheduleFollowUp();
        else store.userConfig.repairLevel = 4;
        store.userConfig.injury = 'None';
        saveSettings();
        updateInjuryStatusPanel();
        return;
    }

    // New or changed injury area → start / restart duration clock
    if (prev !== injury || !store.userConfig.injuryRecord || store.userConfig.injuryRecord.clearedAt || store.userConfig.injuryRecord.area !== injury) {
        beginInjuryTracking(injury);
    }
    store.userConfig.injury = injury;

    const container = document.getElementById('repair-questions-container');
    let qHTML = '';

    if (injury === 'LowerBack' || injury === 'Knee') {
        qHTML = `
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q1" style="width:16px; height:16px;"> Can you walk pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q2" style="width:16px; height:16px;"> Can you squat (full depth) pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q3" style="width:16px; height:16px;"> Can you jog pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q4" style="width:16px; height:16px;"> Can you complete a dynamic warmup pain free?</label>
        `;
    } else if (injury === 'Shoulder') {
        qHTML = `
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q1" style="width:16px; height:16px;"> Can the joint be moved pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q2" style="width:16px; height:16px;"> Can you do a push up / pull up pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q3" style="width:16px; height:16px;"> Can you do an explosive push up pain free?</label>
            <label style="display:flex; gap:10px; color:var(--text-main); font-size:12px; margin:0;"><input type="checkbox" id="rep-q4" style="width:16px; height:16px;"> Can you complete a dynamic warmup pain free?</label>
        `;
    }

    container.innerHTML = qHTML;
    document.getElementById('repair-mode-modal').classList.remove('hidden');
    updateInjuryStatusPanel();
}

export function submitRepairAssessment() {
    let score = 0;
    if (document.getElementById('rep-q1').checked) score++;
    if (document.getElementById('rep-q2').checked) score++;
    if (document.getElementById('rep-q3').checked) score++;
    if (document.getElementById('rep-q4').checked) score++;

    // If they checked nothing, they are at level 1 (severely restricted)
    // Score 1–4 maps to repair levels 1–4 (L1 = joint/walk, L4 = dynamic warmup)
    store.userConfig.repairLevel = score === 0 ? 1 : score;
    store.userConfig.injury = document.getElementById('set-injury').value;

    document.getElementById('repair-mode-modal').classList.add('hidden');
    saveSettings();
    updateInjuryStatusPanel();
    const meaning = repairLevelMeaning(store.userConfig.repairLevel, store.userConfig.injury);
    alert(`Diagnostics complete. Repair Level: ${store.userConfig.repairLevel}/4${meaning ? ` — ${meaning}` : ''}.\nWeights throttled and Prehab injected into route.`);
}

