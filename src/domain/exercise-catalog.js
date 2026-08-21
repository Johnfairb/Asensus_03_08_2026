/**
 * Canonical lifting + core exercise catalog (filming template 25/07/2026).
 * Region headings (PECS/LATS/…) are PDF-only and never used for logic or labels.
 * Movement-specific fields (laterality, dumbbell, grip) drive programming only.
 * Machine leg presses/hack squat are library-only (inProgramming: false).
 * Core entries stay out of hypertrophy pools but are programmed in the
 * strength core circuit via coreLevel / coreTarget.
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
        /** Load codes from PDF: B D Ca Fca Cca M C H P free, or multi e.g. ['B','D']. Empty = no weight. */
        loadOptions: ['B'],
        /** Optional hard cap (kg); used by Halo. */
        loadMax: null,
        cableDefault: 'Fca',
        ...partial
    };
}

/** Pretty primary/secondary muscle labels from the template. */
export const EXERCISE_CATALOG = {
    // —— Legs · Posterior compound ——
    'Deadlift': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Upper traps', 'Grip']
    }),
    'Sumo Deadlift': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves', 'Traps', 'Grip']
    }),
    'Romanian Deadlift': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Hamstrings'],
        secondary: ['Calves', 'Traps', 'Grip']
    }),
    'Rack Deadlift': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'hinge', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Hamstrings'],
        secondary: ['Calves', 'Traps', 'Grip', 'Quads']
    }),
    'Single Leg Deadlift': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'hinge', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true,
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Traps', 'Grip', 'Adductors']
    }),

    // —— Legs · Anterior compound ——
    'Squat': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Adductors']
    }),
    'Sumo Squat': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves']
    }),
    'Front Squat': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads'],
        secondary: ['Calves', 'Hamstrings']
    }),
    'Goblet Squat': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves', 'Lower back']
    }),
    'Split Squat': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: false, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Lunge': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: false, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Walk Lunge': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    'Bulgarian Squat': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', dumbbell: false, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors', 'Hip flexors']
    }),
    'Pistol Squat': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'flexion', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true,
        primary: ['Glute max', 'Lower back', 'Quads', 'Hamstrings', 'Glute medius'],
        secondary: ['Calves', 'Adductors']
    }),
    // Library only — not programmed for hypertrophy or strength
    'Leg Press': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', lateralityEither: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Glute max', 'Quads', 'Hamstrings'],
        secondary: ['Calves', 'Adductors']
    }),
    'Wide Leg Press': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'flexion', laterality: 'Bilateral', lateralityEither: true, role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Glute max', 'Quads', 'Hamstrings', 'Adductors'],
        secondary: ['Calves']
    }),

    // —— Legs · Isolations ——
    'Leg Extension': ex({
        loadOptions: ['C', 'P'],
        domain: 'lifting', movement: 'quad isolation', role: 'isolation',
        muscle_group: 'quad', ppl: 'Legs',
        primary: ['Quads'], secondary: []
    }),
    // Library only — not programmed for hypertrophy or strength
    'Hack Squat': ex({
        loadOptions: ['P'],
        domain: 'lifting', movement: 'quad isolation', role: 'isolation',
        muscle_group: 'quad', ppl: 'Legs', inProgramming: false,
        primary: ['Quads'], secondary: ['Calves', 'Hamstrings']
    }),
    'Calf Raise Machine': ex({
        loadOptions: ['P', 'M'],
        domain: 'lifting', movement: 'calf isolation', laterality: 'Bilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: []
    }),
    'Calf Raise Barbell': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'calf isolation', laterality: 'Bilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: []
    }),
    'Single Calf Raise': ex({
        loadOptions: ['B', 'D'],
        domain: 'lifting', movement: 'calf isolation', laterality: 'Unilateral', role: 'isolation',
        muscle_group: 'calves', ppl: 'Legs',
        primary: ['Calves'], secondary: ['Glute medius']
    }),
    'Adductor Machine': ex({
        loadOptions: ['M'],
        domain: 'lifting', movement: 'groin isolation', role: 'isolation',
        muscle_group: 'groin', ppl: 'Legs',
        primary: ['Adductors'], secondary: []
    }),
    'Abductor Machine': ex({
        loadOptions: ['M'],
        domain: 'lifting', movement: 'abductor isolation', role: 'isolation',
        muscle_group: 'glute', ppl: 'Legs',
        primary: ['Glute medius', 'Glute minimus'], secondary: []
    }),
    'Seated Hamstring Curl': ex({
        loadOptions: ['C'],
        domain: 'lifting', movement: 'hamstring isolation', role: 'isolation',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Hamstrings'], secondary: ['Calves']
    }),
    'Lying Hamstring Curl': ex({
        loadOptions: ['C'],
        domain: 'lifting', movement: 'hamstring isolation', role: 'isolation',
        muscle_group: 'hamstrings', ppl: 'Legs',
        primary: ['Hamstrings'], secondary: ['Calves']
    }),

    // —— Horizontal push ——
    'Bench Press': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Close Grip Bench Press': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Front delts']
    }),
    'Decline Bench Press': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Dip': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Lower traps']
    }),
    'Press-up': ex({
        loadOptions: [],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Decline Push-up': ex({
        loadOptions: [],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Push-up on Knee': ex({
        loadOptions: [],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Close Grip Press-up': ex({
        loadOptions: [],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push', bodyweight: true,
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff', 'Core']
    }),
    'Machine Bench Press': ex({
        loadOptions: ['C'],
        domain: 'strength', movement: 'horizontal push', dumbbell: false, role: 'compound',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts', 'Triceps'],
        secondary: ['Lats', 'Rotator cuff']
    }),

    // —— Pec isolation ——
    'Flye': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'pec isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts'], secondary: ['Rotator cuff']
    }),
    'Incline Flye': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'pec isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'upper_chest', ppl: 'Push',
        primary: ['Upper pecs', 'Front delt'], secondary: ['Rotator cuff']
    }),
    'Pullover': ex({
        loadOptions: ['B', 'D'],
        domain: 'lifting', movement: 'pec isolation', dumbbell: false, role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Lats', 'Pecs'], secondary: ['Triceps', 'Rear delt']
    }),
    'Cable Crossover': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'pec isolation', role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs'], secondary: ['Lats']
    }),
    'Pec Deck': ex({
        loadOptions: ['M'],
        domain: 'lifting', movement: 'pec isolation', role: 'isolation',
        muscle_group: 'lower_chest', ppl: 'Push',
        primary: ['Pecs', 'Front delts'], secondary: []
    }),

    // —— Vertical pull ——
    'Lat Machine Pull': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Brachialis']
    }),
    'Lat Machine Chin-up': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'vertical pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Lat Machine Close Grip': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Lat Machine Single Pull': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Low Pulley Wide Grip': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Low Pulley Close Grip': ex({
        loadOptions: ['Ca'],
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip', 'Rhomboids']
    }),
    'Chin Up': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'vertical pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Pull Up': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'vertical pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),
    'Neutral Pull Up': ex({
        loadOptions: ['P'],
        domain: 'strength', movement: 'vertical pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true,
        primary: ['Lats', 'Biceps', 'Rear delt'],
        secondary: ['Lower traps', 'Grip']
    }),

    // —— Horizontal pull ——
    'Underhand Barbell Row': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'horizontal pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Pecs'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Overhand Barbell Row': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'horizontal pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Pecs'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Dumbbell Row': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'horizontal pull', grip: 'neutral', dumbbell: true, role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Neutral Cable Row': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'horizontal pull', grip: 'neutral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Overhand Cable Row': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'horizontal pull', grip: 'overhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Underhand Cable Row': ex({
        loadOptions: ['M'],
        domain: 'strength', movement: 'horizontal pull', grip: 'underhand', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),
    'Reverse Row': ex({
        loadOptions: [],
        domain: 'lifting', movement: 'mid trap isolation', role: 'isolation',
        muscle_group: 'lats', ppl: 'Pull',
        primary: ['Lats', 'Rear delt'], secondary: ['Middle traps', 'Grip']
    }),

    // —— Vertical push ——
    'Barbell Military Press': ex({
        loadOptions: ['B'],
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Seated Dumbbell Shoulder Press': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'vertical push', dumbbell: true, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Seated Dumbbell Screw Press': ex({
        loadOptions: ['D'],
        domain: 'strength', movement: 'vertical push', dumbbell: true, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Machine Overhead Press': ex({
        loadOptions: ['C'],
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'], secondary: ['Upper traps']
    }),
    'Incline Bench Press': ex({
        loadOptions: ['B', 'D'],
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts', 'Triceps', 'Upper pecs'],
        secondary: ['Lats', 'Rotator cuff']
    }),
    'Incline Press-up': ex({
        loadOptions: [],
        domain: 'strength', movement: 'vertical push', dumbbell: false, role: 'compound',
        muscle_group: 'shoulders', ppl: 'Push', bodyweight: true,
        primary: ['Front delts', 'Triceps', 'Upper pecs'],
        secondary: ['Upper traps', 'Lats', 'Rotator cuff', 'Core']
    }),

    // —— Shoulder isolations ——
    'Lateral Raise': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'side delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Lying 30 Degree Single Lateral Raise': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'side delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Cable Lateral Raise (Single)': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Cable Lateral Raise (Double)': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Upright Row': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'side delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Side delts'], secondary: ['Upper traps']
    }),
    'Lateral Rotation': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'rotator cuff isolation', role: 'isolation',
        muscle_group: 'rotator_cuff', ppl: 'Push',
        primary: ['Rotator cuff'], secondary: []
    }),
    'Standing Dumbbell Front Raise': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'front delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts'], secondary: ['Upper traps']
    }),
    'Incline Dumbbell Front Raise': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'front delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Push',
        primary: ['Front delts'], secondary: ['Upper traps']
    }),
    'Bent Over Rear Flye': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'rear delt isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Pull',
        primary: ['Rear delts'], secondary: ['Middle traps', 'Rhomboids']
    }),
    'Machine Reverse Rear Flye': ex({
        loadOptions: ['M'],
        domain: 'lifting', movement: 'rear delt isolation', role: 'isolation',
        muscle_group: 'shoulders', ppl: 'Pull',
        primary: ['Rear delts'], secondary: ['Middle traps', 'Rhomboids']
    }),

    // —— Biceps ——
    'Barbell Curl': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: false, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Dumbbell Curl': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Seated Curl': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Hammer Curl': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'neutral', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps', 'Brachioradialis'], secondary: []
    }),
    'Reverse Curl': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'overhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Brachialis'], secondary: ['Wrist extensors']
    }),
    'Cable Curl': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Concentration Curl': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Preacher Curl EZ Bar': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),
    'Dumbbell Preacher Curl': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'bicep isolation', grip: 'underhand', dumbbell: true, role: 'isolation',
        muscle_group: 'biceps', ppl: 'Pull',
        primary: ['Biceps'], secondary: []
    }),

    // —— Triceps ——
    'Rope Push Down': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Bar Push Down': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Single Push Down': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Cable French Press': ex({
        loadOptions: ['Ca'],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Kick Back': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'tricep isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Skull Crusher': ex({
        loadOptions: ['B'],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Single Overhead Seated French Press': ex({
        loadOptions: ['D'],
        domain: 'lifting', movement: 'tricep isolation', dumbbell: true, role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push',
        primary: ['Triceps'], secondary: ['Grip']
    }),
    'Reverse Dips': ex({
        loadOptions: [],
        domain: 'lifting', movement: 'tricep isolation', role: 'isolation',
        muscle_group: 'triceps', ppl: 'Push', bodyweight: true,
        primary: ['Triceps', 'Front delt'], secondary: ['Lower traps']
    }),

    // —— Core (strength circuit via coreLevel; excluded from hypertrophy pools) ——
    'Crunch': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Knees Bench Crunch': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Feet Up Crunch': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Cable Crunch': ex({
        loadOptions: ['Ca'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '20', primary: ['Core'], secondary: [] }),
    'Reverse Crunch': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Plank': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'A', coreTarget: '30 seconds', coreTimed: true, primary: ['Core'], secondary: [] }),
    'Side Plank': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '30 seconds', coreTimed: true, primary: ['Core'], secondary: [] }),
    'Dead Bug': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '10 each side', primary: ['Core'], secondary: [] }),
    'Toe Touch': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Side-sit on Hyperextension Bench': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'ql', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '20 each side', primary: ['Core'], secondary: [] }),
    'Pallof Push': ex({
        loadOptions: ['Ca'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '20 each side', primary: ['Core'], secondary: [] }),
    'Wood-chop': ex({
        loadOptions: ['Ca'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '15 each side', primary: ['Core'], secondary: [] }),
    'Knee Raise Machine': ex({
        loadOptions: ['M'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '20', primary: ['Core'], secondary: [] }),
    'Knee Raise Machine Leg Raise': ex({
        loadOptions: ['M'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '20', primary: ['Core'], secondary: [] }),
    'Hanging Knee Raise': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'I', coreTarget: '20', primary: ['Core'], secondary: [] }),
    'Hanging Leg Raise': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'A', coreTarget: '10', primary: ['Core'], secondary: [] }),
    'Suitcase Carry': ex({
        loadOptions: ['D'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, dumbbell: true, coreLevel: 'B', coreTarget: '20 metres in each hand', primary: ['Core'], secondary: [] }),
    'Turkish Get-up': ex({
        loadOptions: ['D'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, dumbbell: true, bodyweight: true, coreLevel: 'A', coreTarget: '10 each way', primary: ['Core'], secondary: [] }),
    'Russian Twist': ex({
        loadOptions: ['D'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, dumbbell: true, coreLevel: 'I', coreTarget: '30', primary: ['Core'], secondary: [] }),
    'Standing Side Bend': ex({
        loadOptions: ['D'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, dumbbell: true, coreLevel: 'B', coreTarget: '20 each hand', primary: ['Core'], secondary: [] }),
    'Halo': ex({
        loadOptions: ['H'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, loadMax: 25, coreLevel: 'I', coreTarget: '15 each way', primary: ['Core'], secondary: [] }),
    'Bulgarian Bag Circles': ex({
        loadOptions: [], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '15', primary: ['Core'], secondary: [] }),
    'Standing Cable Rotation': ex({
        loadOptions: ['Ca'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '15', primary: ['Core'], secondary: [] }),
    'Seated Cable Rotation': ex({
        loadOptions: ['Ca'], domain: 'lifting', movement: 'core', role: 'isolation', muscle_group: 'core', ppl: 'Core', inProgramming: false, coreLevel: 'B', coreTarget: '15', primary: ['Core'], secondary: [] }),
    'Hyperextension': ex({
        loadOptions: ['P', 'D'],
        domain: 'lifting', movement: 'lower back isolation', role: 'isolation',
        muscle_group: 'core', ppl: 'Core', inProgramming: false,
        coreLevel: 'B', coreTarget: '20',
        primary: ['Glute max', 'Hamstrings', 'Lower back'], secondary: ['Calves']
    }),

    // —— Power / plyometrics (programmed by power-engine; library domain "power") ——
    'Box Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Depth Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Depth Jump to Box Jump': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Low Hurdle Hops': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Calves'], secondary: ['Glute max'] }),
    'High Hurdle Hops': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Calves'], secondary: ['Glute max'] }),
    'Knee Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Knee Jumps to Box Jump': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Lateral Hurdle Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute medius'], secondary: ['Calves'] }),
    'Squat Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Weighted Squat Jumps': ex({
        loadOptions: ['D'], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', dumbbell: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Weighted Pogos': ex({
        loadOptions: ['D'], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'calves', ppl: 'Legs', dumbbell: true, primary: ['Calves', 'Quads'], secondary: ['Glute max'] }),
    'Bilateral Bound': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true, primary: ['Glute max', 'Hamstrings'], secondary: ['Calves'] }),
    'Repeated Bilateral Bounds': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true, primary: ['Glute max', 'Hamstrings'], secondary: ['Calves'] }),
    'Knee Tuck': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Core'], secondary: ['Calves'] }),
    'Repeated Knee Tuck': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Core'], secondary: ['Calves'] }),
    'Pogos': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'calves', ppl: 'Legs', bodyweight: true, primary: ['Calves'], secondary: ['Quads'] }),
    'Single Leg Box Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Bounds': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true, primary: ['Glute max', 'Hamstrings'], secondary: ['Calves'] }),
    'Single Leg Bounds': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true, primary: ['Glute max', 'Hamstrings'], secondary: ['Calves'] }),
    'Lunge Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Rapid Lunge Jumps': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Skater Bounds': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'glute', ppl: 'Legs', bodyweight: true, primary: ['Glute medius', 'Glute max'], secondary: ['Calves'] }),
    'Rapid Skater Bounds': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'glute', ppl: 'Legs', bodyweight: true, primary: ['Glute medius', 'Glute max'], secondary: ['Calves'] }),
    'Single Leg Pogos': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'calves', ppl: 'Legs', bodyweight: true, primary: ['Calves'], secondary: ['Quads'] }),
    'Skips for Height': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Calves'], secondary: ['Glute max'] }),
    'Skips for Distance': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'hamstrings', ppl: 'Legs', bodyweight: true, primary: ['Hamstrings', 'Glute max'], secondary: ['Calves'] }),
    'Explosive Bulgarian Split Squat': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Single Leg Depth Jump': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'quad', ppl: 'Legs', bodyweight: true, primary: ['Quads', 'Glute max'], secondary: ['Calves'] }),
    'Med Ball Crunch': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'core', ppl: 'Core', bodyweight: true, primary: ['Core'], secondary: [] }),
    'Sideways Med Ball Toss': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Unilateral', role: 'compound',
        muscle_group: 'core', ppl: 'Core', bodyweight: true, primary: ['Core'], secondary: ['Glute medius'] }),
    'Kneeling Overhead Throw': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'core', ppl: 'Core', bodyweight: true, primary: ['Core'], secondary: ['Front delt'] }),
    'Standing Overhead Throw': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'core', ppl: 'Core', bodyweight: true, primary: ['Core'], secondary: ['Front delt'] }),
    'Explosive Push-up': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'pecs', ppl: 'Push', bodyweight: true, primary: ['Pecs', 'Triceps'], secondary: ['Front delt'] }),
    'Clap Push-up': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'pecs', ppl: 'Push', bodyweight: true, primary: ['Pecs', 'Triceps'], secondary: ['Front delt'] }),
    'Superman Push-up': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'pecs', ppl: 'Push', bodyweight: true, primary: ['Pecs', 'Triceps'], secondary: ['Front delt', 'Core'] }),
    'Med Ball Chest Pass': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'pecs', ppl: 'Push', bodyweight: true, primary: ['Pecs', 'Triceps'], secondary: ['Front delt'] }),
    'Standing Overhead Slam': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true, primary: ['Lats', 'Core'], secondary: ['Front delt'] }),
    'Explosive Pull-up': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true, primary: ['Lats'], secondary: ['Biceps'] }),
    'Rope Slams': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true, primary: ['Lats', 'Core'], secondary: ['Front delt'] }),
    'Clap Pull-up': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true, primary: ['Lats'], secondary: ['Biceps'] }),
    'Explosive Sled Pull': ex({
        loadOptions: [], domain: 'power', movement: 'plyo', laterality: 'Bilateral', role: 'compound',
        muscle_group: 'lats', ppl: 'Pull', bodyweight: true, primary: ['Lats', 'Rear delt'], secondary: ['Biceps'] })
};

