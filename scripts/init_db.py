from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "stars.sqlite"
DEFAULT_APP = ROOT / "app.js"
DEFAULT_STAR_DATA = ROOT / "star_data.js"
SCHEMA_VERSION = 5

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.seed_data import EXTRA_STARS, STAR_OVERRIDES, SYSTEM_BODY_SEEDS


SCHEMA = """
CREATE TABLE IF NOT EXISTS stars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short TEXT NOT NULL,
  octant TEXT NOT NULL,
  octant_order INTEGER NOT NULL DEFAULT 0,
  distance REAL NOT NULL,
  arrival REAL NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  faction TEXT NOT NULL,
  rank TEXT NOT NULL,
  class_name TEXT NOT NULL,
  planets TEXT NOT NULL,
  reality TEXT NOT NULL,
  setting TEXT NOT NULL,
  habitable INTEGER NOT NULL DEFAULT 0,
  habitability_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'core',
  object_type TEXT NOT NULL DEFAULT 'star_system',
  spectral_class TEXT NOT NULL DEFAULT '',
  star_count INTEGER NOT NULL DEFAULT 1,
  planet_count INTEGER NOT NULL DEFAULT 0,
  confirmed_planets INTEGER NOT NULL DEFAULT 0,
  candidate_planets INTEGER NOT NULL DEFAULT 0,
  faction_type TEXT NOT NULL DEFAULT '',
  display_after INTEGER NOT NULL DEFAULT 0,
  display_until INTEGER,
  control_start INTEGER NOT NULL DEFAULT 2350,
  control_end INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  age TEXT NOT NULL DEFAULT '',
  lifespan TEXT NOT NULL DEFAULT '',
  disasters TEXT NOT NULL DEFAULT '',
  hz_inner REAL NOT NULL DEFAULT 0,
  hz_outer REAL NOT NULL DEFAULT 0,
  rule_info_time REAL NOT NULL DEFAULT 0,
  info_speed REAL NOT NULL DEFAULT 0,
  ftl_speed REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aliases (
  alias TEXT PRIMARY KEY,
  star_id TEXT NOT NULL REFERENCES stars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_bodies (
  id TEXT PRIMARY KEY,
  star_id TEXT NOT NULL REFERENCES stars(id) ON DELETE CASCADE,
  parent_id TEXT,
  name TEXT NOT NULL,
  body_type TEXT NOT NULL,
  orbit_au REAL NOT NULL DEFAULT 0,
  radius_label TEXT NOT NULL DEFAULT '',
  mass_label TEXT NOT NULL DEFAULT '',
  habitable INTEGER NOT NULL DEFAULT 0,
  terraform_status TEXT NOT NULL DEFAULT '',
  habitability_score REAL NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  rule_info_time REAL NOT NULL DEFAULT 0,
  info_speed REAL NOT NULL DEFAULT 0,
  ftl_speed REAL NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_stars_faction ON stars(faction);
CREATE INDEX IF NOT EXISTS idx_stars_octant ON stars(octant, octant_order);
CREATE INDEX IF NOT EXISTS idx_stars_distance ON stars(distance);
CREATE INDEX IF NOT EXISTS idx_bodies_star ON system_bodies(star_id, sort_order);
"""


STAR_COLUMNS = {
    "habitability_score": "REAL NOT NULL DEFAULT 0",
    "object_type": "TEXT NOT NULL DEFAULT 'star_system'",
    "spectral_class": "TEXT NOT NULL DEFAULT ''",
    "star_count": "INTEGER NOT NULL DEFAULT 1",
    "planet_count": "INTEGER NOT NULL DEFAULT 0",
    "confirmed_planets": "INTEGER NOT NULL DEFAULT 0",
    "candidate_planets": "INTEGER NOT NULL DEFAULT 0",
    "faction_type": "TEXT NOT NULL DEFAULT ''",
    "display_after": "INTEGER NOT NULL DEFAULT 0",
    "display_until": "INTEGER",
    "control_start": "INTEGER NOT NULL DEFAULT 2350",
    "control_end": "INTEGER",
    "notes": "TEXT NOT NULL DEFAULT ''",
    "age": "TEXT NOT NULL DEFAULT ''",
    "lifespan": "TEXT NOT NULL DEFAULT ''",
    "disasters": "TEXT NOT NULL DEFAULT ''",
    "hz_inner": "REAL NOT NULL DEFAULT 0",
    "hz_outer": "REAL NOT NULL DEFAULT 0",
    "rule_info_time": "REAL NOT NULL DEFAULT 0",
    "info_speed": "REAL NOT NULL DEFAULT 0",
    "ftl_speed": "REAL NOT NULL DEFAULT 1",
}

