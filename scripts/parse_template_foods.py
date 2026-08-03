"""Parse Template_foods.txt into seed-compatible JSON foods."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Template_foods.txt"
SEED = ROOT / "data" / "seed-database.json"
CATALOG = ROOT / "data" / "template-foods-catalog.json"

HEADING_TO_CAT = {
    "meat": "PRO",
    "fruit": "CARB",
    "vegetables": "VEG_G",
    "carbs": "CARB",
    "animal products": "PRO",
    "fish": "PRO",
    "nuts": "FAT",
    "drinks": "LIQUID",
    "oils and condiments": "FAT",
}

COLUMN_HEADERS = {"food", "cheap", "medium", "expensive", "carbs", "fat", "protein"}

NAME_CAT_OVERRIDES = [
    (re.compile(r"\bmilk\b", re.I), "LIQUID"),
    (re.compile(r"\bhoney\b", re.I), "FAT"),
    (re.compile(r"\bbutter\b", re.I), "FAT"),
    (re.compile(r"\boil\b", re.I), "FAT"),
    (re.compile(r"\bjam\b", re.I), "CARB"),
    (re.compile(r"\bjuice\b", re.I), "LIQUID"),
    (re.compile(r"\bcoffee\b", re.I), "LIQUID"),
    (re.compile(r"\bcoconut water\b", re.I), "LIQUID"),
    (re.compile(r"tomato", re.I), "VEG_C"),
    (re.compile(r"carrot", re.I), "VEG_C"),
    (re.compile(r"\bonion\b|sweetcorn", re.I), "VEG_C"),
]

NOTE_IN_PRICE = re.compile(r"\((?:canned|bought in[^)]*)\)", re.I)


def is_section_heading(line: str) -> str | None:
    s = line.strip()
    if not s:
        return None
    # Require a colon so column header "Carbs" is not treated as a section
    m = re.match(r"^([A-Za-z][A-Za-z /]+?)\s*:", s)
    if m:
        key = m.group(1).strip().lower()
        if key in HEADING_TO_CAT:
            return key
    # "Drinks" / "Nuts" without colon (standalone short labels)
    low = s.lower().rstrip(":")
    if low in HEADING_TO_CAT and low not in COLUMN_HEADERS and "\t" not in line and len(s) < 28:
        # only if the line has no digits (not a food name)
        if not re.search(r"\d", s):
            return low
    return None


def parse_number(raw: str) -> float | None:
    if raw is None:
        return None
    s = NOTE_IN_PRICE.sub("", raw).strip()
    if not s:
        return None
    m = re.match(r"^([0-9]+(?:\.[0-9]+)?)", s)
    if not m:
        return None
    return float(m.group(1))


def extract_pack_size(name: str) -> tuple[float | None, str | None]:
    """Return (amount_for_math_as_g_equiv, display_unit) where unit is g|ml|l."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*kg", name, re.I)
    if m:
        return float(m.group(1)) * 1000, "g"
    m = re.search(r"(\d+(?:\.\d+)?)\s*litres?", name, re.I)
    if m:
        litres = float(m.group(1))
        return litres * 1000, "l"
    m = re.search(r"(\d+(?:\.\d+)?)\s*ml", name, re.I)
    if m:
        ml = float(m.group(1))
        return ml, "ml"
    m = re.search(r"(\d+(?:\.\d+)?)\s*g\b", name, re.I)
    if m:
        return float(m.group(1)), "g"
    return None, None


def extract_pack_g(name: str) -> float | None:
    amount, _unit = extract_pack_size(name)
    return amount


def extract_unit_count(name: str) -> int | None:
    # "bought in 4" / "bought in 6 pack" — but not "bought in 1kg"
    m = re.search(r"bought in\s+(\d+)(?!\s*(?:kg|g|ml)\b)(?:\s*pack)?", name, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"\((\d+)\s*pack\)", name, re.I)
    if m:
        return int(m.group(1))
    return None


def clean_display_name(name: str) -> str:
    s = re.sub(r"\s+", " ", name).strip()
    s = s.replace("Meetballs", "Meatballs")
    s = s.replace("Motzarella", "Mozzarella")
    s = s.replace("Brocoli", "Broccoli")
    return s


