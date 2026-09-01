/**
 * Form / teaching / warmup clips.
 * Source of truth: data/form-videos.json (YouTube ids only — no files in the PWA).
 */
const CATALOG_URL = 'data/form-videos.json';

const emptyCatalog = () => ({
  exercises: Object.create(null),
  teachingPoints: Object.create(null),
  prep: Object.create(null),
  prepAliases: Object.create(null)
});

let catalog = emptyCatalog();
let loadPromise = null;
let loaded = false;

function youtubeIdFrom(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i)
    || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : '';
}

function watchUrl(id) {
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

function normalizeClip(raw, fallbackLabel = 'Form video') {
  if (typeof raw === 'string') {
    const youtubeId = youtubeIdFrom(raw);
    return { label: fallbackLabel, youtubeId, videoUrl: watchUrl(youtubeId) };
  }
  if (!raw || typeof raw !== 'object') {
    return { label: fallbackLabel, youtubeId: '', videoUrl: '' };
  }
  const youtubeId = youtubeIdFrom(raw.youtubeId || raw.videoUrl || raw.url || '');
  const label = String(raw.label || fallbackLabel).trim() || fallbackLabel;
  return { label, youtubeId, videoUrl: watchUrl(youtubeId) };
}

function clipsFrom(entry, fallbackLabel) {
  if (entry == null) return [];
  const list = Array.isArray(entry) ? entry : [entry];
  return list.map((raw) => normalizeClip(raw, fallbackLabel)).filter((c) => c.youtubeId);
}

function lowerKeyMap(obj) {
  const out = Object.create(null);
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) out[String(k).trim().toLowerCase()] = v;
  return out;
}

function ingest(data) {
  const next = emptyCatalog();
  if (!data || typeof data !== 'object') return next;
  next.exercises = data.exercises && typeof data.exercises === 'object' ? data.exercises : Object.create(null);
  next.teachingPoints = lowerKeyMap(data.teachingPoints);
  next.prep = lowerKeyMap(data.prep);
  next.prepAliases = lowerKeyMap(data.prepAliases);
  return next;
}

export function ensureFormVideos() {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`form-videos.json ${res.status}`);
      return res.json();
    })
    .then((data) => {
      catalog = ingest(data);
      loaded = true;
      try { document.dispatchEvent(new CustomEvent('ascensus-form-videos-ready')); } catch (e) { /* ignore */ }
      return catalog;
    })
    .catch((err) => {
      console.warn('Form video catalog unavailable:', err);
      catalog = emptyCatalog();
      loaded = true;
      return catalog;
    });
  return loadPromise;
}

ensureFormVideos();

export function lookupExerciseClips(name) {
  if (!loaded) ensureFormVideos();
  const key = String(name || '').trim();
  if (!key) return [];
  const direct = catalog.exercises[key];
  if (direct) return clipsFrom(direct, key);
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(catalog.exercises)) {
    if (String(k).toLowerCase() === lower) return clipsFrom(v, k);
  }
  return [];
}

export function lookupTeachingPointUrl(label) {
  if (!loaded) ensureFormVideos();
  const key = String(label || '').trim().toLowerCase();
  if (!key) return '';
  const clips = clipsFrom(catalog.teachingPoints[key], label);
  return clips[0]?.videoUrl || '';
}

export function lookupPrepClips(name) {
  if (!loaded) ensureFormVideos();
  let key = String(name || '').trim().toLowerCase();
  if (!key) return [];
  if (catalog.prepAliases[key]) key = catalog.prepAliases[key];
  return clipsFrom(catalog.prep[key], name);
}
