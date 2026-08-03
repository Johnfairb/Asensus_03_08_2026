import re
from pathlib import Path

cache = {}


def all_exports(path, seen=None):
    path = str(Path(path).resolve())
    if path in cache:
        return cache[path]
    if seen is None:
        seen = set()
    if path in seen:
        return set()
    seen.add(path)
    text = Path(path).read_text(encoding="utf-8")
    names = set()
    for m in re.finditer(r"^export (?:async )?function (\w+)", text, re.M):
        names.add(m.group(1))
    for m in re.finditer(r"^export (?:const|let|var) (\w+)", text, re.M):
        names.add(m.group(1))
    for m in re.finditer(
        r"export \{([^}]+)\} from ['\"]([^'\"]+)['\"]", text, re.M | re.S
    ):
        specs = m.group(1)
        rel = m.group(2)
        target = (Path(path).parent / rel).resolve()
        te = all_exports(target, seen)
        for part in specs.split(","):
            part = part.strip()
            if not part:
                continue
            if " as " in part:
                src, dst = [x.strip() for x in part.split(" as ")]
                names.add(dst)
                if src not in te:
                    print(f"REEXPORT MISS: {Path(path).name} wants {src} from {target.name}")
            else:
                names.add(part)
                if part not in te:
                    print(f"REEXPORT MISS: {Path(path).name} wants {part} from {target.name}")
    cache[path] = names
    return names


import_re = re.compile(
    r"import\s+(?:(\w+)|\{([^}]+)\}|(\*\s+as\s+\w+))\s+from\s+['\"]([^'\"]+)['\"]",
    re.M | re.S,
)
errors = 0
for p in Path("src").rglob("*.js"):
    text = p.read_text(encoding="utf-8")
    for m in import_re.finditer(text):
        default, named, star, rel = m.groups()
        if not rel.endswith(".js"):
            continue
        target = (p.parent / rel).resolve()
        if not target.exists():
            print(f"MISSING FILE: {p} -> {rel}")
            errors += 1
            continue
        if named:
            te = all_exports(target)
            for part in named.split(","):
                part = part.strip()
                if not part:
                    continue
                src = part.split(" as ")[0].strip() if " as " in part else part
                if src not in te:
                    print(f"MISSING EXPORT: {p.name} imports {src} from {target.name}")
                    errors += 1
print("errors", errors)
