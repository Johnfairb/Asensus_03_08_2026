import { store } from '../state/store.js';

const PREVIEW_ROLE_KEY = 'ascensus_network_preview_role';
const PLAYER_KEY = 'PLAYER-1XV';
const STAFF_KEY = 'STAFF-1XV';

export const DEMO_FRIENDS = [
  { username: 'Theo_C', streakDays: 12, lift: 'Bench 110kg' },
  { username: 'John_F', streakDays: 8, lift: 'Bench 95kg' },
  { username: 'Tyler_F', streakDays: 5, lift: 'Bench 87.5kg' }
];

const DEMO_ROSTER = [
  { username: 'Theo_C', status: 'available', note: false, detail: 'Full week' },
  { username: 'John_F', status: 'injured', note: true, detail: 'Hamstring · private note' },
  { username: 'Tyler_F', status: 'unavailable', note: false, detail: 'Misses Thursday' }
];

const EXEMPLAR_WORKOUT = {
  title: 'Session B — Squats',
  lines: ['5×5 @ 140kg', 'Calibrated via Ascensus GPS'],
  text: 'Session B — Squats\n5×5 @ 140kg\nCalibrated via Ascensus GPS'
};

const EXEMPLAR_MEAL = {
  title: 'High-Density Beef Bowl',
  lines: ['~720 kcal · 55g protein', 'Calibrated via Ascensus GPS'],
  text: 'High-Density Beef Bowl\n~720 kcal · 55g protein\nCalibrated via Ascensus GPS'
};

let pendingJoinRole = 'player';
let activeFriendUsername = '';
let pendingShareKind = 'workout';

function persistNetworkConfig() {
  localStorage.setItem('ascensus_settings', JSON.stringify(store.userConfig));
  if (!store.currentUser || !store.supabaseClient) return;
  store.supabaseClient.from('user_profiles').upsert({
    id: store.currentUser.id,
    config: store.userConfig
  }).then(({ error }) => {
    if (error) console.warn('Network profile cloud sync failed:', error);
  }).catch((e) => console.warn('Network profile cloud sync failed:', e));
}

export function applyNetworkKillSwitch() {
  const enabled = store.userConfig.networkEnabled !== false;
  const navItem = document.querySelector('[data-nav="network"]');
  if (navItem) navItem.style.display = enabled ? '' : 'none';

  const notice = document.getElementById('network-disabled-notice');
  if (notice) notice.classList.toggle('hidden', enabled);

  const networkTab = document.getElementById('tab-network');
  const onNetwork = networkTab && !networkTab.classList.contains('hidden');
  if (!enabled && onNetwork) {
    const fuelNav = document.querySelector('#main-nav .nav-item');
    if (fuelNav && typeof window.switchTab === 'function') {
      window.switchTab(fuelNav, 'fuel', 'Food');
    }
  }
}

export function toggleNetworkEnabled() {
  const el = document.getElementById('toggle-network');
  store.userConfig.networkEnabled = el ? !!el.checked : true;
  persistNetworkConfig();
  applyNetworkKillSwitch();
}

export function saveNetworkProfile() {
  const usernameEl = document.getElementById('network-username');
  const privateEl = document.getElementById('network-private');
  const streakEl = document.getElementById('network-show-streak');
  const liftEl = document.getElementById('network-show-lift');
  if (usernameEl) store.userConfig.networkUsername = String(usernameEl.value || '').trim();
  if (privateEl) store.userConfig.networkPrivate = !!privateEl.checked;
  if (streakEl) store.userConfig.networkShowStreak = !!streakEl.checked;
  if (liftEl) store.userConfig.networkShowLift = !!liftEl.checked;
  persistNetworkConfig();
}

export function hydrateNetworkProfileDom() {
  const setVal = (id, val, isCheck) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isCheck) el.checked = !!val;
    else el.value = val == null ? '' : String(val);
  };
  setVal('toggle-network', store.userConfig.networkEnabled !== false, true);
  setVal('network-username', store.userConfig.networkUsername || '', false);
  setVal('network-private', store.userConfig.networkPrivate !== false, true);
  setVal('network-show-streak', store.userConfig.networkShowStreak !== false, true);
  setVal('network-show-lift', store.userConfig.networkShowLift !== false, true);
  hydrateNetworkShell();
}

export function hydrateNetworkShell() {
  renderNetworkRoster();
  applyTeamRoleView();
}

export function networkDemoNotice(id, text) {
  const notice = document.getElementById(id);
  if (!notice) {
    alert(text);
    return;
  }
  notice.textContent = text;
  notice.classList.remove('hidden');
  window.clearTimeout(notice._hideTimer);
  notice._hideTimer = window.setTimeout(() => {
    notice.classList.add('hidden');
    notice.textContent = '';
  }, 2800);
}

