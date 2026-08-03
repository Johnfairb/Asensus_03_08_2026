#!/usr/bin/env python3
"""
Split app.js into the planned src/ ES-module tree.
Preserves behavior: store mutation + named exports + circular-safe imports.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = (ROOT / "app.js").read_text(encoding="utf-8")
LINES = APP.splitlines(keepends=True)

STORE_VARS = [
    "supabaseClient",
    "globalFoodDB",
    "globalExerciseDB",
    "globalTemplates",
    "currentRefund",
    "globalGroupedHistory",
    "currentUser",
    "userConfig",
    "activeLog",
    "consumedToday",
    "mealMacroPieCharts",
    "fatigueLockouts",
    "offlineQueue",
    "unifiedChartInstance",
    "macroChartInstance",
    "dailyFitnessTargets",
    "currentFitnessScore",
    "ghostOverrides",
    "currentGhostItems",
    "modalExerciseChartInstance",
    "restIntervals",
    "exerciseChartInstance",
    "savedTargets",
    "_weekPlanCache",
    "specificSchedules",
]

# 1-based inclusive line ranges from section markers / logical splits
# (end inclusive)
MODULES = [
    # (path, start, end, kind) kind helps header generation
    ("src/lib/food-parse.js", 61, 103, "lib"),
    ("src/ui/alerts.js", 15, 38, "ui"),
    ("src/services/offline-queue.js", 148, 166, "service"),
    ("src/services/supabase.js", 174, 196, "service"),
    ("src/services/auth.js", 199, 289, "service"),
    ("src/ui/auth-onboarding.js", 291, 447, "ui"),
    ("src/lib/dates-rollover.js", 450, 463, "lib"),
    ("src/domain/sports-matrix.js", 469, 503, "domain"),
    ("src/domain/strength-engine.js", 504, 931, "domain"),
    ("src/domain/fitness-hud.js", 932, 1556, "domain"),
    ("src/ui/navigation.js", 1558, 1604, "ui"),
    ("src/domain/thermodynamics.js", 1606, 1898, "domain"),
    ("src/domain/meal-planner.js", 1900, 2035, "domain"),
    ("src/ui/theme.js", 2037, 2053, "ui"),
    ("src/ui/fuel.js", 2055, 2407, "ui"),
    ("src/domain/grocery.js", 2409, 2548, "domain"),
    ("src/ui/templates.js", 2550, 3085, "ui"),
    ("src/domain/workout-generator.js", 3087, 3421, "domain"),
    ("src/ui/drive.js", 3423, 4545, "ui"),
    ("src/ui/journey.js", 4547, 5194, "ui"),
    ("src/ui/charts.js", 5196, 5553, "ui"),
    ("src/ui/demos.js", 5555, 5667, "ui"),
    ("src/ui/logistics.js", 5669, 5701, "ui"),
    ("src/domain/route-planner.js", 5703, 7246, "domain"),
    ("src/domain/periodization.js", 7248, 7545, "domain"),
    ("src/domain/recipes.js", 7546, 7597, "domain"),
    ("src/ui/route.js", 7599, 7809, "ui"),
]

DECL_RE = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)|"
    r"^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=",
    re.M,
)
WINDOW_ASSIGN_RE = re.compile(
    r"^window\.(\w+)\s*=\s*(.+?);\s*$",
    re.M,
)


def slice_lines(start: int, end: int) -> str:
    return "".join(LINES[start - 1 : end])


def collect_decls(text: str) -> set[str]:
    names = set()
    for m in DECL_RE.finditer(text):
        names.add(m.group(1) or m.group(2))
    # also window.foo = function... inline names already in WINDOW
    for m in WINDOW_ASSIGN_RE.finditer(text):
        # if RHS is bare identifier, that name is used; LHS is window binding
        pass
    return names


def rewrite_store_refs(text: str) -> str:
    # Skip rewriting inside strings is hard; do identifier-boundary replace.
    # Protect store. already-prefixed.
    for var in sorted(STORE_VARS, key=len, reverse=True):
        text = re.sub(rf"(?<![\w.]){re.escape(var)}(?!\s*:)(?!\w)", f"store.{var}", text)
        # Fix broken object literal shorthand that became store.x: — rare; undo key case
        text = text.replace(f"store.{var}:", f"{var}:")
    # Fix double-prefix if any
    text = text.replace("store.store.", "store.")
    return text


def strip_window_assigns(text: str) -> tuple[str, list[tuple[str, str]]]:
    binds = []
    out_lines = []
    for line in text.splitlines(keepends=True):
        m = re.match(r"^window\.(\w+)\s*=\s*(.+?);\s*\n?$", line)
        if m:
            binds.append((m.group(1), m.group(2).strip()))
            continue
        out_lines.append(line)
    return "".join(out_lines), binds


def exportify(text: str) -> str:
    text = re.sub(r"^async function\s+", "export async function ", text, flags=re.M)
    text = re.sub(r"^function\s+", "export function ", text, flags=re.M)
    text = re.sub(r"^const\s+", "export const ", text, flags=re.M)
    text = re.sub(r"^let\s+", "export let ", text, flags=re.M)
    # Avoid double export
    text = text.replace("export export ", "export ")
    return text


def find_refs(text: str, all_names: set[str], own: set[str]) -> set[str]:
    refs = set()
    for name in all_names - own:
        if re.search(rf"(?<![\w.]){re.escape(name)}(?!\w)", text):
            refs.add(name)
    return refs


def main() -> None:
    # --- keys ---
    keys_src = ROOT / "keys.js"
    keys_dst = ROOT / "src" / "config" / "keys.js"
    keys_dst.write_text(keys_src.read_text(encoding="utf-8"), encoding="utf-8")

    # --- constants ---
    (ROOT / "src" / "config" / "constants.js").write_text(
        """export const DAILY_HYDRATION_TARGET_L = 3.0;