/**
 * Filming-template teaching points (red codes).
 * T = tight grip (not knees over toes). O = knees over toes.
 * A = lumbar + neck + knee angle + knees over toes (excludes tight grip / elbow / shoulders).
 */
const TP_CODE_LABELS = {
    L: 'Neutral lumbar spine',
    N: 'Neck angle',
    K: 'Knee angle',
    T: 'Tight grip',
    O: 'Knees over toes',
    E: 'Elbow angle',
    S: 'Shoulders down',
    G: 'Tight grip'
};

const TP_A_LABELS = [
    'Neutral lumbar spine',
    'Neck angle',
    'Knee angle',
    'Knees over toes'
];

/** YouTube clips for shared teaching-point labels (lowercase keys). */
const TEACHING_POINT_VIDEOS = {
    'knee angle': 'https://www.youtube.com/watch?v=nN-MGugsPLg',
    'neck angle': 'https://www.youtube.com/watch?v=Kkg6kc_8e98',
    'knees over toes': 'https://www.youtube.com/watch?v=NrkKf1iEMbY',
    'neutral lumbar spine': 'https://www.youtube.com/watch?v=goAAADaMZfc'
};

/** Watch URL for a teaching-point label, or '' if none is wired yet. */
export function getTeachingPointVideoUrl(label) {
    const key = String(label || '').trim().toLowerCase();
    return TEACHING_POINT_VIDEOS[key] || '';
}