function getPreviewRole() {
  const v = localStorage.getItem(PREVIEW_ROLE_KEY);
  return v === 'assistant' || v === 'coach' ? v : 'player';
}

function isStaffRole(role) {
  return role === 'coach' || role === 'assistant';
}

function setSubBtnActive(containerSelector, pane) {
  document.querySelectorAll(`${containerSelector} .network-team-sub-btn`).forEach((btn) => {
    const on = btn.getAttribute('data-pane') === pane;
    btn.classList.toggle('is-primary', on);
    btn.classList.toggle('active', on);
    btn.classList.toggle('is-secondary', !on);
  });
}

export function setNetworkPreviewRole(role, element) {
  const next = role === 'assistant' || role === 'coach' ? role : 'player';
  localStorage.setItem(PREVIEW_ROLE_KEY, next);
  applyTeamRoleView(element);
}

export function applyTeamRoleView() {
  const role = getPreviewRole();
  const staff = isStaffRole(role);

  document.querySelectorAll('.network-role-btn').forEach((btn) => {
    const on = btn.getAttribute('data-role') === role;
    btn.classList.toggle('is-primary', on);
    btn.classList.toggle('active', on);
    btn.classList.toggle('is-secondary', !on);
  });

  document.getElementById('network-team-player-nav')?.classList.toggle('hidden', staff);
  document.getElementById('network-team-staff-nav')?.classList.toggle('hidden', !staff);
  document.getElementById('network-announce-composer')?.classList.toggle('hidden', !staff);
  document.getElementById('network-announce-player-note')?.classList.toggle('hidden', staff);

  const current = [...document.querySelectorAll('.network-team-pane')].find((el) => !el.classList.contains('hidden'));
  const currentPane = current?.id?.replace('network-pane-', '') || 'announcements';
  switchTeamSubTab(currentPane);
}

export function switchTeamSubTab(pane, element) {
  const role = getPreviewRole();
  const staff = isStaffRole(role);
  const allowed = staff
    ? ['announcements', 'staff', 'roster']
    : ['announcements', 'status'];
  const next = allowed.includes(pane) ? pane : 'announcements';

  document.querySelectorAll('.network-team-pane').forEach((el) => el.classList.add('hidden'));
  document.getElementById(`network-pane-${next}`)?.classList.remove('hidden');

  setSubBtnActive('#network-team-player-nav', next);
  setSubBtnActive('#network-team-staff-nav', next);
  if (element) {
    const nav = element.closest('.network-sub-nav');
    if (nav) setSubBtnActive(`#${nav.id}`, next);
  }
}

function renderNetworkRoster() {
  const root = document.getElementById('network-roster-list');
  if (!root) return;
  root.innerHTML = DEMO_ROSTER.map((row) => {
    const tone = row.status === 'injured' ? 'injured' : row.status;
    const label = tone === 'injured' ? 'Injured' : tone === 'unavailable' ? 'Unavailable' : 'Available';
    const bell = row.note
      ? '<span class="network-roster-bell" title="Private note to coach"></span>'
      : '';
    return `<div class="card" style="padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <span class="network-status-dot is-${tone}" title="${label}"></span>
        <div>
          <div style="font-size:13px; font-weight:bold; color:var(--text-main);">${row.username}</div>
          <div style="font-size:10px; color:var(--text-muted); font-family:'Roboto Mono';">${row.detail}</div>
        </div>
      </div>
      ${bell}
    </div>`;
  }).join('');
}

export function submitNetworkStatus() {
  const injured = !!document.getElementById('network-status-injury')?.checked;
  const availability = document.getElementById('network-status-availability')?.value || 'available';
  const tone = injured ? 'injured' : availability;
  const label = tone === 'injured' ? 'injured' : tone === 'unavailable' ? 'unavailable this week' : 'available';
  networkDemoNotice('network-team-notice', `Status saved as ${label} (demo — coming soon)`);
}

export function openNetworkJoinTeam() {
  const modal = document.getElementById('network-join-modal');
  if (!modal) return;
  document.getElementById('network-join-key-step')?.classList.remove('hidden');
  document.getElementById('network-join-lock-step')?.classList.add('hidden');
  const keyEl = document.getElementById('network-join-key');
  if (keyEl) keyEl.value = '';
  document.getElementById('network-join-error')?.classList.add('hidden');
  modal.classList.remove('hidden');
}

export function closeNetworkJoinTeam() {
  document.getElementById('network-join-modal')?.classList.add('hidden');
}