def category_for(heading: str, name: str) -> str:
    for rx, cat in NAME_CAT_OVERRIDES:
        if rx.search(name):
            return cat
    return HEADING_TO_CAT.get(heading, "MISC")


# Typical edible moisture (g water / 100 g). Name overrides win over category defaults.
CATEGORY_WATER_PER_100G = {
    "LIQUID": 95.0,
    "VEG_G": 90.0,
    "VEG_C": 88.0,
    "PRO": 65.0,
    "CARB": 40.0,
    "FAT": 5.0,
    "MISC": 50.0,
}

NAME_WATER_OVERRIDES = [
    (re.compile(r"\bcoconut water\b", re.I), 95.0),
    (re.compile(r"\bwater\b", re.I), 100.0),
    (re.compile(r"\bcoffee\b|\btea\b", re.I), 99.0),
    (re.compile(r"\bjuice\b", re.I), 88.0),
    (re.compile(r"\bskimmed milk\b|\bsemi.?skimmed\b", re.I), 90.0),
    (re.compile(r"\bmilk\b", re.I), 87.0),
    (re.compile(r"\boil\b", re.I), 0.0),
    (re.compile(r"\bbutter\b", re.I), 16.0),
    (re.compile(r"\bhoney\b|\bjam\b", re.I), 18.0),
    (re.compile(r"\boat", re.I), 10.0),
    (re.compile(r"\brice\b|\bpasta\b|\bnoodle", re.I), 12.0),
    (re.compile(r"\bbread\b|\bwrap\b|\btortilla", re.I), 35.0),
    (re.compile(r"\bpotato|\bsweet potato", re.I), 79.0),
    (re.compile(r"\bbanana", re.I), 75.0),
    (re.compile(r"\bapple|\borange|\bberry|\bgrape|\bmango|\bmelon|watermelon", re.I), 86.0),
    (re.compile(r"\bwhey|\bprotein powder|\bisolate", re.I), 5.0),
    (re.compile(r"\bnut|\balmond|\bpeanut|\bcashew|\bwalnut", re.I), 4.0),
    (re.compile(r"\bcheese\b|\bcheddar|\bmoz?zarella|\bparmesan", re.I), 40.0),
    (re.compile(r"\begg", re.I), 76.0),
    (re.compile(r"\bchicken|\bturkey", re.I), 68.0),
    (re.compile(r"\bbeef|\bsteak|\bmince|\bburger|\blamb|\bpork|\bbacon", re.I), 62.0),
    (re.compile(r"\bfish|\bsalmon|\btuna|\bcod|\bhaddock", re.I), 72.0),
    (re.compile(r"\btofu|\btempeh", re.I), 80.0),
    (re.compile(r"\byoghurt|\byogurt", re.I), 85.0),
]


def estimate_water_per_100g(cat: str, name: str) -> float:
    for rx, water in NAME_WATER_OVERRIDES:
        if rx.search(name):
            return water
    return CATEGORY_WATER_PER_100G.get(cat, 50.0)


def heading_label(heading: str) -> str:
    if heading == "oils and condiments":
        return "Oils and condiments"
    if heading == "animal products":
        return "Animal products"
    return heading.title()