function formClip(label, videoId) {
    return { label, videoUrl: `https://www.youtube.com/watch?v=${videoId}` };
}

/** Per-lift form clips (front/side, load, or advanced variants). */
const EXERCISE_FORM_VIDEOS = {
    'Crunch': [formClip('Crunch', 's1Bs7GIF-vA')],
    'Knees Bench Crunch': [formClip('Knees Bench Crunch', '0-zGaA0lGrM')],
    'Feet Up Crunch': [formClip('Feet Up Crunch', 'zL-HbZC0Hyg')],
    'Reverse Crunch': [formClip('Reverse Crunch', 'NI45UO6MCTg')],
    'Plank': [formClip('Plank', 'qHKB3xebboM')],
    'Side Plank': [formClip('Side Plank', 'V4d-uuaG-_0')],
    'Dead Bug': [formClip('Dead Bug', '3m4-s_6FTXI')],
    'Russian Twist': [formClip('Russian Twist', 'B2FJAfOC7mM')],
    'Halo': [formClip('Halo', '3z69mqHnXeg')],
    'Suitcase Carry': [
        formClip('Angle 1', 'yCfcmuCDCJs'),
        formClip('Angle 2', 'CuNUK64ap4Y')
    ],
    'Turkish Get-up': [formClip('Turkish Get-up', '2VytA1Dparw')],
    'Side-sit on Hyperextension Bench': [formClip('Side-sit', 'SCBDVgjR3Ik')],
    'Hyperextension': [formClip('Hyperextension', 'pEaPF-jU_uI')],
    'Hanging Knee Raise': [formClip('Hanging Knee Raise', 'ZjAqZoHJGBQ')],
    'Wood-chop': [formClip('Wood-chop', '5wFGixVCKWo')],
    'Standing Cable Rotation': [formClip('Standing Cable Rotation', 'PuQtmYqGkeY')],
    'Pallof Push': [formClip('Pallof Push', 'SKqe1U4whtE')],
    'Seated Cable Rotation': [formClip('Seated Cable Rotation', 'mYYz6NuCUN0')],
    'Cable Crunch': [formClip('Cable Crunch', 'N4CLSyLJISk')],
    'Standing Side Bend': [formClip('Standing Side Bend', 'mxuyW2fF4v8')],

    'Squat': [
        formClip('Side', 'HKTH3YIc1Jk'),
        formClip('Front', 'mqsmfBZ9LqM')
    ],
    'Sumo Squat': [
        formClip('Angle 1', 'sySK8kqkNYE'),
        formClip('Angle 2', '7UwaRedGaEA')
    ],
    'Deadlift': [
        formClip('Side', 'BCBmj0GKXco'),
        formClip('Front', 'v_pOuUwkfZw')
    ],
    'Sumo Deadlift': [
        formClip('Front', 'ZfLBFsCAYdc'),
        formClip('Side', '-_-4odMhjCU')
    ],
    'Romanian Deadlift': [
        formClip('Side', 'XvHZMbO8jQI'),
        formClip('Front', '7hmkB-B-R5E')
    ],
    'Rack Deadlift': [
        formClip('Front', 'IcfJ1DkdMjk'),
        formClip('Side', 'Aj3mRqqB5-0')
    ],
    'Single Leg Deadlift': [
        formClip('Front', 'JGQKkITdjys'),
        formClip('Side', 'OYVHu-oaqIA')
    ],
    'Front Squat': [
        formClip('Side (no plates)', '_Nb4NbvipUk'),
        formClip('Front (no plates)', 'HLwExtRbv18'),
        formClip('Front (plates)', 'UVnzt1ZUhf0'),
        formClip('Side (plates)', 'J8IfN0Feg-0')
    ],
    'Goblet Squat': [
        formClip('Side', 'Wjhb0xypIE8'),
        formClip('Front', 'cEwa0WnkK3U')
    ],
    'Split Squat': [
        formClip('Side', 'U8lFz42Uvu4'),
        formClip('Front', 'Jo2OGQh-uug')
    ],
    'Walk Lunge': [
        formClip('Angle 1', 'HtjZopOtgFg'),
        formClip('Angle 2', 'NaVILGSKmGc')
    ],
    'Bulgarian Squat': [
        formClip('Side', 'AoXB7hb1gPI'),
        formClip('Front', 'h_YJLxzTVK4')
    ],
    'Pistol Squat': [
        formClip('Side', 'BpkYPnzRyzg'),
        formClip('Front', 'dipmr2NKCx8')
    ],
    'Leg Press': [formClip('Leg Press', '044j5Fpi5Eo')],
    'Leg Extension': [formClip('Leg Extension', 'qTZLbQMkhxQ')],
    'Calf Raise Barbell': [formClip('Barbell Calf Raise', 'YCgB-vclF_U')],
    'Single Calf Raise': [formClip('Single Calf Raise', 'gCFu0tgVeHE')],
    'Lying Hamstring Curl': [formClip('Lying Hamstring Curl', 'bjqIuxXYfTc')],
    'Calf Raise Machine': [formClip('Plate-loaded Calf Raise', 'QGbCiAPUPzo')],

    'Machine Bench Press': [formClip('Machine Bench Press', 'uAcV8L1R5uI')],
    'Neutral Cable Row': [formClip('Neutral Cable Row', 'zAB0uShcEHU')],
    'Overhand Cable Row': [formClip('Overhand Cable Row', 'LwI301603do')],
    'Cable Crossover': [formClip('Cable Crossover', 'VD2MNWNyAsk')],
    'Cable French Press': [formClip('Cable French Press', 'uZbX2wvTNC0')],
    'Rope Push Down': [
        formClip('Rope Push Down 1', '1Zlp_Lz3CXA'),
        formClip('Rope Push Down 2', 'vVq1cqVt02c')
    ],
    'Lat Machine Pull': [
        formClip('Lat down', 'U4fzsdQbRvM'),
        formClip('Wide grip', 'GpBaP2T-hYY')
    ],
    'Lat Machine Close Grip': [
        formClip('Narrow grip', 'jQyy6VZtfp4'),
        formClip('Neutral / handle', 'KAWtCJzmIoc')
    ],
    'Lat Machine Single Pull': [formClip('Single-arm Lat Pulldown', 'SxDiRzvAH9U')],
    'Cable Curl': [formClip('Cable Curl', 'JP5WildW4Kw')],
    'Cable Lateral Raise (Single)': [formClip('Cable Lateral Raise', 'FOFTu0mp1hE')],
    'Lateral Rotation': [
        formClip('Outwards', '5LZZB5n4pgQ'),
        formClip('Inwards', 'CRQXV4P3wmA')
    ],
    'Pull Up': [
        formClip('Pull Up', 'QussPjEvOOM'),
        formClip('Weighted', 'xCsC5ep5GyA')
    ],
    'Chin Up': [
        formClip('Chin Up', 'zvhWOpuWIdk'),
        formClip('Weighted', 'mTEBLjAbM3I')
    ],
    'Neutral Pull Up': [
        formClip('Neutral Chin Up', 'qtAHgDvdWxA'),
        formClip('Weighted', '6i4gSCJ4AHM')
    ],
    'Dip': [
        formClip('Dip', 'ZEda1n_1yYQ'),
        formClip('Weighted', 'HtLQJhraevY')
    ],
    'Bench Press': [
        formClip('Barbell', 't3-qrXXTIok'),
        formClip('Dumbbell', '0P80Zz88aIQ')
    ],
    'Incline Bench Press': [
        formClip('Barbell', 'g-WtgvayETM'),
        formClip('Dumbbell', 'UseTFRLYJdA')
    ],
    'Decline Bench Press': [
        formClip('Barbell', 'OLWK-dx9nfM'),
        formClip('Dumbbell', 'KShY1Mq54Do')
    ],
    'Close Grip Bench Press': [formClip('Close Grip', 'Uyabxf3RlY4')],
    'Flye': [
        formClip('Dumbbell', 'ci29MKbYUyM'),
        formClip('Decline', 'I2RY34aPWbY')
    ],
    'Incline Flye': [formClip('Incline Flye', 'izSw-sdOtG0')],
    'Pullover': [formClip('Pullover', 'gwlrPy0vN94')],
    'Press-up': [formClip('Press-up', 'qQgPQ7rX4MA')],
    'Decline Push-up': [formClip('Decline Push-up', 'jCv6qI_jkTs')],
    'Push-up on Knee': [
        formClip('Angle 1', '9g_zOt6Umpo'),
        formClip('Angle 2', '6O92NrTlhp0')
    ],
    'Close Grip Press-up': [formClip('Close Grip Press-up', 'rdQQwwHt0Cw')],
    'Overhand Barbell Row': [formClip('Overhand Barbell Row', '0tSVYZnWWfM')],
    'Underhand Barbell Row': [formClip('Underhand Barbell Row', 'FpBrN_JwTkc')],
    'Dumbbell Row': [formClip('Dumbbell Row', '4d0heoqUAC4')],
    'Reverse Row': [
        formClip('Reverse Row', 'EGJMnOdI9Qc'),
        formClip('Advanced (on bench)', 'PqKAB5wUgxQ')
    ],
    'Barbell Military Press': [formClip('Military Press', '1_ulFhoG-cw')],
    'Seated Dumbbell Shoulder Press': [formClip('Dumbbell Shoulder Press', '4tS3juRA35U')],
    'Seated Dumbbell Screw Press': [formClip('Screw Press', '1lMzvTE5yB4')],
    'Lateral Raise': [formClip('Lateral Raise', 'hbAt223h4Ic')],
    'Lying 30 Degree Single Lateral Raise': [formClip('Lying 30° Single', 'dDxBejgL2pk')],
    'Standing Dumbbell Front Raise': [formClip('Front Raise', 'XZ7AWGDEmVM')],
    'Incline Dumbbell Front Raise': [formClip('Incline Front Raise', 'GRaw8UaSS2s')],
    'Bent Over Rear Flye': [formClip('Reverse Flye', 'Q2_hFwbmz5A')],
    'Skull Crusher': [formClip('Skull Crusher', 'coWN4t-ltn8')],
    'Upright Row': [formClip('Upright Row', '_qHIBXQLUmE')],
    'Barbell Curl': [formClip('Barbell Curl', 'Re73RKn6nDo')],
    'Dumbbell Curl': [formClip('Dumbbell Curl', 'Cf8EOJVN9Lo')],
    'Hammer Curl': [formClip('Hammer Curl', 'ip9jeZnxAfU')],
    'Reverse Curl': [formClip('Reverse Curl', '5wSSK5yDvEY')],
    'Seated Curl': [formClip('Seated Curl', 'sl8DLnI4GRY')],
    'Concentration Curl': [formClip('Concentration Curl', 'lJW9py1mmjY')],
    'Dumbbell Preacher Curl': [formClip('Preacher Curl', '94VY9GnDXiU')],
    'Single Overhead Seated French Press': [formClip('Overhead French Press', 'gFP79Cy1dYE')],
    'Reverse Dips': [
        formClip('Reverse Dips', 'GsZ8E6Zsvog'),
        formClip('Advanced (on bench)', 'gcT0g3V05vo')
    ],
    'Machine Overhead Press': [formClip('Shoulder Machine', 'gZyDz13UwLA')],
    'Kick Back': [formClip('Kick Back', 'cwk5zMZ1M1s')]
};