BODY_COLUMNS = {
    "terraform_status": "TEXT NOT NULL DEFAULT ''",
    "habitability_score": "REAL NOT NULL DEFAULT 0",
}


def _extract_array_literal(source: str) -> str:
    for marker in ("const fallbackStars = [", "const stars = ["):
        start = source.find(marker)
        if start != -1:
            start = source.find("[", start)
            break
    else:
        raise ValueError("Could not find fallbackStars/stars array in app.js")

    depth = 0
    in_string: str | None = None
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == in_string:
                in_string = None
            continue
        if char in ("'", '"', "`"):
            in_string = char
        elif char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]

    raise ValueError("Unclosed star array in app.js")


def _js_literal_to_json(js_literal: str) -> str:
    # The star seed is deliberately kept as a data-only JS object list. This
    # conversion quotes object keys and removes trailing commas.
    text = re.sub(r"(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*):", r'\1"\2":', js_literal)
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return text


def load_seed_from_app(app_path: Path = DEFAULT_APP) -> list[dict]:
    source = app_path.read_text(encoding="utf-8")
    literal = _extract_array_literal(source)
    json_text = _js_literal_to_json(literal)
    return json.loads(json_text)


def first_spectral_token(class_name: str) -> str:
    text = (class_name or "").upper()
    if "白矮星" in class_name or "DA" in text or "DQ" in text or "DZ" in text:
        return "D"
    if "褐矮星" in class_name or "BROWN" in text:
        return "L/T"
    for token in ("O", "B", "A", "F", "G", "K", "M", "L", "T", "Y"):
        if token in text:
            return token
    return "unknown"


def infer_star_count(class_name: str) -> int:
    text = class_name or ""
    if "三" in text or "triple" in text.casefold():
        return 3
    if "+" in text or "双" in text or "binary" in text.casefold():
        return max(2, text.count("+") + 1)
    return 1


def infer_planet_count(star: dict) -> int:
    for key in ("planetCount", "confirmedPlanets"):
        if key in star:
            return int(star[key])
    planets = str(star.get("planets", ""))
    if "0 宜居" in planets and not re.search(r"\d+\s*(?:确认|行星|近轨|巨行星)", planets):
        return 0
    digits = [int(value) for value in re.findall(r"\d+", planets)]
    if not digits:
        return int(star.get("habitable", 0))
    return max(digits[:3])


def default_faction_type(star: dict) -> str:
    faction = str(star.get("faction", ""))
    status = str(star.get("status", ""))
    if faction == "无/无所属":
        return "自然/科研"
    if status == "minor":
        return "中立/科研"
    if status == "outer":
        return "外环许可"
    if status == "license":
        return "许可/争议"
    if star.get("rank") not in (None, "-"):
        return "巨企/类巨企"
    return "未分类"


def fully_italic(value: str) -> bool:
    text = str(value or "").strip()
    return len(text) >= 2 and text.startswith("_") and text.endswith("_")


def italicize(value: str) -> str:
    text = str(value or "").strip()
    if not text or fully_italic(text):
        return text
    return f"_{text.strip('_')}_"


def normalize_fiction_text(value: str) -> str:
    text = str(value or "").strip()
    if text.startswith("_设定_"):
        text = text[len("_设定_") :].strip()
    if text.startswith("设定_"):
        text = text[len("设定_") :].strip()
    return italicize(text)