export const STORAGE_KEYS = {
  offlineQueue: 'ascensus_offline_queue',
  theme: 'ascensus_theme',
  themeChosen: 'ascensus_theme_chosen',
  lastActive: 'ascensus_last_active',
  metricTargets: 'ascensus_metric_targets',
  fixedSchedules: 'ascensus_fixed_schedules',
  journalMediaDb: 'ascensus_journal_media',
};

export const JOURNAL_MEDIA_DB = 'ascensus_journal_media';
export const JOURNAL_MEDIA_STORE = 'files';
export const JOURNAL_MEDIA_MAX = 4;
export const JOURNAL_MEDIA_MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const JOURNAL_MEDIA_MAX_VIDEO_BYTES = 40 * 1024 * 1024;
""",
        encoding="utf-8",
    )

    # --- store ---
    (ROOT / "src" / "state" / "store.js").write_text(
        """/** Shared mutable app state — import and mutate fields in place. */
export const store = {
  supabaseClient: null,
  currentUser: null,
  globalFoodDB: [],
  globalExerciseDB: [],
  globalTemplates: [],
  currentRefund: { cals: 0, carbs: 0 },
  globalGroupedHistory: {},
  userConfig: {
    weight: 84, targetWeight: 75, height: 180, age: 25, bodyFat: 0, sex: 'Male', activity: 1.55, goal: 'Fat_Loss',
    mealsPerDay: 3, budget: 15.00, trainingFreq: 4,
    gymWillingness: 4, maxGymTime: 90, bandAuxiliary: false,
    baselineTargets: { cals: 0, pro: 0, carb: 0, fat: 0 },
    targets: { cals: 0, pro: 0, carb: 0, fat: 0 },
    restStop: false, dependentAthlete: false, tdeePenalty: 0,
    diet: 'Standard', injury: 'None', sport: 'None', repairLevel: 4,
    trainingWindow: 'Afternoon', seasonPhase: 'OffSeason_Strength',
    experience: 'Beginner', oneRepMax: { squat: 0, bench: 0, deadlift: 0 }, canDoPullups: 'Yes',
    guidanceOff: { food: false, workout: false, timetabling: false },
    injuryRecord: null
  },
  activeLog: { type: 'breakfast', items: [] },
  consumedToday: { cals: 0, pro: 0, carb: 0, fat: 0, cost: 0, mealsLogged: 0, water: 0 },
  mealMacroPieCharts: [],
  fatigueLockouts: {},
  offlineQueue: JSON.parse(localStorage.getItem('ascensus_offline_queue')) || [],
  unifiedChartInstance: null,
  macroChartInstance: null,
  dailyFitnessTargets: { str: 0, pow: 0, spd: 0, crd: 0, end: 0 },
  currentFitnessScore: { str: 0, pow: 0, spd: 0, crd: 0, end: 0 },
  ghostOverrides: {},
  currentGhostItems: [],
  modalExerciseChartInstance: null,
  restIntervals: {},
  exerciseChartInstance: null,
  savedTargets: JSON.parse(localStorage.getItem('ascensus_metric_targets')) || {},
  _weekPlanCache: { key: '', plan: null },
  specificSchedules: {},
};
""",
        encoding="utf-8",
    )

    # --- move data files ---
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    for p in ROOT.glob("demo-*.json"):
        shutil.copy2(p, data_dir / p.name)
    seed = ROOT / "seed-database.json"
    if seed.exists():
        shutil.copy2(seed, data_dir / "seed-database.json")

    # Extract module bodies
    module_bodies: dict[str, str] = {}
    module_decls: dict[str, set[str]] = {}
    all_binds: list[tuple[str, str]] = []
    name_to_module: dict[str, str] = {}

    for path, start, end, _kind in MODULES:
        raw = slice_lines(start, end)
        # Remove section banner comments only at start — keep code comments
        raw, binds = strip_window_assigns(raw)
        all_binds.extend(binds)
        # Drop DAILY_HYDRATION const if present (lives in constants)
        raw = re.sub(
            r"^export const DAILY_HYDRATION_TARGET_L = 3\.0;\s*\n?",
            "",
            raw,
            flags=re.M,
        )
        raw = re.sub(
            r"^const DAILY_HYDRATION_TARGET_L = 3\.0;\s*\n?",
            "",
            raw,
            flags=re.M,
        )
        # Drop journal media consts (in constants) from journey slice
        for cname in (
            "JOURNAL_MEDIA_DB",
            "JOURNAL_MEDIA_STORE",
            "JOURNAL_MEDIA_MAX",
            "JOURNAL_MEDIA_MAX_IMAGE_BYTES",
            "JOURNAL_MEDIA_MAX_VIDEO_BYTES",
        ):
            raw = re.sub(rf"^const {cname} = .+;\s*\n?", "", raw, flags=re.M)

        # Remove top-level store var declarations BEFORE rewriting refs
        for var in STORE_VARS:
            raw = re.sub(rf"^(?:let|const|var)\s+{var}\s*;\s*\n?", "", raw, flags=re.M)
            raw = re.sub(
                rf"^(?:let|const|var)\s+{var}\b\s*=\s*[^;]*;\s*\n?",
                "",
                raw,
                flags=re.M,
            )

        raw = rewrite_store_refs(raw)
        # Fix seed path + demo paths
        raw = raw.replace("fetch('seed-database.json')", "fetch('data/seed-database.json')")
        raw = raw.replace('fetch("seed-database.json")', 'fetch("data/seed-database.json")')
        # demos: injectPitchData fetches filename from selector — update HTML later; also prefix in demos if needed

        # Use constants for hydration target
        if "DAILY_HYDRATION_TARGET_L" in raw and "from '../config/constants.js'" not in raw:
            pass  # import added later

        raw = exportify(raw)
        module_bodies[path] = raw
        decls = collect_decls(raw)
        # Also catch `export function foo`
        module_decls[path] = decls
        for d in decls:
            name_to_module[d] = path

    # Special: meal pie charts were in section 1 — put in meal-planner or charts
    pies = slice_lines(105, 145)
    pies = rewrite_store_refs(pies)
    pies = exportify(pies)
    module_bodies["src/domain/meal-planner.js"] = pies + "\n" + module_bodies["src/domain/meal-planner.js"]
    for d in collect_decls(pies):
        module_decls["src/domain/meal-planner.js"].add(d)
        name_to_module[d] = "src/domain/meal-planner.js"

    # Hydration helpers that use dateToISO — already in food-parse slice but dateToISO is later
    # food-parse needs dateToISO from route-planner — circular OK

    all_names = set(name_to_module.keys())

    # Constants imported by name
    CONST_NAMES = {
        "DAILY_HYDRATION_TARGET_L",
        "JOURNAL_MEDIA_DB",
        "JOURNAL_MEDIA_STORE",
        "JOURNAL_MEDIA_MAX",
        "JOURNAL_MEDIA_MAX_IMAGE_BYTES",
        "JOURNAL_MEDIA_MAX_VIDEO_BYTES",
    }

    def rel_import(from_path: str, to_path: str) -> str:
        from_p = Path(from_path).parent
        to_p = Path(to_path)
        rel = Path(os_path_rel(from_p, to_p)).as_posix()
        if not rel.startswith("."):
            rel = "./" + rel
        return rel

    def os_path_rel(from_dir: Path, to_file: Path) -> str:
        # from_dir like src/ui, to_file like src/domain/x.js
        import os

        return os.path.relpath(to_file.as_posix(), from_dir.as_posix()).replace("\\", "/")

    # Build imports + write files
    for path, body in module_bodies.items():
        own = module_decls[path]
        refs = find_refs(body, all_names, own)
        # Remove refs that are STORE (already store.x) — not in all_names as bare
        const_refs = {n for n in CONST_NAMES if re.search(rf"(?<![\w.]){re.escape(n)}(?!\w)", body)}

        # Group refs by module
        by_mod: dict[str, list[str]] = {}
        for name in sorted(refs):
            mod = name_to_module.get(name)
            if not mod or mod == path:
                continue
            by_mod.setdefault(mod, []).append(name)

        import_lines = ["import { store } from '" + rel_import(path, Path("src/state/store.js")) + "';"]
        if const_refs:
            import_lines.append(
                "import { "
                + ", ".join(sorted(const_refs))
                + " } from '"
                + rel_import(path, Path("src/config/constants.js"))
                + "';"
            )
        # keys for supabase
        if path == "src/services/supabase.js":
            import_lines.append(
                "import { SUPABASE_URL, SUPABASE_KEY } from '"
                + rel_import(path, Path("src/config/keys.js"))
                + "';"
            )

        for mod, names in sorted(by_mod.items()):
            import_lines.append(
                "import { "
                + ", ".join(names)
                + " } from '"
                + rel_import(path, Path(mod))
                + "';"
            )

        # Strip leftover section headers that are only banners — keep
        # Remove initializeSupabase() call and setTimeout side effects from bodies — handle in main
        cleaned = body
        if path == "src/services/supabase.js":
            cleaned = re.sub(r"^initializeSupabase\(\);\s*\n?", "", cleaned, flags=re.M)
        if path == "src/ui/auth-onboarding.js":
            cleaned = re.sub(r"^setTimeout\(seedDefaultDatabase, 2000\);\s*\n?", "", cleaned, flags=re.M)
        if path == "src/lib/dates-rollover.js":
            cleaned = re.sub(
                r'^document\.addEventListener\("visibilitychange".*?\);\s*\n?',
                "",
                cleaned,
                flags=re.M,
            )
            cleaned = re.sub(r"^setTimeout\(checkMidnightRollover, 1000\);\s*\n?", "", cleaned, flags=re.M)
        if path == "src/services/offline-queue.js":
            cleaned = re.sub(r"^window\.addEventListener\('online', processOfflineQueue\);\s*\n?", "", cleaned, flags=re.M)
            cleaned = re.sub(r"^setInterval\(processOfflineQueue, 15000\);\s*\n?", "", cleaned, flags=re.M)

        # Remove empty export let lines left over
        header = "\n".join(import_lines) + "\n\n"
        out = header + cleaned
        out_path = ROOT / path
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(out, encoding="utf-8")
        print(f"Wrote {path} ({len(own)} decls, {len(by_mod)} import mods)")

    # --- bind.js ---
    # Collect all window assigns from original + section 15
    section15 = slice_lines(7811, 7916)
    more_binds = []
    for m in WINDOW_ASSIGN_RE.finditer(section15):
        more_binds.append((m.group(1), m.group(2).strip()))
    # merge unique by name (later wins)
    bind_map = {}
    for name, rhs in all_binds + more_binds:
        bind_map[name] = rhs

    # Inline functions in bind for shareActiveRoute etc.
    bind_imports: dict[str, set[str]] = {}
    bind_lines = ["import { store } from '../state/store.js';"]
    special_fns = []

    for name, rhs in sorted(bind_map.items()):
        if rhs.startswith("async function") or rhs.startswith("function"):
            special_fns.append((name, rhs))
            continue
        if rhs.startswith("function"):
            special_fns.append((name, rhs))
            continue
        # bare identifier or expression
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rhs):
            mod = name_to_module.get(rhs)
            if mod:
                bind_imports.setdefault(mod, set()).add(rhs)
            bind_lines.append(f"// bound below: {name}")
        else:
            special_fns.append((name, rhs))

    bind_body = []
    bind_body.append("export function bindUi() {")
    # window flags
    bind_body.append("  window.weightLoggedToday = false;")
    bind_body.append("  window.completedStatusGlobal = { BRK: false, LUN: false, DIN: false, WRK: false };")
    bind_body.append("  window.currentModalExIdx = null;")
    bind_body.append("  window._journalPendingMedia = [];")

    for mod, names in sorted(bind_imports.items()):
        bind_lines.insert(
            1,
            "import { "
            + ", ".join(sorted(names))
            + " } from '"
            + rel_import("src/ui/bind.js", Path(mod))
            + "';",
        )

    for name, rhs in sorted(bind_map.items()):
        if rhs.startswith("async function") or rhs.startswith("function") or (not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rhs) and name == "shareActiveRoute"):
            continue
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rhs):
            bind_body.append(f"  window.{name} = {rhs};")
        # else handle below

    # shareActiveRoute from original
    bind_body.append("""
  window.shareActiveRoute = async function() {
    if (!navigator.share) return alert("System Notice: Web Share API not supported on this device/browser.");
    let text = `🔥 Ascensus GPS Route: [ ${store.activeLog.type.toUpperCase()} ]\\n\\n`;
    store.activeLog.items.forEach((i, idx) => {
        if(store.activeLog.type === 'workout') text += `0${idx+1}. ${i.exercise.name} (${i.sets.length} Sets)\\n`;
        else text += `• ${Math.round(i.mass)}g ${i.food._cleanName}\\n`;
    });
    text += `\\nCalibrated for my specific telemetry via Ascensus.`;
    try {
        await navigator.share({ title: 'My Ascensus Route', text: text });
    } catch(err) { console.log("Share dismissed.", err); }
  };
