/**
 * Local flexible recipe catalog.
 * Grams are resolved at runtime from day macros + pantry.
 */
export const FLEXIBLE_RECIPES = [
    // —— Breakfast ——
    {
        id: 'protein_overnight_oats',
        name: 'Protein Overnight Oats',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Whey' },
            { role: 'CARB', prefer: 'Oat' },
            { role: 'LIQUID', prefer: 'Milk', fixedMass: 150, optional: true },
            { role: 'FAT', prefer: 'Chia', fixedMass: 10, optional: true }
        ],
        instructions: '1. Combine oats and protein powder.\n2. Stir in milk and chia.\n3. Chill overnight (or at least 2 hours).'
    },
    {
        id: 'greek_yoghurt_bowl',
        name: 'Greek Yoghurt Bowl',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Greek' },
            { role: 'CARB', prefer: 'Banana' },
            { role: 'FAT', prefer: 'Almond', fixedMass: 15, optional: true },
            { role: 'CARB', prefer: 'Honey', fixedMass: 10, optional: true }
        ],
        instructions: '1. Spoon yoghurt into a bowl.\n2. Top with banana and almonds.\n3. Drizzle honey if using.'
    },
    {
        id: 'egg_toast_plate',
        name: 'Egg & Toast Plate',
        meals: ['breakfast'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Egg' },
            { role: 'CARB', prefer: 'Sourdough' },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 80 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Toast the bread.\n2. Cook eggs to preference.\n3. Wilt spinach in a little oil and serve.'
    },
    {
        id: 'skyr_berry_bowl',
        name: 'Skyr Berry Bowl',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Skyr' },
            { role: 'CARB', prefer: 'Berries' },
            { role: 'FAT', prefer: 'Chia', fixedMass: 10, optional: true },
            { role: 'FAT', prefer: 'Almond Butter', fixedMass: 12, optional: true }
        ],
        instructions: '1. Spoon skyr into a bowl.\n2. Add berries and chia.\n3. Finish with almond butter.'
    },
    {
        id: 'cottage_cheese_stack',
        name: 'Cottage Cheese Stack',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Cottage' },
            { role: 'CARB', prefer: 'Rice Cake' },
            { role: 'CARB', prefer: 'Apple', optional: true },
            { role: 'FAT', prefer: 'Peanut', fixedMass: 12, optional: true }
        ],
        instructions: '1. Spread cottage cheese on rice cakes.\n2. Add apple slices and peanut butter.'
    },
    {
        id: 'egg_white_omelette',
        name: 'Egg White Omelette Wrap',
        meals: ['breakfast'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Egg White' },
            { role: 'CARB', prefer: 'Tortilla' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 60 }
        ],
        instructions: '1. Scramble egg whites with peppers and spinach.\n2. Wrap in a warm tortilla.'
    },
    {
        id: 'pb_banana_oats',
        name: 'Peanut Butter Banana Oats',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Whey' },
            { role: 'CARB', prefer: 'Oat' },
            { role: 'CARB', prefer: 'Banana', optional: true },
            { role: 'FAT', prefer: 'Peanut', fixedMass: 15, optional: true },
            { role: 'LIQUID', prefer: 'Milk', fixedMass: 150, optional: true }
        ],
        instructions: '1. Mix oats, whey, and milk.\n2. Top with banana and peanut butter.'
    },
    {
        id: 'tofu_scramble_wrap',
        name: 'Tofu Scramble Wrap',
        meals: ['breakfast'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Tofu' },
            { role: 'CARB', prefer: 'Tortilla' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 60 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Crumble and pan-cook tofu with veg.\n2. Wrap and serve.'
    },
    {
        id: 'smoked_salmon_bagel',
        name: 'Smoked Salmon Bagel',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Smoked Salmon' },
            { role: 'CARB', prefer: 'Bagel' },
            { role: 'PRO', prefer: 'Cottage', optional: true },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 40, optional: true }
        ],
        instructions: '1. Toast bagel.\n2. Spread cottage cheese, add smoked salmon and spinach.'
    },
    {
        id: 'protein_pancake_stack',
        name: 'Protein Pancake Stack',
        meals: ['breakfast'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Whey' },
            { role: 'CARB', prefer: 'Oat' },
            { role: 'PRO', prefer: 'Egg', optional: true },
            { role: 'CARB', prefer: 'Banana', optional: true },
            { role: 'CARB', prefer: 'Berries', fixedMass: 80, optional: true }
        ],
        instructions: '1. Blend whey, oats, egg, and banana.\n2. Cook as pancakes; top with berries.'
    },
    {
        id: 'tempeh_breakfast_hash',
        name: 'Tempeh Breakfast Hash',
        meals: ['breakfast'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Tempeh' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 60 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Dice and roast/pan potato.\n2. Brown tempeh with peppers; fold in spinach.'
    },
    {
        id: 'zero_prep_shake_plate',
        name: 'Zero-Prep Shake Plate',
        meals: ['breakfast'],
        zeroPrep: true,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Whey' },
            { role: 'CARB', prefer: 'Oat' },
            { role: 'LIQUID', prefer: 'Milk', fixedMass: 200, optional: true },
            { role: 'CARB', prefer: 'Banana', optional: true }
        ],
        instructions: '1. Shake protein with milk and oats.\n2. Eat banana on the side.'
    },

    // —— Lunch ——
    {
        id: 'chicken_rice_bowl',
        name: 'Chicken Rice Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Chicken' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook rice.\n2. Grill or pan chicken.\n3. Steam broccoli; assemble bowl.'
    },
    {
        id: 'turkey_sweet_potato_plate',
        name: 'Turkey Sweet Potato Plate',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Turkey' },
            { role: 'CARB', prefer: 'Sweet Potato' },
            { role: 'VEG_G', prefer: 'Green Bean', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Roast sweet potato.\n2. Cook turkey.\n3. Steam green beans and plate.'
    },
    {
        id: 'beef_bowl',
        name: 'High-Density Beef Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Mince' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 }
        ],
        instructions: '1. Cook rice.\n2. Brown mince; season.\n3. Serve over rice with broccoli.'
    },
    {
        id: 'tuna_wrap',
        name: 'Tuna Wrap',
        meals: ['lunch'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Tuna' },
            { role: 'CARB', prefer: 'Tortilla' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 60 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 40 },
            { role: 'FAT', prefer: 'Avocado', fixedMass: 40, optional: true }
        ],
        instructions: '1. Drain tuna.\n2. Wrap with veg and avocado.'
    },
    {
        id: 'salmon_quinoa_bowl',
        name: 'Salmon Quinoa Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Salmon' },
            { role: 'CARB', prefer: 'Quinoa' },
            { role: 'VEG_G', prefer: 'Asparagus', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook quinoa.\n2. Bake or pan salmon.\n3. Serve with asparagus.'
    },
    {
        id: 'chicken_pasta_pot',
        name: 'Chicken Pasta Pot',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Chicken' },
            { role: 'CARB', prefer: 'Pasta' },
            { role: 'VEG_G', prefer: 'Courgette', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Boil pasta.\n2. Cook chicken and courgette.\n3. Toss together with oil.'
    },
    {
        id: 'white_fish_potato_plate',
        name: 'White Fish Potato Plate',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Fish' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 },
            { role: 'FAT', prefer: 'Butter', fixedMass: 8, optional: true }
        ],
        instructions: '1. Bake or boil potato.\n2. Cook white fish.\n3. Steam broccoli; finish with a little butter.'
    },
    {
        id: 'chickpea_grain_bowl',
        name: 'Chickpea Grain Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Chickpea' },
            { role: 'CARB', prefer: 'Quinoa' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 80 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 8, optional: true }
        ],
        instructions: '1. Cook quinoa.\n2. Warm chickpeas with peppers.\n3. Wilt spinach and assemble.'
    },
    {
        id: 'beef_burrito_bowl',
        name: 'Beef Burrito Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Mince' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'CARB', prefer: 'Black Bean', optional: true },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'FAT', prefer: 'Avocado', fixedMass: 40, optional: true }
        ],
        instructions: '1. Cook rice and mince.\n2. Add beans and peppers.\n3. Top with avocado.'
    },
    {
        id: 'turkey_lentil_stew',
        name: 'Turkey Lentil Stew',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Turkey' },
            { role: 'CARB', prefer: 'Lentil' },
            { role: 'VEG_C', prefer: 'Carrot', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 60 }
        ],
        instructions: '1. Simmer lentils with turkey and carrots.\n2. Stir in spinach to finish.'
    },
    {
        id: 'prawn_noodle_bowl',
        name: 'Prawn Noodle Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Prawn' },
            { role: 'CARB', prefer: 'Noodle' },
            { role: 'VEG_G', prefer: 'Courgette', fixedMass: 100 },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 }
        ],
        instructions: '1. Cook noodles.\n2. Stir-fry prawns with veg.\n3. Toss together.'
    },
    {
        id: 'chicken_caesar_salad',
        name: 'Chicken Caesar Salad',
        meals: ['lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Chicken' },
            { role: 'CARB', prefer: 'Sourdough' },
            { role: 'VEG_G', prefer: 'Salad', fixedMass: 120 },
            { role: 'FAT', prefer: 'Mayonnaise', fixedMass: 15, optional: true }
        ],
        instructions: '1. Grill chicken.\n2. Toast sourdough croutons.\n3. Toss leaves with light mayo and top with chicken.'
    },
    {
        id: 'pork_medallion_plate',
        name: 'Pork Medallion Plate',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Pork' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_G', prefer: 'Green Bean', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook rice.\n2. Pan-sear pork medallions.\n3. Steam green beans.'
    },
    {
        id: 'tempeh_rice_bowl',
        name: 'Tempeh Rice Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Tempeh' },
            { role: 'CARB', prefer: 'Brown Rice' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook brown rice.\n2. Pan tempeh; steam broccoli.\n3. Assemble bowl.'
    },
    {
        id: 'edamame_quinoa_bowl',
        name: 'Edamame Quinoa Bowl',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Edamame' },
            { role: 'CARB', prefer: 'Quinoa' },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 80 },
            { role: 'FAT', prefer: 'Avocado', fixedMass: 40, optional: true }
        ],
        instructions: '1. Cook quinoa.\n2. Warm edamame; wilt spinach.\n3. Top with avocado.'
    },
    {
        id: 'seitan_stir_fry',
        name: 'Seitan Stir-Fry',
        meals: ['lunch', 'dinner'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Seitan' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Courgette', fixedMass: 100 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook rice.\n2. Stir-fry seitan with peppers and courgette.'
    },

    // —— Dinner-focused (also lunch-capable where listed) ——
    {
        id: 'chicken_broccoli_rice',
        name: 'Chicken & Broccoli Rice',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Chicken' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook rice and chicken.\n2. Steam broccoli; plate together.'
    },
    {
        id: 'lean_steak_potatoes',
        name: 'Lean Steak & Potatoes',
        meals: ['dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Steak' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_G', prefer: 'Asparagus', fixedMass: 120 },
            { role: 'FAT', prefer: 'Butter', fixedMass: 8, optional: true }
        ],
        instructions: '1. Roast or boil potatoes.\n2. Pan-sear steak.\n3. Serve with asparagus.'
    },
    {
        id: 'salmon_greens_plate',
        name: 'Salmon Greens Plate',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Salmon' },
            { role: 'CARB', prefer: 'Sweet Potato' },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 100 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Roast sweet potato.\n2. Cook salmon; wilt spinach.'
    },
    {
        id: 'turkey_pasta_bowl',
        name: 'Turkey Pasta Bowl',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Turkey' },
            { role: 'CARB', prefer: 'Pasta' },
            { role: 'VEG_G', prefer: 'Courgette', fixedMass: 100 },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 }
        ],
        instructions: '1. Boil pasta.\n2. Cook turkey with courgette and peppers.\n3. Toss and serve.'
    },
    {
        id: 'beef_mince_chilli',
        name: 'Beef Mince Chilli',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Mince' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'CARB', prefer: 'Black Bean', optional: true },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_C', prefer: 'Onion', fixedMass: 50, optional: true }
        ],
        instructions: '1. Brown mince with onion and peppers.\n2. Add beans; simmer.\n3. Serve over rice.'
    },
    {
        id: 'cod_tray_bake',
        name: 'Cod Tray Bake',
        meals: ['dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Fish' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_C', prefer: 'Carrot', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 120 }
        ],
        instructions: '1. Roast potato and carrots.\n2. Add white fish and broccoli for the last 12–15 minutes.'
    },
    {
        id: 'chicken_fajita_plate',
        name: 'Chicken Fajita Plate',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Chicken' },
            { role: 'CARB', prefer: 'Tortilla' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 100 },
            { role: 'VEG_C', prefer: 'Onion', fixedMass: 50 },
            { role: 'FAT', prefer: 'Avocado', fixedMass: 40, optional: true }
        ],
        instructions: '1. Sauté chicken with peppers and onion.\n2. Warm tortillas; top with avocado.'
    },
    {
        id: 'pork_rice_bowl',
        name: 'Pork Rice Bowl',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Pork' },
            { role: 'CARB', prefer: 'Jasmine' },
            { role: 'VEG_G', prefer: 'Green Bean', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook jasmine rice.\n2. Pan pork; steam green beans.'
    },
    {
        id: 'tofu_curry_bowl',
        name: 'Tofu Curry Bowl',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Tofu' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 80 },
            { role: 'CARB', prefer: 'Chickpea', optional: true },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Cook rice.\n2. Simmer tofu and chickpeas with spinach.'
    },
    {
        id: 'lentil_veg_pot',
        name: 'Lentil Veg Pot',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Lentil' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_C', prefer: 'Carrot', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 60 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Simmer lentils with potato and carrot.\n2. Stir in spinach to finish.'
    },
    {
        id: 'turkey_sweet_potato_bake',
        name: 'Turkey Sweet Potato Bake',
        meals: ['dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Turkey' },
            { role: 'CARB', prefer: 'Sweet Potato' },
            { role: 'VEG_G', prefer: 'Broccoli', fixedMass: 150 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Bake sweet potato and turkey.\n2. Steam broccoli; plate.'
    },
    {
        id: 'prawn_stir_fry',
        name: 'Prawn Stir-Fry',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Prawn' },
            { role: 'CARB', prefer: 'Rice' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Courgette', fixedMass: 100 }
        ],
        instructions: '1. Cook rice.\n2. Stir-fry prawns with peppers and courgette.'
    },
    {
        id: 'mackerel_potato_plate',
        name: 'Mackerel Potato Plate',
        meals: ['dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Mackerel' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_G', prefer: 'Green Bean', fixedMass: 120 },
            { role: 'FAT', prefer: 'Olive', fixedMass: 5, optional: true }
        ],
        instructions: '1. Boil or roast potatoes.\n2. Grill mackerel; steam green beans.'
    },
    {
        id: 'chicken_thigh_tray',
        name: 'Chicken Thigh Tray',
        meals: ['dinner'],
        zeroPrep: false,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Thigh' },
            { role: 'CARB', prefer: 'Potato' },
            { role: 'VEG_C', prefer: 'Pepper', fixedMass: 100 },
            { role: 'VEG_C', prefer: 'Onion', fixedMass: 50 }
        ],
        instructions: '1. Roast chicken thighs with potato, peppers, and onion on one tray.'
    },
    {
        id: 'quinoa_veg_power_bowl',
        name: 'Quinoa Veg Power Bowl',
        meals: ['dinner', 'lunch'],
        zeroPrep: false,
        veganOk: true,
        slots: [
            { role: 'PRO', prefer: 'Edamame' },
            { role: 'CARB', prefer: 'Quinoa' },
            { role: 'VEG_G', prefer: 'Spinach', fixedMass: 80 },
            { role: 'FAT', prefer: 'Avocado', fixedMass: 40, optional: true },
            { role: 'FAT', prefer: 'Almond', fixedMass: 15, optional: true }
        ],
        instructions: '1. Cook quinoa.\n2. Add edamame and spinach.\n3. Top with avocado and almonds.'
    },
    {
        id: 'cottage_protein_bowl',
        name: 'High-Protein Cottage Bowl',
        meals: ['dinner', 'lunch', 'breakfast'],
        zeroPrep: true,
        veganOk: false,
        slots: [
            { role: 'PRO', prefer: 'Cottage' },
            { role: 'CARB', prefer: 'Rice Cake' },
            { role: 'VEG_C', prefer: 'Tomato', fixedMass: 80 },
            { role: 'VEG_G', prefer: 'Cucumber', fixedMass: 80 }
        ],
        instructions: '1. Plate cottage cheese with rice cakes.\n2. Add tomato and cucumber.'
    }
];

export function getFlexibleRecipeById(id) {
    return FLEXIBLE_RECIPES.find(r => r.id === id) || null;
}

export function getFlexibleRecipesForMeal(meal) {
    return FLEXIBLE_RECIPES.filter(r => (r.meals || []).includes(meal));
}