def strip_markup(value: str) -> str:
    return re.sub(r"[_*~]+", "", str(value or "")).strip()


def clean_name(value: str) -> str:
    text = strip_markup(value)
    return re.split(r"\s*/\s*", text)[0].strip() or "未命名"


def clamp_score(value) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, number)


def explicit_score(item: dict) -> float | None:
    for key in ("habitabilityScore", "habitability_score"):
        if key in item and item[key] not in (None, ""):
            return clamp_score(item[key])
    return None


def body_text(item: dict) -> str:
    return " ".join(
        strip_markup(item.get(key, ""))
        for key in ("name", "bodyType", "radiusLabel", "radius_label", "massLabel", "mass_label", "summary")
    )


def is_planetary_body(item: dict) -> bool:
    return str(item.get("bodyType", item.get("body_type", ""))) in {"planet", "moon"}


def is_non_terrestrial_planet(item: dict) -> bool:
    if str(item.get("bodyType", item.get("body_type", ""))) != "planet":
        return False
    text = body_text(item).casefold()
    identity_text = " ".join(
        strip_markup(item.get(key, ""))
        for key in ("name", "radiusLabel", "radius_label", "massLabel", "mass_label")
    ).casefold()
    non_terrestrial_terms = (
        "迷你海王星",
        "海王星",
        "冰巨",
        "气巨",
        "气态",
        "巨行星",
        "木星",
        "土星",
        "天王星",
        "gas giant",
        "ice giant",
        "mini-neptune",
        "sub-neptune",
        "neptune",
        "jupiter",
        "saturn",
        "uranus",
    )
    terrestrial_terms = ("类地", "地球", "岩石", "岩质", "超级地球", "浮空文明")
    if any(term in identity_text for term in non_terrestrial_terms):
        return not any(term in identity_text for term in terrestrial_terms)
    return any(term in text for term in non_terrestrial_terms) and not any(term in text for term in terrestrial_terms)


def infer_terraform_status(item: dict) -> str:
    explicit = item.get("terraformStatus", item.get("terraform_status", ""))
    if explicit not in (None, ""):
        return str(explicit)
    return ""


def infer_habitability_score(item: dict) -> float:
    explicit = explicit_score(item)
    if explicit is not None:
        return explicit
    return 0.0


def normalize_star_seed(raw: dict) -> dict:
    star = dict(raw)
    star.update(STAR_OVERRIDES.get(star["id"], {}))
    if star.get("faction") == "无/无所属":
        star["rank"] = "-"
    class_name = star.get("className", star.get("class_name", "unknown"))
    star.setdefault("objectType", "star_system")
    star.setdefault("spectralClass", first_spectral_token(class_name))
    star.setdefault("starCount", infer_star_count(class_name))
    star.setdefault("planetCount", infer_planet_count(star))
    star.setdefault("confirmedPlanets", int(star.get("planetCount", 0)))
    star.setdefault("candidatePlanets", 0)
    star.setdefault("factionType", default_faction_type(star))
    star.setdefault("displayAfter", 0)
    star.setdefault("displayUntil", None)
    star.setdefault("controlStart", 2350)
    star.setdefault("controlEnd", None)
    star.setdefault("notes", "")
    star.setdefault("age", "")
    star.setdefault("lifespan", "")
    star.setdefault("disasters", "")
    star.setdefault("hz_inner", 0)
    star.setdefault("hz_outer", 0)
    default_rule_time = 0.04 if star.get("faction") == "无/无所属" else 0.12
    star.setdefault("rule_info_time", default_rule_time)
    star.setdefault("info_speed", 1)
    star.setdefault("ftl_speed", 1)
    if star.get("setting"):
        star["setting"] = normalize_fiction_text(star["setting"])
    if star.get("id") == "li-hartman":
        for key in ("className", "planets", "reality", "age", "lifespan", "disasters"):
            if star.get(key):
                star[key] = normalize_fiction_text(star[key])
    return star