""")

    # Other inline window assigns that aren't bare ids
    for name, rhs in sorted(bind_map.items()):
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rhs):
            continue
        if name == "shareActiveRoute":
            continue
        if name in ("alert",):
            continue
        # expressions like calculateLiveFitnessScores or function(...)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", rhs.strip()):
            bind_body.append(f"  window.{name} = {rhs};")
        elif "function" in rhs:
            # rewrite store refs in inline
            inline = rewrite_store_refs(rhs)
            bind_body.append(f"  window.{name} = {inline};")
        else:
            bind_body.append(f"  window.{name} = {rhs};")

    bind_body.append("}")

    # Deduplicate import lines
    seen = set()
    uniq_imports = []
    for line in bind_lines:
        if line in seen:
            continue
        if line.startswith("// bound"):
            continue
        seen.add(line)
        uniq_imports.append(line)

    (ROOT / "src" / "ui" / "bind.js").write_text(
        "\n".join(uniq_imports) + "\n\n" + "\n".join(bind_body) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote bind.js with {len(bind_map)} bindings")

    # --- lib/storage.js, format.js, dates.js thin helpers ---
    (ROOT / "src" / "lib" / "storage.js").write_text(
        """export function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

export function lsGetJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch (e) {
    return fallback;
  }
}