/** Form clips for a catalog lift. Empty if none are wired yet. */
export function getExerciseFormVideos(name) {
    const meta = getExerciseMeta(name);
    const key = meta?.name || resolveCatalogName(name) || String(name || '').trim();
    const clips = EXERCISE_FORM_VIDEOS[key];
    return Array.isArray(clips) ? clips.map((c) => ({ ...c })) : [];
}

/** First form-video URL for a lift, or '' if none. */
export function getExerciseFormVideoUrl(name) {
    return getExerciseFormVideos(name)[0]?.videoUrl || '';
}

const EXERCISE_TEACHING_POINT_TOKENS = {
    'Deadlift': ['LNKT'],
    'Sumo Deadlift': ['LNKT'],
    'Romanian Deadlift': ['LNT'],
    'Rack Deadlift': ['LNT'],
    'Single Leg Deadlift': ['LNT'],
    'Squat': ['A'],
    'Sumo Squat': ['A'],
    'Front Squat': ['LK'],
    'Goblet Squat': ['LKO'],
    'Split Squat': ['A', 'Back foot position (not too wide)'],
    'Lunge': ['A'],
    'Walk Lunge': ['A'],
    'Bulgarian Squat': ['A', 'Back foot position (on bench)'],
    'Pistol Squat': ['A', 'Fixed knee'],
    'Leg Extension': ['Pivot in line with the knee', 'Toes directly up'],
    'Seated Hamstring Curl': ['Pivot in line with the knee', 'Toes directly up'],
    'Lying Hamstring Curl': ['Pivot in line with the knee'],
    'Hyperextension': ['L'],
    'Bench Press': ['ETS'],
    'Close Grip Bench Press': ['ETS'],
    'Decline Bench Press': ['ETS'],
    'Dip': ['TS'],
    'Press-up': ['ES'],
    'Decline Push-up': ['ES'],
    'Push-up on Knee': ['ES'],
    'Close Grip Press-up': ['ES'],
    'Machine Bench Press': ['ES'],
    'Lat Machine Pull': ['T'],
    'Lat Machine Chin-up': ['T'],
    'Lat Machine Close Grip': ['T'],
    'Lat Machine Single Pull': ['T'],
    'Low Pulley Wide Grip': ['T'],
    'Low Pulley Close Grip': ['T'],
    'Chin Up': ['T'],
    'Pull Up': ['T'],
    'Neutral Pull Up': ['T'],
    'Underhand Barbell Row': ['TLN', 'Bar path'],
    'Overhand Barbell Row': ['TLN', 'Bar path'],
    'Dumbbell Row': ['TLN', 'Bar path'],
    'Neutral Cable Row': ['TL'],
    'Overhand Cable Row': ['TL'],
    'Underhand Cable Row': ['TL'],
    'Barbell Military Press': ['ET'],
    'Seated Dumbbell Shoulder Press': ['ET'],
    'Seated Dumbbell Screw Press': ['ET'],
    'Machine Overhead Press': ['E'],
    'Incline Bench Press': ['ET'],
    'Incline Press-up': ['ES'],
    'Lateral Raise': ['Lead with the pinky'],
    'Lying 30 Degree Single Lateral Raise': ['Lead with the pinky'],
    'Cable Lateral Raise (Single)': ['Lead with the pinky'],
    'Cable Lateral Raise (Double)': ['Lead with the pinky'],
    'Lateral Rotation': ['Elbow fixed'],
    'Cable French Press': ['Elbow high'],
    'Single Overhead Seated French Press': ['Elbow high'],
    'Reverse Dips': ['S', 'Back close to bench']
};