def load_all_seed_stars(app_path: Path = DEFAULT_APP) -> list[dict]:
    seen = set()
    merged = []
    app_stars = []
    source_errors = []
    for source in dict.fromkeys([app_path, DEFAULT_STAR_DATA]):
        try:
            app_stars = load_seed_from_app(source)
            break
        except (FileNotFoundError, ValueError, json.JSONDecodeError) as exc:
            source_errors.append(f"{source.name}: {exc}")
    if not app_stars and source_errors:
        print("Seed source fallback failed; using scripts.seed_data only: " + " | ".join(source_errors), file=sys.stderr)
    for star in [*app_stars, *EXTRA_STARS]:
        normalized = normalize_star_seed(star)
        if normalized["id"] in seen:
            continue
        seen.add(normalized["id"])
        merged.append(normalized)
    return merged


def normalize_alias(value: str) -> str:
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "", value).casefold()


def iter_aliases(star: dict):
    candidates = {
        star["id"],
        star["name"],
        star["short"],
        star["name"].split("/")[0].strip(),
    }
    for value in candidates:
        normalized = normalize_alias(value)
        if normalized:
            yield normalized


def ensure_star_columns(con: sqlite3.Connection) -> None:
    existing = {row[1] for row in con.execute("PRAGMA table_info(stars)").fetchall()}
    for column, spec in STAR_COLUMNS.items():
        if column not in existing:
            con.execute(f"ALTER TABLE stars ADD COLUMN {column} {spec}")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stars_object_type ON stars(object_type)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stars_spectral_class ON stars(spectral_class)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_stars_faction_type ON stars(faction_type)")


def ensure_body_columns(con: sqlite3.Connection) -> None:
    existing = {row[1] for row in con.execute("PRAGMA table_info(system_bodies)").fetchall()}
    for column, spec in BODY_COLUMNS.items():
        if column not in existing:
            con.execute(f"ALTER TABLE system_bodies ADD COLUMN {column} {spec}")
    con.execute("CREATE INDEX IF NOT EXISTS idx_bodies_terraform_status ON system_bodies(terraform_status)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_bodies_habitability_score ON system_bodies(habitability_score)")


def terraform_orbit(star: dict, slot: int) -> float:
    inner = float(star.get("hz_inner", 0) or 0)
    outer = float(star.get("hz_outer", 0) or 0)
    if inner > 0 and outer > inner:
        ratio = 0.45 if slot == 0 else 0.78
        return round(inner + (outer - inner) * ratio, 4)
    spectral = str(star.get("spectralClass", star.get("className", ""))).upper()
    if "D" in spectral:
        base = 0.015
    elif "M" in spectral or "L" in spectral or "T" in spectral:
        base = 0.08
    elif "K" in spectral:
        base = 0.55
    elif "F" in spectral:
        base = 1.55
    elif "A" in spectral:
        base = 3.0
    else:
        base = 1.0
    return round(base * (1.0 + slot * 0.55), 4)


def numeric_rank(star: dict) -> int | None:
    try:
        return int(str(star.get("rank", "")).strip())
    except (TypeError, ValueError):
        return None


def ranked_controlled(star: dict) -> bool:
    rank = numeric_rank(star)
    faction = str(star.get("faction", ""))
    normalized_faction = faction.replace("/", "")
    return (
        rank is not None
        and 1 <= rank < 900
        and "无所属" not in normalized_faction
        and star.get("objectType") != "diffuse_cloud"
    )


def score_for_generated_moon(rank: int, slot: int, remaining: float) -> tuple[str, float]:
    if rank <= 5:
        cycle = [("terraformed", 1.45), ("terraforming", 1.12), ("terraformable", 0.72)]
    elif rank <= 10:
        cycle = [("terraformed", 1.18), ("terraforming", 0.92), ("terraformable", 0.60)]
    else:
        cycle = [("terraforming", 0.82), ("terraformable", 0.58), ("terraformable", 0.42)]
    status, default_score = cycle[slot % len(cycle)]
    score = default_score if remaining > default_score else max(0.36, remaining)
    return status, round(score, 3)