export function lsSet(key, value) {
  localStorage.setItem(key, value);
}

export function lsSetJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
""",
        encoding="utf-8",
    )

    (ROOT / "src" / "lib" / "format.js").write_text(
        """export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
""",
        encoding="utf-8",
    )

    (ROOT / "src" / "lib" / "dates.js").write_text(
        """/** Re-export calendar helpers from route-planner for clearer imports. */
export { dateToISO, addDaysISO, getMondayISO, getISOWeekNumber } from '../domain/route-planner.js';
""",
        encoding="utf-8",
    )

    # idb stub note — journal stays in journey.js; create thin re-export file
    (ROOT / "src" / "lib" / "idb-journal.js").write_text(
        """/** Journal media IndexedDB helpers live in ui/journey.js; re-export for plan path. */
export {
  openJournalMediaDB,
  idbPutJournalMedia,
  idbGetJournalMedia,
  resetJournalMedia,
  renderJournalMediaPreview,
  removeJournalMedia,
  onJournalMediaSelected,
  persistPendingJournalMedia,
  buildJournalMediaGalleryHtml,
} from '../ui/journey.js';
""",
        encoding="utf-8",
    )

    # sync.js — thin re-exports of inventory loaders for plan path
    (ROOT / "src" / "services" / "sync.js").write_text(
        """export { loadInventory, loadExercises, deleteItem, saveFoodToCloud, saveExerciseToCloud } from '../ui/fuel.js';
