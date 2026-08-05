import { store } from '../state/store.js';
import { calculateTDEE } from '../domain/thermodynamics.js';
import { loadHistory } from '../ui/journey.js';

export function checkMidnightRollover() {
    const today = new Date().toDateString();
    const lastActive = localStorage.getItem('ascensus_last_active');
    if(lastActive && lastActive !== today) {
        store.currentRefund = {cals: 0, carbs: 0};
        store.consumedToday = { cals: 0, pro: 0, carb: 0, fat: 0, cost: 0, mealsLogged: 0 };
        window.weightLoggedToday = false;
        calculateTDEE();
        loadHistory(); 
    }
    localStorage.setItem('ascensus_last_active', today);
}