def terraform_status_cn(status: str) -> str:
    return {
        "terraformed": "已地球化",
        "terraforming": "地球化中",
        "terraformable": "可地球化",
        "natural_habitable": "天然宜居",
        "habitable": "宜居/准宜居",
    }.get(status, "可地球化")


def choose_moon_parent(bodies: list[dict]) -> dict | None:
    planets = [body for body in bodies if str(body.get("bodyType")) == "planet"]
    if not planets:
        return None
    for body in planets:
        if is_non_terrestrial_planet(body):
            return body
    return planets[-1]


def generated_terraform_moon(star: dict, bodies: list[dict], existing_ids: set[str], slot: int, sort_order: int, status: str, score: float) -> dict:
    star_name = clean_name(star.get("short") or star.get("name"))
    faction = clean_name(star.get("faction", "未知势力"))
    label = terraform_status_cn(status)
    parent = choose_moon_parent(bodies)
    parent_id = parent.get("id") if parent else None
    parent_name = clean_name(parent.get("name")) if parent else "未建模母行星"
    body_id = f"{star['id']}-fictional-moon-{slot + 1:02d}"
    while body_id in existing_ids:
        slot += 1
        body_id = f"{star['id']}-fictional-moon-{slot + 1:02d}"
    orbit = float(parent.get("orbitAu", 0) or 0) + 0.001 * (slot + 1) if parent else terraform_orbit(star, slot)
    return {
        "id": body_id,
        "name": f"_{star_name}卫{slot + 1:02d}_",
        "parentId": parent_id,
        "bodyType": "moon",
        "orbitAu": round(orbit, 5),
        "radiusLabel": f"_小型卫星；{label}冰岩/类地改造对象_",
        "massLabel": "_0.01-0.25 M⊕_",
        "habitable": 1,
        "terraformStatus": status,
        "habitabilityScore": score,
        "summary": f"_虚构天体：{faction}在{star_name}控制区登记的{label}卫星，母体为{parent_name}；因尺寸较小，现实观测暂不列入，仅用于 2350 年势力版图设定与后续细化。_",
        "sortOrder": sort_order,
        "rule_info_time": 0.10 if status == "terraformed" else 0.08 if status == "terraforming" else 0.05,
        "info_speed": float(star.get("info_speed", 1) or 1),
        "ftl_speed": float(star.get("ftl_speed", 1) or 1),
    }


def add_generated_moon(star: dict, bodies: list[dict], slot: int, status: str, score: float) -> dict:
    existing_ids = {str(body.get("id", "")) for body in bodies}
    max_sort = max([int(body.get("sortOrder", 0) or 0) for body in bodies] or [0])
    moon = generated_terraform_moon(star, bodies, existing_ids, slot, max_sort + 10 + slot, status, score)
    bodies.append(moon)
    return moon


def rank_target(rank: int) -> float:
    return max(6.0, 36.0 - rank * 1.8)