def parse_template(text: str) -> list[dict]:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    heading = "meat"
    foods: list[dict] = []
    i = 0
    n = len(lines)

    def is_blank_field_line(idx: int) -> bool:
        """A '\t' only line (optional trailing spaces) marks an empty price cell."""
        if idx >= n:
            return False
        return lines[idx].strip() == "" and lines[idx].startswith("\t")

    def is_pure_empty(idx: int) -> bool:
        return idx < n and lines[idx] == ""

    def read_field(idx: int) -> tuple[float | None, int]:
        """Read one of the 6 columns. Blank = '\t' line (+ optional empty line)."""
        if idx >= n:
            return None, idx
        # Skip pure empty separators only when next is a field line
        while idx < n and lines[idx] == "":
            # Don't skip if we've left the record — caller handles
            idx += 1
        if idx >= n:
            return None, idx

        line = lines[idx]
        stripped = line.strip()

        # Blank price cell: line is only tabs/spaces but started with tab originally,
        # or stripped empty with leading tab
        if line.startswith("\t") and stripped == "":
            idx += 1
            if is_pure_empty(idx):
                idx += 1
            return None, idx

        if line.startswith("\t") and stripped:
            # annotation-only on a tab line
            if stripped.startswith("(") and parse_number(stripped) is None:
                idx += 1
                return read_field(idx)
            num = parse_number(stripped)
            idx += 1
            return num, idx

        # Non-tab annotation between price cells, e.g. "(canned)" under Wild Salmon
        if stripped.startswith("(") and parse_number(stripped) is None:
            idx += 1
            if is_pure_empty(idx):
                idx += 1
            return read_field(idx)

        # Non-tab line: end of fields (next name or heading)
        return None, idx  # signal: no field consumed — caller should stop

    while i < n:
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        h = is_section_heading(stripped)
        if h:
            heading = h
            i += 1
            continue

        if stripped.lower() in COLUMN_HEADERS:
            i += 1
            continue

        # Food names are usually tab-prefixed; continuation lines like "(340g)" are not
        if not (line.startswith("\t") or re.match(r"^[A-Za-z0-9%]", stripped)):
            i += 1
            continue
        if parse_number(stripped) is not None and re.fullmatch(r"[0-9.]+(?:\s*\(.*\))?", stripped):
            # orphan number
            i += 1
            continue

        def is_pack_size_fragment(ns: str) -> bool:
            # "(340g)", "250g", "1.5 kg", "Bought in 4" style fragments
            if ns.startswith("(") and ns.endswith(")"):
                return True
            if re.fullmatch(r"\d+(?:\.\d+)?\s*(?:g|kg|ml|litres?)", ns, re.I):
                return True
            if re.fullmatch(r"bought in\s+\d+(?:\s*pack)?", ns, re.I):
                return True
            return False

        # Collect name
        name_parts = [stripped]
        i += 1
        while i < n:
            nxt = lines[i]
            ns = nxt.strip()
            if ns == "":
                # peek: continuation "(340g)" / "250g" after blank?
                j = i + 1
                while j < n and lines[j] == "":
                    j += 1
                if j < n and not lines[j].startswith("\t") and is_pack_size_fragment(lines[j].strip()):
                    i = j
                    continue
                break
            # Field line
            if nxt.startswith("\t"):
                break
            if is_section_heading(ns):
                break
            # Annotation stuck between fields elsewhere — not part of name here
            if ns.lower() in ("(canned)",):
                break
            # Continuation of name (e.g. "(340g)", "250g", "Broccoli")
            if is_pack_size_fragment(ns) or (re.match(r"^[A-Za-z]", ns) and parse_number(ns) is None):
                joined = " ".join(name_parts)
                if (
                    not is_pack_size_fragment(ns)
                    and (extract_pack_g(joined) or extract_unit_count(joined) or "(" in joined)
                    and re.match(r"^[A-Z]", ns)
                ):
                    break
                name_parts.append(ns)
                i += 1
                continue
            break

        name = clean_display_name(" ".join(name_parts))
        if len(name) < 2 or name.lower() in COLUMN_HEADERS:
            continue

        # Read exactly 6 fields
        fields: list[float | None] = []
        for _ in range(6):
            # If next content is a new food name or heading, pad remaining with None
            # Skip pure empty lines between fields
            while i < n and lines[i] == "":
                i += 1
            if i >= n:
                fields.append(None)
                continue
            nxt = lines[i]
            ns = nxt.strip()
            if is_section_heading(ns):
                fields.append(None)
                continue
            # New food name (tab + text that isn't only a number annotation)
            if nxt.startswith("\t") and ns and parse_number(ns) is None and not ns.startswith("("):
                # Could be blank already handled; if it's text name, stop
                if not re.match(r"^[0-9]", ns):
                    fields.append(None)
                    continue
            if not nxt.startswith("\t") and ns and not ns.startswith("("):
                # next name continuation-less — new record
                fields.append(None)
                continue

            val, i2 = read_field(i)
            if i2 == i and val is None and not is_blank_field_line(i):
                # couldn't read — pad
                fields.append(None)
            else:
                fields.append(val)
                i = i2

        # If we padded because next name started, don't advance past it
        cheap, middle, quality, carbs, fat, protein = fields

        # Require at least one macro
        if carbs is None and fat is None and protein is None:
            continue
        # Require at least one price OR still include? User said blank = not included for that option.
        # Item can still exist if any tier has a price.
        if cheap is None and middle is None and quality is None:
            continue

        pack_g, pack_unit = extract_pack_size(name)
        units = extract_unit_count(name)
        ref_g = pack_g if pack_g and pack_g > 0 else 100.0

        def per100(pack_val: float | None) -> float:
            if pack_val is None:
                return 0.0
            return round((pack_val / ref_g) * 100.0, 2)

        def price_per100(pack_price: float | None) -> float | None:
            if pack_price is None:
                return None
            return round((pack_price / ref_g) * 100.0, 4)

        cat = category_for(heading, name)
        default_pack = next((p for p in (cheap, middle, quality) if p is not None), None)
        default_price_100 = price_per100(default_pack) if default_pack is not None else 0.0
        water100 = estimate_water_per_100g(cat, name)

        foods.append(
            {
                "name": f"[{cat}] {name}",
                "heading": heading_label(heading),
                "pack_g": pack_g,
                "pack_unit": pack_unit or ("g" if pack_g else None),
                "unit_count": units,
                "price_cheap": cheap,
                "price_middle": middle,
                "price_quality": quality,
                "carbs_pack": carbs if carbs is not None else 0.0,
                "fat_pack": fat if fat is not None else 0.0,
                "protein_pack": protein if protein is not None else 0.0,
                "price_per_100g": default_price_100 or 0.0,
                "protein_per_100g": per100(protein),
                "carbs_per_100g": per100(carbs),
                "fat_per_100g": per100(fat),
                "water_per_100g": water100,
                "stock_g": 0,
                "preference_score": 0,
            }
        )

    return foods