export function expandTeachingPoints(tokens) {
    if (!Array.isArray(tokens) || !tokens.length) return [];
    const out = [];
    for (const raw of tokens) {
        const token = String(raw || '').trim();
        if (!token) continue;
        if (token === 'A') {
            out.push(...TP_A_LABELS);
            continue;
        }
        if (/^[A-Z]+$/.test(token)) {
            for (const ch of token) {
                const label = TP_CODE_LABELS[ch];
                if (label) out.push(label);
            }
            continue;
        }
        out.push(token);
    }
    return out;
}

/** Expanded teaching-point labels for a catalog lift. null if the name is not in the catalog. */
export function getExerciseTeachingPoints(name) {
    const meta = getExerciseMeta(name);
    if (!meta) return null;
    return expandTeachingPoints(EXERCISE_TEACHING_POINT_TOKENS[meta.name] || []);
}

/** Strength core slot still uses these (logic unchanged); mapped to catalog names. */
export const STRENGTH_CORE_NAMES = {
    sidesit: 'Side-sit on Hyperextension Bench',
    hyperextension: 'Hyperextension'
};

/** Exercises eligible for the strength core circuit (have coreLevel). */
export function getCoreProgrammingEntries() {
    return Object.entries(EXERCISE_CATALOG || {})
        .filter(([, meta]) => meta && (meta.coreLevel === 'B' || meta.coreLevel === 'I' || meta.coreLevel === 'A'))
        .map(([name, meta]) => ({
            name,
            level: meta.coreLevel,
            target: meta.coreTarget || '20',
            timed: !!meta.coreTimed
        }));
}