def balance_faction_habitability(stars: list[dict], bodies_by_star: dict[str, list[dict]]) -> None:
    faction_rank: dict[str, int] = {}
    for star in stars:
        if ranked_controlled(star):
            faction = str(star["faction"])
            rank = numeric_rank(star)
            if rank is not None:
                faction_rank[faction] = min(faction_rank.get(faction, rank), rank)
    if not faction_rank:
        return

    faction_stars: dict[str, list[dict]] = {faction: [] for faction in faction_rank}
    for star in stars:
        faction = str(star.get("faction", ""))
        if faction in faction_stars and star.get("objectType") != "diffuse_cloud":
            faction_stars[faction].append(star)

    faction_base = {
        faction: sum(
            infer_habitability_score(body)
            for star in members
            for body in bodies_by_star[star["id"]]
        )
        for faction, members in faction_stars.items()
    }
    current_by_faction = dict(faction_base)
    slot_by_faction = {faction: {star["id"]: 0 for star in members} for faction, members in faction_stars.items()}

    for faction, members in sorted(faction_stars.items(), key=lambda item: faction_rank[item[0]]):
        rank = faction_rank[faction]
        members = sorted(members, key=lambda star: (float(star.get("distance", 0) or 0), str(star.get("id", ""))))

        for star in members:
            # Never auto-generate moons for hand-crafted fictional stars
            if star.get("id") == "li-hartman":
                slot_by_faction[faction][star["id"]] = 999  # mark as skip
                continue
            bodies = bodies_by_star[star["id"]]
            generated = sum(1 for body in bodies if str(body.get("id", "")).startswith(f"{star['id']}-fictional-moon-"))
            slot_by_faction[faction][star["id"]] = generated
            while generated < 2:
                status, score = score_for_generated_moon(rank, slot_by_faction[faction][star["id"]], 99)
                add_generated_moon(star, bodies, slot_by_faction[faction][star["id"]], status, score)
                current_by_faction[faction] += score
                generated += 1
                slot_by_faction[faction][star["id"]] += 1

    factions_by_rank: dict[int, list[str]] = {}
    for faction, rank in faction_rank.items():
        factions_by_rank.setdefault(rank, []).append(faction)

    rank_targets: dict[int, float] = {}
    lower_max = 0.0
    for rank in sorted(factions_by_rank.keys(), reverse=True):
        current_max = max(current_by_faction[faction] for faction in factions_by_rank[rank])
        rank_targets[rank] = max(rank_target(rank), current_max, lower_max + 1.0)
        lower_max = rank_targets[rank]

    for faction, members in sorted(faction_stars.items(), key=lambda item: faction_rank[item[0]]):
        rank = faction_rank[faction]
        members = sorted(members, key=lambda star: (float(star.get("distance", 0) or 0), str(star.get("id", ""))))
        current = current_by_faction[faction]
        slot_by_star = slot_by_faction[faction]

        target = rank_targets[rank]
        cursor = 0
        MAX_MOONS_PER_STAR = 4  # hard cap: no more than 4 generated moons per star
        while current + 0.001 < target and members:
            star = members[cursor % len(members)]
            # Skip hand-crafted stars and stars that hit the moon cap
            if slot_by_star[star["id"]] >= MAX_MOONS_PER_STAR:
                cursor += 1
                if cursor >= len(members) * MAX_MOONS_PER_STAR:
                    break
                continue
            remaining = target - current
            status, score = score_for_generated_moon(rank, slot_by_star[star["id"]], remaining)
            add_generated_moon(star, bodies_by_star[star["id"]], slot_by_star[star["id"]], status, score)
            current += score
            slot_by_star[star["id"]] += 1
            cursor += 1


def update_star_body_stats(star: dict, bodies: list[dict]) -> None:
    body_scores = [infer_habitability_score(body) for body in bodies]
    scorable_count = sum(1 for score in body_scores if score >= 0.35)
    planet_count = sum(1 for body in bodies if str(body.get("bodyType")) == "planet")
    star["habitabilityScore"] = round(sum(body_scores), 3)
    star["habitable"] = max(int(star.get("habitable", 0) or 0), scorable_count)
    star["planetCount"] = max(int(star.get("planetCount", 0) or 0), planet_count)
    star["confirmedPlanets"] = max(int(star.get("confirmedPlanets", 0) or 0), min(planet_count, int(star["planetCount"])))