export function continueNetworkJoin() {
  const raw = String(document.getElementById('network-join-key')?.value || '').trim().toUpperCase();
  if (!raw) {
    networkDemoNotice('network-join-error', 'Enter a passkey.');
    return;
  }
  if (raw === PLAYER_KEY) {
    pendingJoinRole = 'player';
    document.getElementById('network-join-key-step')?.classList.add('hidden');
    document.getElementById('network-join-lock-step')?.classList.remove('hidden');
    return;
  }
  if (raw === STAFF_KEY) {
    pendingJoinRole = 'assistant';
    closeNetworkJoinTeam();
    setNetworkPreviewRole('assistant');
    networkDemoNotice('network-team-notice', 'Joined as assistant (demo — coming soon). Staff thread and roster are available.');
    return;
  }
  networkDemoNotice('network-join-error', 'Unknown passkey. Demo keys: PLAYER-1XV or STAFF-1XV.');
}

export function confirmNetworkJoin() {
  closeNetworkJoinTeam();
  setNetworkPreviewRole(pendingJoinRole || 'player');
  networkDemoNotice(
    'network-team-notice',
    'Joined as player (demo). Team days would replace and lock on your plan; other days stay yours.'
  );
}

export function openNetworkCreateTeam() {
  document.getElementById('network-create-modal')?.classList.remove('hidden');
}

export function closeNetworkCreateTeam() {
  document.getElementById('network-create-modal')?.classList.add('hidden');
}

export function submitNetworkCreateTeam() {
  const name = String(document.getElementById('network-create-name')?.value || '').trim();
  closeNetworkCreateTeam();
  setNetworkPreviewRole('coach');
  networkDemoNotice(
    'network-team-notice',
    `${name || 'Team'} created (demo — coming soon). Player and assistant keys would be issued next.`
  );
}

export function filterNetworkFriends(query) {
  const q = String(query || '').trim().toLowerCase();
  const rows = document.querySelectorAll('.network-friend-row');
  let visible = 0;
  rows.forEach((row) => {
    const name = (row.getAttribute('data-username') || '').toLowerCase();
    const show = !q || name.includes(q);
    row.style.display = show ? 'flex' : 'none';
    if (show) visible += 1;
  });
  const empty = document.getElementById('network-friend-empty');
  if (empty) empty.classList.toggle('hidden', !(q && visible === 0));
}

export function sendNetworkFriendRequest() {
  const username = String(document.getElementById('network-friend-lookup')?.value || '').trim();
  if (!username) {
    networkDemoNotice('network-friend-demo-notice', 'Enter an exact username.');
    return;
  }
  networkDemoNotice('network-friend-demo-notice', `Request sent to ${username} (demo — they can accept or reject).`);
}

export function addNetworkFriendDemo(username) {
  networkDemoNotice('network-friend-demo-notice', `Request sent to ${username} (demo)`);
}

export function openNetworkFriendThread(username) {
  activeFriendUsername = username;
  const thread = document.getElementById('network-friend-thread');
  const nameEl = document.getElementById('network-friend-thread-name');
  if (nameEl) nameEl.textContent = username;
  thread?.classList.remove('hidden');
}

export function closeNetworkFriendThread() {
  document.getElementById('network-friend-thread')?.classList.add('hidden');
}

export function openNetworkShareToFriend(kind) {
  pendingShareKind = kind === 'meal' ? 'meal' : 'workout';
  const label = document.getElementById('network-share-friend-label');
  if (label) {
    const what = pendingShareKind === 'meal' ? 'recipe / meal' : 'workout';
    label.textContent = `Send this ${what} card to ${activeFriendUsername || 'your friend'}.`;
  }
  renderSharePreview(pendingShareKind);
  document.getElementById('network-share-friend-modal')?.classList.remove('hidden');
}

export function closeNetworkShareToFriend() {
  document.getElementById('network-share-friend-modal')?.classList.add('hidden');
}

export function sendNetworkShareToFriend() {
  const who = activeFriendUsername || 'your friend';
  const what = pendingShareKind === 'meal' ? 'recipe' : 'workout';
  closeNetworkShareToFriend();
  networkDemoNotice('network-friend-demo-notice', `${what} card sent to ${who} (demo — coming soon)`);
}

function buildWorkoutFromActiveLog() {
  const log = store.activeLog;
  if (!log || log.type !== 'workout' || !Array.isArray(log.items) || !log.items.length) return null;
  const lines = log.items.slice(0, 6).map((item, idx) => {
    const name = item.exercise?.name || 'Exercise';
    const sets = Array.isArray(item.sets) ? item.sets.length : 0;
    return `${String(idx + 1).padStart(2, '0')}. ${name} (${sets} sets)`;
  });
  const title = 'My Workout';
  return {
    title,
    lines: lines.length ? lines : ['Session logged'],
    text: `${title}\n${lines.join('\n')}\nCalibrated via Ascensus GPS`
  };
}

