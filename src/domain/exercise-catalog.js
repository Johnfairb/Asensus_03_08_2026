/**
 * Canonical lifting + core exercise catalog (filming template 25/07/2026).
 * Region headings (PECS/LATS/…) are PDF-only and never used for logic or labels.
 * Movement-specific fields (laterality, dumbbell, grip) drive programming only.
 * Core entries and machine leg presses/hack squat are listed for the library
 * but excluded from session programming (hypertrophy + strength).
 */

function ex(partial) {
    return {
        domain: 'lifting',
        movement: '',
        laterality: '',
        lateralityEither: false,
        dumbbell: false,
        grip: '',
        role: 'compound',
        muscle_group: 'full',
        primary: [],
        secondary: [],
        ppl: 'Push',
        inProgramming: true,
        bodyweight: false,
        ...partial
    };
}

/** Pretty primary/secondary muscle labels from the template. */
export const EXERCISE_CATALOG = {
    // —— Legs · Posterior compound ——
    'Deadlift': ex({
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Upper traps', 'Grip']
    }),
    'Sumo Deadlift': ex({
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves', 'Traps', 'Grip']
    }),
    'Romanian Deadlift': ex({
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Hamstrings'],
        secondary: ['Calves', 'Traps', 'Grip']
    }),
    'Rack Deadlift': ex({
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Hamstrings'],
        secondary: ['Calves', 'Traps', 'Grip', 'Quads']
    }),
    'Single Leg Deadlift': ex({
        domain: 'strength', movement: 'hinge', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Traps', 'Grip', 'Adductors']
    }),

    // —— Legs · Anterior compound ——
    'Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Adductors']
    }),
    'Sumo Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves']
    }),
    'Front Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads'],
        secondary: ['Calves', 'Hamstrings']
    }),
    'Goblet Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves', 'Lower back']
    }),
    'Split Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Lunge': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Walk Lunge': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Bulgarian Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors', 'Hip flexors']
    }),
    'Pistol Squat': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true,
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    // Library only — not programmed for hypertrophy or strength
    'Leg Press': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', lateralityEither: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Glute max', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Adductors']
    }),
    'Wide Leg Press': ex({
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', lateralityEither: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Glute max', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves']
    }),

    // —— Legs · Isolations ——
    'Leg Extension': ex({
        domain: 'lifting', movement: 'quad isolation', role: 'isolation',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Quads'], secondary: []
    }),
    // Library only — not programmed for hypertrophy or strength
    'Hack Squat': ex({
        domain: 'lifting', movement: 'quad isolation', role: 'isolation',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Quads'], secondary: ['Calves', 'Hamstrings']
    }),
    'Calf Raise Machine': ex({
        domain: 'lifting', movement: 'calf isolation', laterality: 'Bilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: []
    }),
    'Calf Raise Barbell': ex({
        domain: 'lifting', movement: 'calf isolation', laterality: 'Bilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: []
    }),
    'Single Calf Raise': ex({
        domain: 'lifting', movement: 'calf isolation', laterality: 'Unilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: ['Glute medius']
    }),
    'Adductor Machine': ex({
        domain: 'lifting', movement: 'groin isolation', role: 'isolation',
        muscle_group: 'groin', ppl: 'Legs',
        primary: ['Adductors'], secondary: []
    }),
    'Abductor Machine': ex({
        domain: 'lifting', movement: 'abductor isolation', role: 'isolation',
        muscle_group: 'glute', ppl: 'Legs',
        primary: ['Glute medius', 'Glute minimus'], secondary: []
    }),
    'Seated Hamstring Curl': ex({
        domain: 'lifting', movement: 'hamstring isolation', role: 'isolation',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Hamstrings'], secondary: ['Calves']
    }),
    'Lying Hamstring Curl': ex({
        domain: 'lifting', movement: 'hamstring isolation', role: 'isolation',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Hamstrings'], secondary: ['Calves']
    }),
    'Hyperextension': ex({
        domain: 'lifting', movement: 'lower back isolation', role: 'isolation',
        muscle_group: 'core', ppl: 'Legs',
        primary: ['Glute max', 'Hamstrings', 'Lower back'], secondary: ['Calves']
    }),

    // —— Horizontal push ——
    'Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Dumbbell Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: true, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Close Grip Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Front delts']
    }),
    'Decline Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Neutral Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: true, grip: 'neutral', role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Dip': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Lower traps']
    }),
    'Press-up': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Close Grip Press-up': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Machine Bench Press': ex({
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),

    // —— Pec isolation ——
    'Flye': ex({
        domain: 'lifting', movement: 'pec isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts'], secondary: ['Rotator cuff']
    }),
    'Incline Flye': ex({
        domain: 'lifting', movement: 'pec isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'upper_chest', ppl: 'Push',
        primary: ['Upper pecs', 'Front delt'], secondary: ['Rotator cuff']
    }),
    'Pullover': ex({
        domain: 'lifting', movement: 'pec isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Lats', 'Pecs'], secondary: ['Triceps', 'Rear delt']
    }),
    'Cable Crossover': ex({
        domain: 'lifting', movement: 'pec isolation', role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs'], secondary: ['Lats']
    }),
    'Pec Deck': ex({
        domain: 'lifting', movement: 'pec isolation', role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts'], secondary: []
    }),

    // —— Vertical pull ——
    'Lat Machine Pull': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Brachialis']
    }),
    'Lat Machine Chin-up': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Lat Machine Close Grip': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Lat Machine Single Pull': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Low Pulley Wide Grip': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Low Pulley Close Grip': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Chin Up': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Pull Up': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Neutral Pull Up': ex({
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),

    // —— Horizontal pull ——
    'Underhand Barbell Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Pecs'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Overhand Barbell Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Pecs'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Dumbbell Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'neutral', dumbbell: true, role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Neutral Cable Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Overhand Cable Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Underhand Cable Row': ex({
        domain: 'strength', movement: 'horizontal pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Reverse Row': ex({
        domain: 'lifting', movement: 'mid trap isolation', role: 'isolation',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),

    // —— Vertical push ——
    'Barbell Military Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Seated Dumbbell Shoulder Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: true, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Seated Dumbbell Screw Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: true, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Machine Overhead Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Incline Bench Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Dumbbell Incline Bench Press': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: true, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Incline Press-up': ex({
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push', bodyweight: true,
        primary: ['Front delts', 'Triceps', 'Upper pecs'],
        secondary: ['Upper traps', 'Lats', 'Rotator cuff', 'Core']
    }),

    // —— Shoulder isolations ——
    'Lateral Raise': ex({
        domain: 'lifting', movement: 'side delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Lying 30 Degree Single Lateral Raise': ex({
        domain: 'lifting', movement: 'side delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Cable Lateral Raise (Single)': ex({
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Cable Lateral Raise (Double)': ex({
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Upright Row': ex({
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Lateral Rotation': ex({
        domain: 'lifting', movement: 'rotator cuff isolation', role: 'isolation',
        muscle_group: 'rotator_cuff', ppl: 'Push',
        primary: ['Rotator cuff'], secondary: []
    }),
    'Standing Dumbbell Front Raise': ex({
        domain: 'lifting', movement: 'front delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts'], secondary: ['Upper traps']
    }),
    'Incline Dumbbell Front Raise': ex({
        domain: 'lifting', movement: 'front delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts'], secondary: ['Upper traps']
    }),
    'Bent Over Rear Flye': ex({
        domain: 'lifting', movement: 'rear delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Pull',
        primary: ['Rear delts'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Machine Reverse Rear Flye': ex({
        domain: 'lifting', movement: 'rear delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Pull',
        primary: ['Rear delts'], secondary: ['Middle traps', 'Rhomboids']
    }),

    // —— Biceps ——
    'Barbell Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: false, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Dumbbell Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Hammer Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'neutral', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps', 'Brachioradialis'], secondary: []
    }),
    'Reverse Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'overhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Brachialis'], secondary: ['Wrist extensors']
    }),
    'Cable Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Concentration Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Preacher Curl EZ Bar': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Dumbbell Preacher Curl': ex({
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),

    // —— Triceps ——
    'Rope Push Down': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Bar Push Down': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Single Push Down': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Cable French Press': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Kick Back': ex({
        domain: 'lifting', movement: 'tricep isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Skull Crusher': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Single Overhead Seated French Press': ex({
        domain: 'lifting', movement: 'tricep isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Reverse Dips': ex({
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push', bodyweight: true,
        primary: ['Triceps', 'Front delt'], secondary: ['Lower traps']
    }),

    // —— Core (library only — not used in programming) ——
    'Crunch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Knees on Bench Crunch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Feet Up Crunch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Cable Crunch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Reverse Crunch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Plank': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Side Plank': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Dead Bug': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Toe Touch': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Side-sit on Hyperextension Bench': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'ql', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Pallof Press': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Wood-chop': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Roman Chair Knee Raise': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Roman Chair Leg Raise': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Hanging Knee Raise': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Hanging Leg Raise': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Suitcase Carry': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Turkish Get-up': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Russian Twist': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Standing Side Bend': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Halo': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Bulgarian Bag Circles': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Standing Cable Rotation': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] }),
    'Seated Cable Rotation': ex({ domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, primary: ['Core'], secondary: [] })
};

/** Strength core slot still uses these (logic unchanged); mapped to catalog names. */
export const STRENGTH_CORE_NAMES = {
    sidesit: 'Side-sit on Hyperextension Bench',
    hyperextension: 'Hyperextension'
};

export function normalizeExerciseName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveCatalogName(name) {
    const key = normalizeExerciseName(name);
    if (!key) return null;
    const direct = Object.keys(EXERCISE_CATALOG).find(n => normalizeExerciseName(n) === key);
    if (direct) return direct;
    const aliases = {
        'back squat': 'Squat',
        'wide squat': 'Sumo Squat',
        'sumo squat': 'Sumo Squat',
        'bulgarian split squat': 'Bulgarian Squat',
        'trap bar deadlift': 'Rack Deadlift',
        'db bench press': 'Dumbbell Bench Press',
        'dumbell bench press': 'Dumbbell Bench Press',
        'neutral db bench press': 'Neutral Bench Press',
        'dips': 'Dip',
        'press up': 'Press-up',
        'push up': 'Press-up',
        'push-up': 'Press-up',
        'seated db press': 'Seated Dumbbell Shoulder Press',
        'military press': 'Barbell Military Press',
        'seated military press': 'Machine Overhead Press',
        'barbell row': 'Overhand Barbell Row',
        'single arm db row': 'Dumbbell Row',
        'chest-supported row': 'Neutral Cable Row',
        'cable row (underhand)': 'Underhand Cable Row',
        'cable row (overhand)': 'Overhand Cable Row',
        'cable row (neutral)': 'Neutral Cable Row',
        'cable row': 'Overhand Cable Row',
        'pull ups': 'Pull Up',
        'pull-ups': 'Pull Up',
        'chin ups': 'Chin Up',
        'chin-ups': 'Chin Up',
        'neutral chin ups': 'Neutral Pull Up',
        'lat pulldown': 'Lat Machine Pull',
        'lat pull-down': 'Lat Machine Pull',
        'bicep curls': 'Dumbbell Curl',
        'french press': 'Cable French Press',
        'calf raises': 'Calf Raise Machine',
        'quad extension': 'Leg Extension',
        'leg extensions': 'Leg Extension',
        'hamstring curl': 'Seated Hamstring Curl',
        'hamstring curls': 'Seated Hamstring Curl',
        'reverse flyes': 'Bent Over Rear Flye',
        'front raises': 'Standing Dumbbell Front Raise',
        'lateral raises': 'Lateral Raise',
        'pec flyes': 'Flye',
        'db pullovers': 'Pullover',
        'pullover (also in lats)': 'Pullover',
        'pec dec': 'Pec Deck',
        'sidesit': 'Side-sit on Hyperextension Bench',
        'side sit': 'Side-sit on Hyperextension Bench',
        'back extension': 'Hyperextension',
        'pallor press': 'Pallof Press',
        'walk lunge': 'Walk Lunge',
        'goblet squat': 'Goblet Squat'
    };
    return aliases[key] || null;
}

export function getExerciseMeta(name) {
    if (!name) return null;
    if (EXERCISE_CATALOG[name]) return { name, ...EXERCISE_CATALOG[name] };
    const resolved = resolveCatalogName(name);
    if (resolved && EXERCISE_CATALOG[resolved]) return { name: resolved, ...EXERCISE_CATALOG[resolved] };
    return null;
}

/** Push / Pull / Legs (or Core) session label for library display. */
export function getExerciseSessionLabel(name) {
    const meta = getExerciseMeta(name);
    if (!meta) return null;
    return meta.ppl || null;
}

export function formatMuscleList(list) {
    if (!Array.isArray(list) || !list.length) return '—';
    return list.join(', ');
}

/** Seed rows for catalog lifts (core included). */
export function catalogSeedExercises() {
    return Object.entries(EXERCISE_CATALOG).map(([name, meta]) => ({
        name,
        domain: meta.domain,
        muscle_group: meta.muscle_group
    }));
}

/** Thin meta maps for strength / hypertrophy engines. */
export function buildStrengthMetaMap() {
    const out = {};
    for (const [name, meta] of Object.entries(EXERCISE_CATALOG)) {
        out[name] = {
            domain: meta.domain,
            movement: meta.movement,
            laterality: meta.lateralityEither ? 'Either' : meta.laterality,
            lateralityEither: !!meta.lateralityEither,
            dumbbell: !!meta.dumbbell,
            grip: meta.grip || '',
            muscle_group: meta.muscle_group,
            primary: meta.primary,
            secondary: meta.secondary,
            ppl: meta.ppl,
            inProgramming: meta.inProgramming !== false,
            role: meta.role
        };
    }
    return out;
}

export function buildHypertrophyMetaMap() {
    const out = {};
    for (const [name, meta] of Object.entries(EXERCISE_CATALOG)) {
        if (meta.inProgramming === false) continue;
        out[name] = {
            domain: meta.domain,
            movement: meta.movement,
            laterality: meta.lateralityEither ? 'Either' : meta.laterality,
            lateralityEither: !!meta.lateralityEither,
            dumbbell: !!meta.dumbbell,
            grip: meta.grip || '',
            role: meta.role,
            muscle_group: meta.muscle_group,
            primary: (meta.primary || [])[0] || meta.muscle_group,
            secondary: (meta.secondary || [])[0] || '',
            primaryMuscles: meta.primary,
            secondaryMuscles: meta.secondary,
            ppl: meta.ppl
        };
    }
    return out;
}

export function bodyweightCompoundSet() {
    return new Set(
        Object.entries(EXERCISE_CATALOG)
            .filter(([, m]) => m.bodyweight && m.role === 'compound')
            .map(([n]) => n)
    );
}