def default_bodies_for(star: dict) -> list[dict]:
    object_type = star.get("objectType", "star_system")
    if object_type == "diffuse_cloud":
        return [
            {
                "id": f"{star['id']}-cloud",
                "name": star["short"],
                "bodyType": "cloud",
                "orbitAu": 0,
                "radiusLabel": star.get("className", "星际云"),
                "summary": star.get("setting", "局部星际介质。"),
                "sortOrder": 0,
            }
        ]
    if object_type == "rogue_planet":
        return [
            {
                "id": f"{star['id']}-primary",
                "name": star["short"],
                "bodyType": "planet",
                "orbitAu": 0,
                "radiusLabel": star.get("className", "rogue planet"),
                "habitable": int(star.get("habitable", 0) or 0),
                "summary": star.get("setting", star.get("reality", "")),
                "sortOrder": 0,
            }
        ]
    primary_type = "brown_dwarf" if object_type in {"brown_dwarf", "substellar_object"} else "star"
    bodies = [
        {
            "id": f"{star['id']}-primary",
            "name": star["short"],
            "bodyType": primary_type,
            "orbitAu": 0,
            "radiusLabel": star.get("className", ""),
            "summary": star.get("reality", ""),
            "sortOrder": 0,
        }
    ]
    for index in range(min(int(star.get("planetCount", 0)), 8)):
        orbit = round(0.05 * (index + 1) ** 1.65, 3)
        habitable = 1 if index < int(star.get("habitable", 0)) else 0
        bodies.append(
            {
                "id": f"{star['id']}-planet-{index + 1}",
                "name": f"{star['short']} {chr(98 + index)}",
                "bodyType": "planet",
                "orbitAu": orbit,
                "radiusLabel": "推定/已知行星",
                "habitable": habitable,
                "summary": "由星表行星统计自动生成的可点击行星占位，后续可细化。",
                "sortOrder": index + 1,
            }
        )
    if int(star.get("planetCount", 0)) == 0 and object_type == "star_system":
        bodies.append(
            {
                "id": f"{star['id']}-resource-belt",
                "name": "资源/碎屑带占位",
                "bodyType": "belt",
                "orbitAu": 1.0,
                "radiusLabel": "未确认",
                "summary": "无确认宜居行星，保留为资源带、探测器或轨道设施占位。",
                "sortOrder": 1,
            }
        )
    return bodies


def iter_bodies(star: dict):
    items = []
    for body in SYSTEM_BODY_SEEDS.get(star["id"], default_bodies_for(star)):
        item = dict(body)
        item.setdefault("parentId", None)
        item.setdefault("bodyType", "planet")
        item.setdefault("orbitAu", 0)
        item.setdefault("radiusLabel", "")
        item.setdefault("massLabel", "")
        item.setdefault("habitable", 0)
        item.setdefault("summary", "")
        item.setdefault("sortOrder", 0)
        if star.get("id") == "li-hartman" and item.get("summary"):
            item["summary"] = normalize_fiction_text(item["summary"])
        elif str(item.get("summary", "")).strip().startswith("_设定_"):
            item["summary"] = normalize_fiction_text(item["summary"])
        if item["bodyType"] in {"star", "brown_dwarf", "cloud"}:
            default_rule_time = float(star.get("rule_info_time", 0.08) or 0.08)
        elif item["bodyType"] == "station":
            default_rule_time = 0.10
        elif int(item.get("habitable", 0)):
            default_rule_time = 0.12
        elif item["bodyType"] == "belt":
            default_rule_time = 0.03
        else:
            default_rule_time = 0.05
        item.setdefault("rule_info_time", default_rule_time)
        item.setdefault("info_speed", float(star.get("info_speed", 1) or 1))
        item.setdefault("ftl_speed", float(star.get("ftl_speed", 1) or 1))
        if "terraform_status" in item and "terraformStatus" not in item:
            item["terraformStatus"] = item["terraform_status"]
        if "habitability_score" in item and "habitabilityScore" not in item:
            item["habitabilityScore"] = item["habitability_score"]
        item["terraformStatus"] = infer_terraform_status(item)
        item["habitabilityScore"] = infer_habitability_score(item)
        items.append(item)
    yield from items


