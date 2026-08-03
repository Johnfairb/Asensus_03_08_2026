import { store } from '../state/store.js';

// ==========================================
// 12. DATA EXPORT & DEMO INJECTOR
// ==========================================
export async function exportData() {
    const status = document.getElementById('export-status');
    status.innerText = "Fetching data from cloud...";
    try {
        const [foodsRes, workoutsRes, metricsRes, templatesRes] = await Promise.all([
            store.supabaseClient.from('food_logs').select('*'), store.supabaseClient.from('workout_logs').select('*'),
            store.supabaseClient.from('body_metrics').select('*'), store.supabaseClient.from('user_templates').select('*')
        ]);
        const exportObj = {
            app_name: "Ascensus", export_date: new Date().toISOString(), local_settings: store.userConfig,
            database: { food_inventory: store.globalFoodDB, exercise_inventory: store.globalExerciseDB, user_templates: templatesRes.data || [], food_logs: foodsRes.data || [], workout_logs: workoutsRes.data || [], body_metrics: metricsRes.data || [] }
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `ascensus_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        status.innerText = "✅ Export Successful!"; setTimeout(() => { status.innerText = ""; }, 3000);
    } catch (err) { status.innerText = "❌ Export Failed."; }
}

export async function injectPitchData(filename) {
    const status = document.getElementById('demo-status');
    if(!confirm("WARNING: This will wipe your entire database and generate 28 days of simulated history. Proceed?")) return;
    status.innerText = "⏳ Downloading Demo Profile...";

    try {
        const path = filename.startsWith('data/') ? filename : `data/${filename}`;
        const response = await fetch(path);
        if(!response.ok) throw new Error("Could not load JSON.");
        const data = await response.json();

        status.innerText = "⏳ Wiping Database...";
        store.userConfig = { ...store.userConfig, ...data.settings };
        localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));

        await Promise.all([
            store.supabaseClient.from('food_inventory').delete().neq('id', 0), store.supabaseClient.from('exercise_inventory').delete().neq('id', 0),
            store.supabaseClient.from('food_logs').delete().neq('id', 0), store.supabaseClient.from('workout_logs').delete().neq('id', 0), store.supabaseClient.from('body_metrics').delete().neq('id', 0)
        ]);

        status.innerText = "⏳ Planting Inventories...";
        await store.supabaseClient.from('food_inventory').insert(data.food_inventory);
        await store.supabaseClient.from('exercise_inventory').insert(data.exercise_inventory);

        status.innerText = "⏳ Generating 28 Days of History...";
        let bodyPayload = []; let foodPayload = []; let workPayload = [];
        const startW = data.base_metrics.start_weight; const endW = data.base_metrics.end_weight;
        const baseTotalCals = data.base_meals.reduce((sum, m) => sum + m.cals, 0);

        for (let i = 27; i >= 0; i--) {
            let d = new Date(); d.setDate(d.getDate() - i);
            let isoDate = d.toISOString();
            let dayOfWeek = d.getDay(); 

            let currentW = startW - ((startW - endW) / 28) * (28 - i);
            currentW += (Math.random() * 0.8 - 0.4);
            bodyPayload.push({ weight_kg: parseFloat(currentW.toFixed(1)), created_at: isoDate });

            let BMR = (10 * currentW) + (6.25 * store.userConfig.height) - (5 * store.userConfig.age);
            BMR += (store.userConfig.sex === 'Male') ? 5 : -161;
            let historicalTDEE = BMR * store.userConfig.activity;
            let historicalTargetCals = historicalTDEE;
            
            if (store.userConfig.goal === 'Fat_Loss') historicalTargetCals = Math.max(BMR, historicalTDEE - 500); 
            else if (store.userConfig.goal === 'Muscle_Gain') historicalTargetCals = historicalTDEE + 300;
            
            let calorieScale = historicalTargetCals / baseTotalCals;

            data.base_meals.forEach(meal => {
                let jitter = 1 + (Math.random() * 0.1 - 0.05);
                foodPayload.push({
                    meal_name: meal.meal_name, 
                    calories: Math.round(meal.cals * calorieScale * jitter), 
                    protein: Math.round(meal.pro * calorieScale * jitter),
                    carbs: Math.round(meal.carb * calorieScale * jitter), 
                    fat: Math.round(meal.fat * calorieScale * jitter), 
                    cost: parseFloat((meal.cost * jitter).toFixed(2)),
                    food_details: "[]", 
                    created_at: isoDate
                });
            });

            let todaysWorkouts = data.base_workouts.filter(w => w.day === dayOfWeek);
            todaysWorkouts.forEach(w => {
                let prog = (28 - i) / 28; 
                let wgt = w.base_weight + (w.base_weight * 0.15 * prog); 
                let dist = w.base_distance + (w.base_distance * 0.2 * prog);
                for(let s=1; s<=w.sets; s++) {
                    workPayload.push({
                        exercise: w.exercise, sets: s, reps: w.reps, weight_kg: parseFloat(wgt.toFixed(1)),
                        distance_km: parseFloat(dist.toFixed(1)), time_minutes: w.time_minutes, rpe: w.base_rpe,
                        type: w.type, created_at: isoDate
                    });
                }
            });
        }

        status.innerText = "⏳ Uploading History to Cloud...";
        const chunkSize = 50;
        for (let i=0; i<bodyPayload.length; i+=chunkSize) await store.supabaseClient.from('body_metrics').insert(bodyPayload.slice(i, i+chunkSize));
        for (let i=0; i<foodPayload.length; i+=chunkSize) await store.supabaseClient.from('food_logs').insert(foodPayload.slice(i, i+chunkSize));
        for (let i=0; i<workPayload.length; i+=chunkSize) await store.supabaseClient.from('workout_logs').insert(workPayload.slice(i, i+chunkSize));

        status.innerText = "✅ DB Injection Complete! Rebooting...";
        setTimeout(() => window.location.reload(), 1500);

    } catch (err) {
        console.error(err);
        status.innerText = "❌ Injection Failed. Check Console.";
    }
}