export { loadTemplates } from '../ui/templates.js';
export { loadHistory } from '../ui/journey.js';
export { persistUserConfigToCloud, captureSyncedLocalState, restoreSyncedLocalState, applyUserConfigToDom } from '../domain/thermodynamics.js';
""",
        encoding="utf-8",
    )

    # station.js — settings UI pieces from thermodynamics + periodization
    (ROOT / "src" / "ui" / "station.js").write_text(
        """export {
  saveSettings,
  handleSportChange,
  toggleRestStop,
  calculateAchievability,
  handleFocusChange,
} from '../domain/thermodynamics.js';

export {
  saveSeasonDates,
  clearSeasonDates,
  triggerRepairModeCheck,
  submitRepairAssessment,
  updateInjuryStatusPanel,
} from '../domain/periodization.js';
""",
        encoding="utf-8",
    )

    # journal.js re-exports
    (ROOT / "src" / "ui" / "journal.js").write_text(
        """export {
  configureJournalModal,
  dismissJournalModal,
  onJournalMediaSelected,
  removeJournalMedia,
  resetJournalMedia,
  renderJournalMediaPreview,
  persistPendingJournalMedia,
  savePracticeJournalEntry,
  saveMatchJournalEntry,
  saveGymJournalEntry,
  loadDayJournal,
} from './journey.js';
""",
        encoding="utf-8",
    )

    # --- main.js ---
    (ROOT / "src" / "main.js").write_text(
        """import { installAlerts } from './ui/alerts.js';
