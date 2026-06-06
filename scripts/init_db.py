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
SCHEMA_VERSION = 2

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
  summary TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stars_faction ON stars(faction);
CREATE INDEX IF NOT EXISTS idx_stars_octant ON stars(octant, octant_order);
CREATE INDEX IF NOT EXISTS idx_stars_distance ON stars(distance);
CREATE INDEX IF NOT EXISTS idx_bodies_star ON system_bodies(star_id, sort_order);
"""


STAR_COLUMNS = {
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
    if faction == "自然天体/科研区":
        return "自然/科研"
    if faction == "本地星际介质":
        return "星际介质"
    if status == "minor":
        return "中立/科研"
    if status == "outer":
        return "外环许可"
    if status == "license":
        return "许可/争议"
    if star.get("rank") not in (None, "-"):
        return "巨企/类巨企"
    return "未分类"


def normalize_star_seed(raw: dict) -> dict:
    star = dict(raw)
    star.update(STAR_OVERRIDES.get(star["id"], {}))
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
    return star


def load_all_seed_stars(app_path: Path = DEFAULT_APP) -> list[dict]:
    seen = set()
    merged = []
    for star in [*load_seed_from_app(app_path), *EXTRA_STARS]:
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
        yield item


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

    with sqlite3.connect(db_path) as con:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("PRAGMA journal_mode = MEMORY")
        con.executescript(SCHEMA)
        ensure_star_columns(con)
        existing = con.execute("SELECT COUNT(*) FROM stars").fetchone()[0]
        version = con.execute("PRAGMA user_version").fetchone()[0]
        if existing and not force and existing == len(stars) and version >= SCHEMA_VERSION:
            return existing

        con.execute("DELETE FROM system_bodies")
        con.execute("DELETE FROM aliases")
        con.execute("DELETE FROM stars")

        for star in stars:
            x, y, z = star["xyz"]
            con.execute(
                """
                INSERT INTO stars (
                  id, name, short, octant, octant_order, distance, arrival,
                  x, y, z, faction, rank, class_name, planets, reality,
                  setting, habitable, status, object_type, spectral_class,
                  star_count, planet_count, confirmed_planets, candidate_planets,
                  faction_type, display_after, display_until, control_start,
                  control_end, notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )
            for alias in iter_aliases(star):
                con.execute(
                    "INSERT OR IGNORE INTO aliases(alias, star_id) VALUES (?, ?)",
                    (alias, star["id"]),
                )
            for body in iter_bodies(star):
                con.execute(
                    """
                    INSERT INTO system_bodies (
                      id, star_id, parent_id, name, body_type, orbit_au,
                      radius_label, mass_label, habitable, summary, sort_order
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        body["summary"],
                        int(body["sortOrder"]),
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