def supabase_row(food: dict) -> dict:
    return {
        "name": food["name"],
        "price_per_100g": food["price_per_100g"],
        "protein_per_100g": food["protein_per_100g"],
        "carbs_per_100g": food["carbs_per_100g"],
        "fat_per_100g": food["fat_per_100g"],
        "water_per_100g": food.get("water_per_100g", 0.0),
        "stock_g": 0,
        "preference_score": 0,
    }


def main() -> None:
    foods = parse_template(SRC.read_text(encoding="utf-8"))
    print(f"Parsed {len(foods)} foods")
    from collections import Counter

    print(Counter(f["heading"] for f in foods))
    for f in foods[:8]:
        print(
            f["name"],
            "c/m/q=",
            f["price_cheap"],
            f["price_middle"],
            f["price_quality"],
            "C/F/P pack=",
            f["carbs_pack"],
            f["fat_pack"],
            f["protein_pack"],
        )

    # Spot-check known rows
    checks = {
        "Chicken Breast (400g)": (4.0, 5.2, 11.6, 0.0, 4.0, 93.6),
        "Beef burger (340g)": (None, 4.5, 6.25, 11.8, 66.6, 82.8),
        "Beef burger (450g)": (4.0, None, None, 14.4, 88.2, 108.9),
        "Chicken Thigh (Bought in 4)": (None, None, 1.9, 1.05, 17.1, 25.8),
        "Pork Bacon (300g)": (1.5, None, None, 3.0, 47.0, 58.6),
    }
    by_name = {f["name"].split("] ", 1)[-1]: f for f in foods}
    for name, expected in checks.items():
        f = by_name.get(name)
        if not f:
            # try fuzzy
            f = next((x for x in foods if name.lower() in x["name"].lower()), None)
        got = (
            None
            if not f
            else (
                f["price_cheap"],
                f["price_middle"],
                f["price_quality"],
                f["carbs_pack"],
                f["fat_pack"],
                f["protein_pack"],
            )
        )
        ok = got == expected
        print(("OK " if ok else "BAD"), name, "got=", got, "expected=", expected)

    CATALOG.write_text(json.dumps({"foods": foods}, indent=2), encoding="utf-8")
    seed = {"foods": [], "exercises": []}
    if SEED.exists():
        seed = json.loads(SEED.read_text(encoding="utf-8"))
    seed["foods"] = [supabase_row(f) for f in foods]
    SEED.write_text(json.dumps(seed, indent=2), encoding="utf-8")
    (ROOT / "seed-database.json.txt").write_text(json.dumps(seed, indent=2), encoding="utf-8")
    print(f"Wrote catalog ({len(foods)}) and updated seed")


if __name__ == "__main__":
    main()