import { initializeSupabase } from './services/supabase.js';
import { processOfflineQueue } from './services/offline-queue.js';
import { seedDefaultDatabase } from './ui/auth-onboarding.js';
import { checkMidnightRollover } from './lib/dates-rollover.js';
import { bindUi } from './ui/bind.js';
import { applyThemeChoice } from './ui/auth-onboarding.js';

installAlerts();
bindUi();

// Hydrate theme before paint of auth UI
const savedTheme = localStorage.getItem('ascensus_theme') || 'dark';
applyThemeChoice(savedTheme === 'light' ? 'light' : 'dark');

initializeSupabase();

window.addEventListener('online', processOfflineQueue);
setInterval(processOfflineQueue, 15000);

setTimeout(seedDefaultDatabase, 2000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkMidnightRollover();
});
setTimeout(checkMidnightRollover, 1000);
""",
        encoding="utf-8",
    )

    # Fix alerts.js to export installAlerts
    alerts_path = ROOT / "src" / "ui" / "alerts.js"
    alerts = alerts_path.read_text(encoding="utf-8")
    if "export function installAlerts" not in alerts:
        # wrap window.alert assignment
        alerts = alerts.replace(
            "window.alert = function(msg) {",
            "export function installAlerts() {\nwindow.alert = function(msg) {",
        )
        # close at end — append closing brace carefully
        if not alerts.rstrip().endswith("}"):
            pass
        alerts = alerts.rstrip() + "\n}\n"
        # Actually the file has two window assigns; wrap both inside installAlerts
        alerts_path.write_text(
            """import { store } from '../state/store.js';

export function installAlerts() {
  window.alert = function(msg) {
    const box = document.getElementById('tactical-alert-box');
    const text = document.getElementById('tactical-alert-text');
    if(box && text) {
        if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        text.innerText = msg;
        box.style.top = '40px';
        setTimeout(() => { box.style.top = '-100px'; }, 4000);
    } else {
        console.log("ALERT:", msg);
    }
  };

  window.toggleCartStrike = function(checkbox) {
    const parent = checkbox.closest('.card');
    if(checkbox.checked) {
        parent.style.opacity = '0.4';
        parent.style.textDecoration = 'line-through';
    } else {
        parent.style.opacity = '1';
        parent.style.textDecoration = 'none';
    }
  };
}
""",
            encoding="utf-8",
        )

    print("Done scaffolding modules.")


if __name__ == "__main__":
    main()
