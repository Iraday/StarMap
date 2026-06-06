from __future__ import annotations

import argparse
import json
import re
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "stars.sqlite"
DEFAULT_APP = ROOT / "app.js"


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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aliases (
  alias TEXT PRIMARY KEY,
  star_id TEXT NOT NULL REFERENCES stars(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stars_faction ON stars(faction);
CREATE INDEX IF NOT EXISTS idx_stars_octant ON stars(octant, octant_order);
CREATE INDEX IF NOT EXISTS idx_stars_distance ON stars(distance);
"""


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


def initialize_database(db_path: Path = DEFAULT_DB, app_path: Path = DEFAULT_APP, force: bool = False) -> int:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    if force and db_path.exists():
        db_path.unlink()
    journal_path = db_path.with_name(f"{db_path.name}-journal")
    if force and journal_path.exists():
        journal_path.unlink()

    stars = load_seed_from_app(app_path)

    with sqlite3.connect(db_path) as con:
        con.execute("PRAGMA foreign_keys = ON")
        con.execute("PRAGMA journal_mode = MEMORY")
        con.executescript(SCHEMA)
        existing = con.execute("SELECT COUNT(*) FROM stars").fetchone()[0]
        if existing and not force:
            return existing

        con.execute("DELETE FROM aliases")
        con.execute("DELETE FROM stars")

        for star in stars:
            x, y, z = star["xyz"]
            con.execute(
                """
                INSERT INTO stars (
                  id, name, short, octant, octant_order, distance, arrival,
                  x, y, z, faction, rank, class_name, planets, reality,
                  setting, habitable, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )
            for alias in iter_aliases(star):
                con.execute(
                    "INSERT OR IGNORE INTO aliases(alias, star_id) VALUES (?, ?)",
                    (alias, star["id"]),
                )
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