def initialize_database(db_path: Path = DEFAULT_DB, app_path: Path = DEFAULT_APP, force: bool = False) -> int:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if force and db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass
    journal_path = db_path.with_name(f"{db_path.name}-journal")
    if force and journal_path.exists():
        try:
            journal_path.unlink()
        except PermissionError:
            pass

    stars = load_all_seed_stars(app_path)
    bodies_by_star = {star["id"]: list(iter_bodies(star)) for star in stars}
    balance_faction_habitability(stars, bodies_by_star)

    with sqlite3.connect(db_path) as con:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("PRAGMA journal_mode = MEMORY")
        con.executescript(SCHEMA)
        ensure_star_columns(con)
        ensure_body_columns(con)
        existing = con.execute("SELECT COUNT(*) FROM stars").fetchone()[0]
        version = con.execute("PRAGMA user_version").fetchone()[0]
        if existing and not force and existing == len(stars) and version >= SCHEMA_VERSION:
            return existing

        con.execute("DELETE FROM system_bodies")
        con.execute("DELETE FROM aliases")
        con.execute("DELETE FROM stars")

        for star in stars:
            star_bodies = bodies_by_star[star["id"]]
            update_star_body_stats(star, star_bodies)
            x, y, z = star["xyz"]
            con.execute(
                """
                INSERT INTO stars (
                  id, name, short, octant, octant_order, distance, arrival,
                  x, y, z, faction, rank, class_name, planets, reality,
                  setting, habitable, habitability_score, status, object_type, spectral_class,
                  star_count, planet_count, confirmed_planets, candidate_planets,
                  faction_type, display_after, display_until, control_start,
                  control_end, notes, age, lifespan, disasters, hz_inner, hz_outer,
                  rule_info_time, info_speed, ftl_speed
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    star["id"],
                    star["name"],
                    star["short"],
                    star["octant"],
                    int(star["order"]),
                    float(star["distance"]),
                    float(star["arrival"]),
                    float(x),
                    float(y),
                    float(z),
                    star["faction"],
                    str(star["rank"]),
                    star["className"],
                    star["planets"],
                    star["reality"],
                    star["setting"],
                    int(star["habitable"]),
                    float(star["habitabilityScore"]),
                    star["status"],
                    star["objectType"],
                    star["spectralClass"],
                    int(star["starCount"]),
                    int(star["planetCount"]),
                    int(star["confirmedPlanets"]),
                    int(star["candidatePlanets"]),
                    star["factionType"],
                    int(star["displayAfter"]),
                    star["displayUntil"],
                    int(star["controlStart"]),
                    star["controlEnd"],
                    star["notes"],
                    str(star["age"]),
                    str(star["lifespan"]),
                    str(star["disasters"]),
                    float(star["hz_inner"]),
                    float(star["hz_outer"]),
                    float(star["rule_info_time"]),
                    float(star["info_speed"]),
                    float(star["ftl_speed"]),
                ),
            )
            for alias in iter_aliases(star):
                con.execute(
                    "INSERT OR IGNORE INTO aliases(alias, star_id) VALUES (?, ?)",
                    (alias, star["id"]),
                )
            for body in star_bodies:
                con.execute(
                    """
                    INSERT INTO system_bodies (
                      id, star_id, parent_id, name, body_type, orbit_au,
                      radius_label, mass_label, habitable, terraform_status,
                      habitability_score, summary, sort_order,
                      rule_info_time, info_speed, ftl_speed
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        body["id"],
                        star["id"],
                        body["parentId"],
                        body["name"],
                        body["bodyType"],
                        float(body["orbitAu"]),
                        body["radiusLabel"],
                        body["massLabel"],
                        int(body["habitable"]),
                        body["terraformStatus"],
                        float(body["habitabilityScore"]),
                        body["summary"],
                        int(body["sortOrder"]),
                        float(body["rule_info_time"]),
                        float(body["info_speed"]),
                        float(body["ftl_speed"]),
                    ),
                )
        con.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
        con.commit()

    return len(stars)


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the StarMap SQLite database.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--app", type=Path, default=DEFAULT_APP)
    parser.add_argument("--force", action="store_true", help="Recreate the database from app.js seed data.")
    args = parser.parse_args()
    count = initialize_database(args.db, args.app, args.force)
    print(f"StarMap database ready: {args.db} ({count} stars)")


if __name__ == "__main__":
    main()
