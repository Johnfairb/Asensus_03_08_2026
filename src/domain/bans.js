/** Ban / unban foods and exercises (persisted in localStorage). */

const FOOD_KEY = 'ascensus_banned_foods';
const EXERCISE_KEY = 'ascensus_banned_exercises';

function loadSet(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set((Array.isArray(raw) ? raw : []).map(String));
  } catch (e) {
    return new Set();
  }
}

function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

export function getBannedFoodIds() {
  return loadSet(FOOD_KEY);
}

export function getBannedExerciseIds() {
  return loadSet(EXERCISE_KEY);
}

export function isFoodBanned(id) {
  if (id == null || id === '') return false;
  return getBannedFoodIds().has(String(id));
}

export function isExerciseBanned(id) {
  if (id == null || id === '') return false;
  return getBannedExerciseIds().has(String(id));
}

export function setFoodBanned(id, banned) {
  if (id == null || id === '') return;
  const set = getBannedFoodIds();
  if (banned) set.add(String(id));
  else set.delete(String(id));
  saveSet(FOOD_KEY, set);
}

export function setExerciseBanned(id, banned) {
  if (id == null || id === '') return;
  const set = getBannedExerciseIds();
  if (banned) set.add(String(id));
  else set.delete(String(id));
  saveSet(EXERCISE_KEY, set);
}

export function toggleFoodBan(id) {
  const next = !isFoodBanned(id);
  setFoodBanned(id, next);
  return next;
}

export function toggleExerciseBan(id) {
  const next = !isExerciseBanned(id);
  setExerciseBanned(id, next);
  return next;
}

/** Drop banned foods from planning / shopping / dropdown lists. */
export function excludeBannedFoods(foods) {
  if (!Array.isArray(foods)) return [];
  const banned = getBannedFoodIds();
  if (!banned.size) return foods;
  return foods.filter(f => !banned.has(String(f.id)));
}

/** Drop banned exercises from planning / dropdown lists. */
export function excludeBannedExercises(exercises) {
  if (!Array.isArray(exercises)) return [];
  const banned = getBannedExerciseIds();
  if (!banned.size) return exercises;
  return exercises.filter(e => !banned.has(String(e.id)));
}
