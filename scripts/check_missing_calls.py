import re
from pathlib import Path

# Collect all app function names (exported across src)
all_fns = set()
file_local = {}
file_imports = {}
file_text = {}

decl_re = re.compile(
    r"^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=",
    re.M,
)
import_re = re.compile(r"import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+['\"]([^'\"]+)['\"]", re.M | re.S)

for p in Path("src").rglob("*.js"):
    text = p.read_text(encoding="utf-8")
    file_text[p] = text
    locals_ = set()
    for m in decl_re.finditer(text):
        n = m.group(1) or m.group(2)
        locals_.add(n)
        all_fns.add(n)
    imps = set()
    for m in import_re.finditer(text):
        if m.group(1):
            imps.add(m.group(1))
        if m.group(2):
            for part in m.group(2).split(","):
                part = part.strip()
                if not part:
                    continue
                imps.add(part.split(" as ")[-1].strip() if " as " in part else part)
    file_local[p] = locals_
    file_imports[p] = imps

# Known builtins / browser / DOM to ignore
IGNORE = {
    "store", "Chart", "Promise", "Date", "Math", "JSON", "Object", "Array", "Map", "Set",
    "Error", "Number", "String", "Boolean", "parseInt", "parseFloat", "isNaN", "isFinite",
    "setTimeout", "setInterval", "clearTimeout", "clearInterval", "fetch", "confirm",
    "alert", "console", "localStorage", "sessionStorage", "document", "window", "navigator",
    "location", "history", "URL", "Blob", "FileReader", "Image", "AudioContext",
    "indexedDB", "IDBKeyRange", "crypto", "performance", "requestAnimationFrame",
    "btoa", "atob", "encodeURIComponent", "decodeURIComponent", "Intl", "RegExp",
    "Map", "WeakMap", "Symbol", "Proxy", "Reflect", "BigInt",
    "SUPABASE_URL", "SUPABASE_KEY", "DAILY_HYDRATION_TARGET_L",
    "JOURNAL_MEDIA_DB", "JOURNAL_MEDIA_STORE", "JOURNAL_MEDIA_MAX",
    "JOURNAL_MEDIA_MAX_IMAGE_BYTES", "JOURNAL_MEDIA_MAX_VIDEO_BYTES",
    "STORAGE_KEYS", "installAlerts", "bindUi", "processOfflineQueue",
    "initializeSupabase", "seedDefaultDatabase", "checkMidnightRollover",
    "applyThemeChoice",
}

missing = []
for p, text in file_text.items():
    available = file_local[p] | file_imports[p] | IGNORE
    # find calls: Name(
    for m in re.finditer(r"(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\s*\(", text):
        name = m.group(1)
        if name in IGNORE or name in available:
            continue
        if name[0].islower() or name[0].isupper():
            # only flag if it's an known app fn defined elsewhere
            if name in all_fns and name not in available:
                line = text[: m.start()].count("\n") + 1
                missing.append(f"{p}:{line}: missing import/def for {name}()")

for row in missing[:80]:
    print(row)
print("total missing", len(missing))