export function getCoreCatalogNames() {
    return getCoreProgrammingEntries().map((e) => e.name);
}

/** Display label for advised core volume (reps / time / distance). */
export function formatCoreRepLabel(name) {
    const meta = getExerciseMeta(name);
    const t = String(meta?.coreTarget || '20').trim();
    if (!t) return '20 reps';
    if (/second|metre|meter|each|way|hand/i.test(t)) return t;
    return `${t} reps`;
}

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
        'db bench press': 'Bench Press',
        'dumbbell bench press': 'Bench Press',
        'dumbell bench press': 'Bench Press',
        'neutral db bench press': 'Bench Press',
        'neutral bench press': 'Bench Press',
        'dumbbell incline bench press': 'Incline Bench Press',
        'db incline bench press': 'Incline Bench Press',
        'dips': 'Dip',
        'press up': 'Press-up',
        'push up': 'Press-up',
        'push-up': 'Press-up',
        'push ups': 'Press-up',
        'decline push up': 'Decline Push-up',
        'decline push-up': 'Decline Push-up',
        'decline pushups': 'Decline Push-up',
        'push ups on knee': 'Push-up on Knee',
        'push-up on knee': 'Push-up on Knee',
        'push up on knee': 'Push-up on Knee',
        'knee push up': 'Push-up on Knee',
        'knee push-up': 'Push-up on Knee',
        'knee press-up': 'Push-up on Knee',
        'kneeling press-up': 'Push-up on Knee',
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
        'neutral chin up': 'Neutral Pull Up',
        'lat pulldown': 'Lat Machine Pull',
        'lat pull-down': 'Lat Machine Pull',
        'lat down': 'Lat Machine Pull',
        'cable pull down': 'Lat Machine Pull',
        'neutral lat pulldown': 'Lat Machine Close Grip',
        'neutral lat pull down': 'Lat Machine Close Grip',
        'handle lat pulldown': 'Lat Machine Close Grip',
        'cable lateral raise': 'Cable Lateral Raise (Single)',
        'cable lat raise': 'Cable Lateral Raise (Single)',
        'superman': 'Superman Push-up',
        'superman push up': 'Superman Push-up',
        'superman push-up': 'Superman Push-up',
        'clap push up': 'Clap Push-up',
        'clap pushup': 'Clap Push-up',
        'clap pushups': 'Clap Push-up',
        'explosive push up': 'Explosive Push-up',
        'med ball crunch': 'Med Ball Crunch',
        'sidewards medball toss': 'Sideways Med Ball Toss',
        'sidewards med ball toss': 'Sideways Med Ball Toss',
        'clap pull up': 'Clap Pull-up',
        'explosive pull up': 'Explosive Pull-up',
        'bicep curls': 'Dumbbell Curl',
        'seated curl': 'Seated Curl',
        'seated curls': 'Seated Curl',
        'seated bicep curl': 'Seated Curl',
        'seated bicep curls': 'Seated Curl',
        'bench bicep curl': 'Dumbbell Preacher Curl',
        'preacher curls': 'Dumbbell Preacher Curl',
        'french press': 'Cable French Press',
        'cable french press': 'Cable French Press',
        'seated french press': 'Single Overhead Seated French Press',
        'seated one arm french press': 'Single Overhead Seated French Press',
        'one arm french press': 'Single Overhead Seated French Press',
        'single arm french press': 'Single Overhead Seated French Press',
        'overhead french press': 'Single Overhead Seated French Press',
        'single overhead seated french press': 'Single Overhead Seated French Press',
        'calf raises': 'Calf Raise Barbell',
        'barbell calf raises': 'Calf Raise Barbell',
        'seated calf raise': 'Calf Raise Machine',
        'plate loaded calf raise machine': 'Calf Raise Machine',
        'quad extension': 'Leg Extension',
        'leg extensions': 'Leg Extension',
        'hamstring curl': 'Seated Hamstring Curl',
        'hamstring curls': 'Seated Hamstring Curl',
        'reverse flyes': 'Bent Over Rear Flye',
        'reverse flys': 'Bent Over Rear Flye',
        'reverse fly': 'Bent Over Rear Flye',
        'front raises': 'Standing Dumbbell Front Raise',
        'lateral raises': 'Lateral Raise',
        'pec flyes': 'Flye',
        'db pullovers': 'Pullover',
        'pullover (also in lats)': 'Pullover',
        'pec dec': 'Pec Deck',
        'sidesit': 'Side-sit on Hyperextension Bench',
        'side sit': 'Side-sit on Hyperextension Bench',
        'back extension': 'Hyperextension',
        'pallof press': 'Pallof Push',
        'pallor press': 'Pallof Push',
        'pallof push': 'Pallof Push',
        'walk lunge': 'Walk Lunge',
        'walking lunge': 'Walk Lunge',
        'walking lunges': 'Walk Lunge',
        'knees on bench crunch': 'Knees Bench Crunch',
        'knees bench crunch': 'Knees Bench Crunch',
        'farmer carry': 'Suitcase Carry',
        'farmer carries': 'Suitcase Carry',
        'farmer carrys': 'Suitcase Carry',
        'knee raises': 'Hanging Knee Raise',
        'goblet squat': 'Goblet Squat',
        'roman chair': 'Knee Raise Machine',
        'roman chair knee raise': 'Knee Raise Machine',
        'roman chair leg raise': 'Knee Raise Machine Leg Raise'
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

/** Unilateral compounds (strength work rest 200s vs 240s). Isolations stay on isolation rest. */
export function isUnilateralCompound(name) {
    const meta = getExerciseMeta(name);
    return !!(meta && meta.role === 'compound' && String(meta.laterality || '').toLowerCase() === 'unilateral');
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
            loadOptions: Array.isArray(meta.loadOptions) ? meta.loadOptions.slice() : ['B'],
            cableDefault: meta.cableDefault || 'Fca',
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
            loadOptions: Array.isArray(meta.loadOptions) ? meta.loadOptions.slice() : ['B'],
            cableDefault: meta.cableDefault || 'Fca',
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
