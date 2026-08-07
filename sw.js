// Ascensus Offline GPS Cache (The Tunnel Protocol)
const CACHE_NAME = 'ascensus-gps-v45';

// The critical assets required to render the UI offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './assets/logo-mark.svg',
  './assets/logo-wordmark.svg',
  './src/main.js',
  './src/config/constants.js',
  './src/config/keys.js',
  './src/state/store.js',
  './src/lib/dates.js',
  './src/lib/dates-rollover.js',
  './src/lib/food-parse.js',
  './src/lib/format.js',
  './src/lib/storage.js',
  './src/lib/idb-journal.js',
  './src/services/supabase.js',
  './src/services/auth.js',
  './src/services/offline-queue.js',
  './src/services/sync.js',
  './src/domain/sports-matrix.js',
  './src/domain/strength-engine.js',
  './src/domain/fitness-hud.js',
  './src/domain/thermodynamics.js',
  './src/domain/meal-planner.js',
  './src/domain/grocery.js',
  './src/domain/workout-generator.js',
  './src/domain/route-planner.js',
  './src/domain/periodization.js',
  './src/domain/recipes.js',
  './src/domain/food-catalog.js',
  './src/ui/alerts.js',
  './src/ui/navigation.js',
  './src/ui/theme.js',
  './src/ui/auth-onboarding.js',
  './src/ui/fuel.js',
  './src/ui/drive.js',
  './src/ui/route.js',
  './src/ui/journey.js',
  './src/ui/logistics.js',
  './src/ui/station.js',
  './src/ui/charts.js',
  './src/ui/journal.js',
  './src/ui/templates.js',
  './src/ui/demos.js',
  './src/ui/bind.js',
  './data/seed-database.json',
  './data/template-foods-catalog.json',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event - Download the app to the user's device
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching Ascensus Assets for Offline Mode');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old versions of the cache
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key)));
    })
  );
  self.clients.claim();
});

// Fetch Event - Intercept Network Requests
self.addEventListener('fetch', event => {
  // We only intercept GET requests (HTML, CSS, JS).
  // POST/PUT database syncs (like logging a set) should fail gracefully in the app layer and queue.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If network is active, update the cache silently in the background
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => {
        // If the user drops offline (e.g. basement gym), serve the cached app instantly
        return caches.match(event.request);
      })
  );
});