function buildMealFromActiveLog() {
  const log = store.activeLog;
  if (log && log.type !== 'workout' && Array.isArray(log.items) && log.items.length) {
    const lines = log.items.slice(0, 6).map((item) => {
      const name = item.food?._cleanName || item.food?.name || 'Food';
      const mass = Math.round(item.mass || 0);
      return `• ${mass}g ${name}`;
    });
    const c = store.consumedToday || {};
    const macro = `${Math.round(c.cals || 0)} kcal · ${Math.round(c.pro || 0)}g protein`;
    return {
      title: `Today's ${(log.type || 'meal').toUpperCase()}`,
      lines: [...lines, macro],
      text: `Today's meal\n${lines.join('\n')}\n${macro}\nCalibrated via Ascensus GPS`
    };
  }
  const c = store.consumedToday || {};
  if ((c.cals || 0) > 0 || (c.pro || 0) > 0) {
    const lines = [
      `${Math.round(c.cals || 0)} kcal`,
      `${Math.round(c.pro || 0)}g protein · ${Math.round(c.carb || 0)}g carbs · ${Math.round(c.fat || 0)}g fat`
    ];
    return {
      title: "Today's fuel",
      lines,
      text: `Today's fuel\n${lines.join('\n')}\nCalibrated via Ascensus GPS`
    };
  }
  return null;
}

export function resolveSharePayload(kind) {
  if (kind === 'meal') return buildMealFromActiveLog() || EXEMPLAR_MEAL;
  return buildWorkoutFromActiveLog() || EXEMPLAR_WORKOUT;
}

export function renderSharePreview(kind) {
  const payload = resolveSharePayload(kind || 'workout');
  const titleEl = document.getElementById('network-share-preview-title');
  const bodyEl = document.getElementById('network-share-preview-body');
  if (titleEl) titleEl.textContent = payload.title;
  if (bodyEl) bodyEl.innerHTML = payload.lines.map((l) => escapeHtml(l)).join('<br>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Share card render failed'));
      else resolve(blob);
    }, type, quality);
  });
}

async function renderShareCardImage(payload) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, 'rgba(212, 175, 55, 0.22)');
  grad.addColorStop(0.45, 'rgba(212, 175, 55, 0.04)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);

  ctx.fillStyle = '#d4af37';
  ctx.font = '600 36px "Roboto Mono", monospace';
  ctx.fillText('ASCENSUS', 96, 160);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px system-ui, sans-serif';
  wrapText(ctx, payload.title, 96, 280, canvas.width - 192, 72);

  ctx.fillStyle = '#c8c8c8';
  ctx.font = '400 40px "Roboto Mono", monospace';
  let y = 420;
  payload.lines.forEach((line) => {
    wrapText(ctx, line, 96, y, canvas.width - 192, 52);
    y += 64;
  });

  ctx.fillStyle = 'rgba(212, 175, 55, 0.9)';
  ctx.font = '500 28px "Roboto Mono", monospace';
  ctx.fillText('Calibrated for my telemetry', 96, canvas.height - 120);

  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], 'ascensus-share.png', { type: 'image/png' });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  let line = '';
  let cursorY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = words[i];
      cursorY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, cursorY);
}

async function sharePayload(kind) {
  const payload = resolveSharePayload(kind);
  renderSharePreview(kind);

  if (!navigator.share) {
    alert('System Notice: Web Share API not supported on this device/browser.');
    return;
  }

  try {
    const file = await renderShareCardImage(payload);
    const shareData = {
      title: `Ascensus · ${payload.title}`,
      text: payload.text,
      files: [file]
    };
    if (navigator.canShare && !navigator.canShare(shareData)) {
      await navigator.share({ title: shareData.title, text: shareData.text });
      return;
    }
    await navigator.share(shareData);
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    try {
      await navigator.share({ title: `Ascensus · ${payload.title}`, text: payload.text });
    } catch (err2) {
      if (err2 && err2.name === 'AbortError') return;
      console.log('Share dismissed.', err2 || err);
    }
  }
}

export async function shareNetworkWorkout() {
  return sharePayload('workout');
}

export async function shareNetworkMeal() {
  return sharePayload('meal');
}

export async function shareActiveRouteCard() {
  if (store.activeLog?.type && store.activeLog.type !== 'workout') {
    return shareNetworkMeal();
  }
  return shareNetworkWorkout();
}
