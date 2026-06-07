from __future__ import annotations

import json
import math
import sqlite3
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from scripts.init_db import DEFAULT_DB, initialize_database, normalize_alias, normalize_fiction_text
from scripts.seed_data import FACTION_COLORS, TIMELINE_MARKS


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "stars.sqlite"


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = MEMORY")
    return con


def row_to_star(row: sqlite3.Row) -> dict:
    keys = set(row.keys())

    def get(key: str, default=None):
        return row[key] if key in keys else default

    return {
        "id": row["id"],
        "name": row["name"],
        "short": row["short"],
        "octant": row["octant"],
        "order": row["octant_order"],
        "distance": row["distance"],
        "arrival": row["arrival"],
        "xyz": [row["x"], row["y"], row["z"]],
        "faction": row["faction"],
        "rank": row["rank"],
        "className": row["class_name"],
        "planets": row["planets"],
        "reality": row["reality"],
        "setting": row["setting"],
        "habitable": row["habitable"],
        "habitabilityScore": get("habitability_score", 0),
        "status": row["status"],
        "objectType": get("object_type", "star_system"),
        "spectralClass": get("spectral_class", ""),
        "starCount": get("star_count", 1),
        "planetCount": get("planet_count", 0),
        "confirmedPlanets": get("confirmed_planets", 0),
        "candidatePlanets": get("candidate_planets", 0),
        "factionType": get("faction_type", ""),
        "displayAfter": get("display_after", 0),
        "displayUntil": get("display_until"),
        "controlStart": get("control_start", 2350),
        "controlEnd": get("control_end"),
        "notes": get("notes", ""),
        "age": get("age", ""),
        "lifespan": get("lifespan", ""),
        "disasters": get("disasters", ""),
        "hz_inner": get("hz_inner", 0),
        "hz_outer": get("hz_outer", 0),
        "rule_info_time": get("rule_info_time", 0),
        "info_speed": get("info_speed", 0),
        "ftl_speed": get("ftl_speed", 1),
    }


def row_to_body(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "starId": row["star_id"],
        "parentId": row["parent_id"],
        "name": row["name"],
        "bodyType": row["body_type"],
        "orbitAu": row["orbit_au"],
        "radiusLabel": row["radius_label"],
        "massLabel": row["mass_label"],
        "habitable": row["habitable"],
        "terraformStatus": row["terraform_status"],
        "habitabilityScore": row["habitability_score"],
        "summary": row["summary"],
        "sortOrder": row["sort_order"],
        "rule_info_time": row["rule_info_time"],
        "info_speed": row["info_speed"],
        "ftl_speed": row["ftl_speed"],
    }


def query_bool(params: dict[str, list[str]], key: str, default: bool = False) -> bool:
    raw = params.get(key, [str(int(default))])[0].casefold()
    return raw in {"1", "true", "yes", "y", "on"}


def find_star(con: sqlite3.Connection, value: str) -> dict | None:
    raw = unquote(value or "").strip()
    if not raw:
        return None
    row = con.execute("SELECT * FROM stars WHERE id = ?", (raw,)).fetchone()
    if row:
        return row_to_star(row)
    alias = normalize_alias(raw)
    row = con.execute(
        """
        SELECT s.*
        FROM aliases a
        JOIN stars s ON s.id = a.star_id
        WHERE a.alias = ?
        """,
        (alias,),
    ).fetchone()
    if row:
        return row_to_star(row)
    row = con.execute(
        """
        SELECT *
        FROM stars
        WHERE name LIKE ? OR short LIKE ?
        ORDER BY distance
        LIMIT 1
        """,
        (f"%{raw}%", f"%{raw}%"),
    ).fetchone()
    return row_to_star(row) if row else None


def distance_between(a: dict, b: dict) -> float:
    ax, ay, az = a["xyz"]
    bx, by, bz = b["xyz"]
    return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)


def world_xyz(star: dict) -> dict:
    x, y, z = star["xyz"]
    return {"x": x, "y": z, "z": y}


def zoom_payload(star: dict, camera_distance: float = 24.0) -> dict:
    wx = world_xyz(star)
    return {
        "star": star,
        "target": {"x": star["xyz"][0], "y": star["xyz"][1], "z": star["xyz"][2]},
        "worldTarget": wx,
        "camera": {
            "x": wx["x"] + camera_distance,
            "y": wx["y"] + camera_distance * 0.62,
            "z": wx["z"] + camera_distance,
        },
        "note": "worldTarget uses the Three.js mapping x=X, y=Z, z=Y.",
    }


def apply_field_aliases(payload: dict, aliases: dict[str, str]) -> dict:
    normalized = dict(payload)
    for source, target in aliases.items():
        if source in normalized and target not in normalized:
            normalized[target] = normalized[source]
    return normalized


class StarMapHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        print(f"[StarMap] {self.address_string()} - {format % args}")

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api_get(parsed.path, parse_qs(parsed.query))
            return
        super().do_GET()

    def do_POST(self) -> None:
        self.handle_api_write()

    def do_PUT(self) -> None:
        self.handle_api_write()

    def do_PATCH(self) -> None:
        self.handle_api_write()

    def handle_api_write(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/stars":
            self.handle_add_star()
            return
        if parsed.path == "/api/system-bodies":
            self.handle_add_body()
            return
        self.send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def send_json(self, payload: dict | list, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_api_get(self, path: str, params: dict[str, list[str]]) -> None:
        try:
            with connect() as con:
                if path == "/api/health":
                    count = con.execute("SELECT COUNT(*) FROM stars").fetchone()[0]
                    self.send_json({"ok": True, "stars": count, "database": str(DB_PATH)})
                elif path == "/api/docs":
                    self.send_json(api_docs())
                elif path == "/api/stars":
                    self.send_json(self.list_stars(con, params))
                elif path == "/api/search":
                    self.send_json(self.list_stars(con, params))
                elif path == "/api/factions":
                    self.send_json(self.list_factions(con, params))
                elif path == "/api/filter-options":
                    self.send_json(self.api_filter_options(con))
                elif path == "/api/timeline":
                    self.send_json(self.api_timeline(con))
                elif path == "/api/system":
                    self.send_json(self.api_system(con, params))
                elif path == "/api/star":
                    key = params.get("id", params.get("name", [""]))[0]
                    star = find_star(con, key)
                    self.send_json(star if star else {"error": "Star not found"}, HTTPStatus.OK if star else HTTPStatus.NOT_FOUND)
                elif path == "/api/distance":
                    self.send_json(self.api_distance(con, params))
                elif path == "/api/nearest":
                    self.send_json(self.api_nearest(con, params))
                elif path == "/api/zoom-target":
                    self.send_json(self.api_zoom(con, params))
                else:
                    self.send_json({"error": "Unknown API path", "path": path}, HTTPStatus.NOT_FOUND)
        except Exception as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def list_stars(self, con: sqlite3.Connection, params: dict[str, list[str]]) -> list[dict]:
        where = []
        values = []
        faction = params.get("faction", ["all"])[0]
        if faction and faction != "all":
            where.append("faction = ?")
            values.append(faction)
        q = params.get("q", params.get("search", [""]))[0].strip()
        if q:
            like = f"%{q}%"
            where.append("(id LIKE ? OR name LIKE ? OR short LIKE ? OR faction LIKE ? OR class_name LIKE ? OR planets LIKE ? OR setting LIKE ?)")
            values.extend([like] * 7)
        class_filter = params.get("class", params.get("spectral", ["all"]))[0]
        if class_filter and class_filter != "all":
            where.append("(spectral_class LIKE ? OR class_name LIKE ?)")
            values.extend([f"%{class_filter}%", f"%{class_filter}%"])
        object_type = params.get("objectType", params.get("object_type", ["all"]))[0]
        if object_type and object_type != "all":
            where.append("object_type = ?")
            values.append(object_type)
        faction_type = params.get("factionType", params.get("faction_type", ["all"]))[0]
        if faction_type and faction_type != "all":
            where.append("faction_type = ?")
            values.append(faction_type)
        if "minPlanets" in params:
            where.append("planet_count >= ?")
            values.append(int(params["minPlanets"][0]))
        if "maxPlanets" in params:
            where.append("planet_count <= ?")
            values.append(int(params["maxPlanets"][0]))
        if "minHabitabilityScore" in params:
            where.append("habitability_score >= ?")
            values.append(float(params["minHabitabilityScore"][0]))
        year = int(float(params.get("year", ["2350"])[0]))
        where.append("display_after <= ?")
        values.append(year)
        where.append("(display_until IS NULL OR display_until >= ?)")
        values.append(year)
        if query_bool(params, "habitableOnly"):
            where.append("habitable >= 1")
        if not query_bool(params, "includeOuter", True):
            where.append("status != 'outer'")
        sql = "SELECT * FROM stars"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY CASE WHEN octant = '原点' THEN 0 ELSE 1 END, octant, octant_order, distance"
        return [row_to_star(row) for row in con.execute(sql, values)]

    def list_factions(self, con: sqlite3.Connection, params: dict[str, list[str]] | None = None) -> list[dict]:
        params = params or {}
        year = int(float(params.get("year", ["2350"])[0]))
        rows = con.execute(
            """
            SELECT faction, COUNT(*) AS count, MIN(CAST(NULLIF(rank, '-') AS INTEGER)) AS best_rank
            FROM stars
            WHERE display_after <= ? AND (display_until IS NULL OR display_until >= ?)
            GROUP BY faction
            ORDER BY COALESCE(best_rank, 999), faction
            """,
            (year, year),
        ).fetchall()
        return [
            {
                "faction": row["faction"],
                "count": row["count"],
                "bestRank": row["best_rank"],
                "color": FACTION_COLORS.get(row["faction"], "#93a0ad"),
            }
            for row in rows
        ]

    def api_filter_options(self, con: sqlite3.Connection) -> dict:
        def distinct(column: str) -> list[str]:
            return [
                row[0]
                for row in con.execute(
                    f"SELECT DISTINCT {column} FROM stars WHERE {column} IS NOT NULL AND {column} != '' ORDER BY {column}"
                ).fetchall()
            ]

        planet_range = con.execute("SELECT MIN(planet_count), MAX(planet_count) FROM stars").fetchone()
        score_range = con.execute("SELECT MIN(habitability_score), MAX(habitability_score) FROM stars").fetchone()
        return {
            "objectTypes": distinct("object_type"),
            "spectralClasses": distinct("spectral_class"),
            "factionTypes": distinct("faction_type"),
            "factions": self.list_factions(con, {"year": ["2350"]}),
            "planetCount": {"min": planet_range[0] or 0, "max": planet_range[1] or 0},
            "habitabilityScore": {"min": score_range[0] or 0, "max": score_range[1] or 0},
        }

    def api_timeline(self, con: sqlite3.Connection) -> dict:
        min_year, max_year = con.execute(
            """
            SELECT MIN(display_after), MAX(COALESCE(display_until, 2402))
            FROM stars
            """
        ).fetchone()
        return {
            "minYear": min(min_year or 2200, 2200),
            "maxYear": max(max_year or 2402, 2402),
            "defaultYear": 2350,
            "marks": TIMELINE_MARKS,
        }

    def api_system(self, con: sqlite3.Connection, params: dict[str, list[str]]) -> dict:
        key = params.get("id", params.get("star", params.get("name", [""])))[0]
        star = find_star(con, key)
        if not star:
            return {"error": "Star not found"}
        rows = con.execute(
            """
            SELECT *
            FROM system_bodies
            WHERE star_id = ?
            ORDER BY sort_order, orbit_au, name
            """,
            (star["id"],),
        ).fetchall()
        bodies = [row_to_body(row) for row in rows]
        return {"star": star, "bodies": bodies}

    def api_distance(self, con: sqlite3.Connection, params: dict[str, list[str]]) -> dict:
        a = find_star(con, params.get("from", [""])[0])
        b = find_star(con, params.get("to", [""])[0])
        if not a or not b:
            missing = []
            if not a:
                missing.append("from")
            if not b:
                missing.append("to")
            return {"error": "Star not found", "missing": missing}
        distance = distance_between(a, b)
        return {
            "from": a,
            "to": b,
            "distanceLy": round(distance, 3),
            "messageDelayYears": round(distance, 3),
        }

    def api_nearest(self, con: sqlite3.Connection, params: dict[str, list[str]]) -> dict:
        origin = find_star(con, params.get("from", params.get("star", [""]))[0])
        if not origin:
            return {"error": "Origin star not found"}
        limit = max(1, min(int(params.get("limit", ["5"])[0]), 50))
        include_outer = query_bool(params, "includeOuter", True)
        habitable_only = query_bool(params, "habitableOnly")
        object_type = params.get("objectType", ["all"])[0]
        faction_type = params.get("factionType", ["all"])[0]
        year = int(float(params.get("year", ["2350"])[0]))
        candidates = []
        for row in con.execute("SELECT * FROM stars WHERE id != ?", (origin["id"],)):
            star = row_to_star(row)
            if star["displayAfter"] > year or (star["displayUntil"] is not None and star["displayUntil"] < year):
                continue
            if not include_outer and star["status"] == "outer":
                continue
            if habitable_only and star["habitable"] < 1:
                continue
            if object_type != "all" and star["objectType"] != object_type:
                continue
            if faction_type != "all" and star["factionType"] != faction_type:
                continue
            candidates.append({"star": star, "distanceLy": round(distance_between(origin, star), 3)})
        candidates.sort(key=lambda item: item["distanceLy"])
        return {"origin": origin, "nearest": candidates[:limit]}

    def api_zoom(self, con: sqlite3.Connection, params: dict[str, list[str]]) -> dict:
        star = find_star(con, params.get("star", params.get("id", params.get("name", [""])))[0])
        if not star:
            return {"error": "Star not found"}
        camera_distance = float(params.get("distance", ["24"])[0])
        return zoom_payload(star, camera_distance)

    def handle_add_star(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = apply_field_aliases(
            json.loads(self.rfile.read(length).decode("utf-8")),
            {
                "class_name": "className",
                "object_type": "objectType",
                "spectral_class": "spectralClass",
                "star_count": "starCount",
                "planet_count": "planetCount",
                "confirmed_planets": "confirmedPlanets",
                "candidate_planets": "candidatePlanets",
                "faction_type": "factionType",
                "display_after": "displayAfter",
                "display_until": "displayUntil",
                "control_start": "controlStart",
                "control_end": "controlEnd",
                "habitability_score": "habitabilityScore",
            },
        )
        with connect() as con:
            existing_row = con.execute("SELECT * FROM stars WHERE id = ?", (payload.get("id", ""),)).fetchone()
            existing = row_to_star(existing_row) if existing_row else {}
            record = {**existing, **payload}
            required = ["id", "name", "short", "octant", "distance", "arrival", "xyz", "faction"]
            missing = [key for key in required if key not in record]
            if missing:
                self.send_json({"error": "Missing required fields", "missing": missing}, HTTPStatus.BAD_REQUEST)
                return
            if record.get("setting"):
                record["setting"] = normalize_fiction_text(record["setting"])
            x, y, z = record["xyz"]
            con.execute(
                """
                INSERT OR REPLACE INTO stars (
                  id, name, short, octant, octant_order, distance, arrival,
                  x, y, z, faction, rank, class_name, planets, reality,
                  setting, habitable, habitability_score, status, object_type, spectral_class,
                  star_count, planet_count, confirmed_planets, candidate_planets,
                  faction_type, display_after, display_until, control_start,
                  control_end, notes, updated_at, age, lifespan, disasters,
                  hz_inner, hz_outer, rule_info_time, info_speed, ftl_speed
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["name"],
                    record["short"],
                    record["octant"],
                    int(record.get("order", 0)),
                    float(record["distance"]),
                    float(record["arrival"]),
                    float(x),
                    float(y),
                    float(z),
                    record["faction"],
                    str(record.get("rank", "-")),
                    record.get("className", record.get("class_name", "unknown")),
                    record.get("planets", ""),
                    record.get("reality", ""),
                    record.get("setting", ""),
                    int(record.get("habitable", 0)),
                    float(record.get("habitabilityScore", record.get("habitability_score", 0)) or 0),
                    record.get("status", "core"),
                    record.get("objectType", record.get("object_type", "star_system")),
                    record.get("spectralClass", record.get("spectral_class", record.get("className", "unknown"))),
                    int(record.get("starCount", record.get("star_count", 1))),
                    int(record.get("planetCount", record.get("planet_count", 0))),
                    int(record.get("confirmedPlanets", record.get("confirmed_planets", record.get("planetCount", 0)))),
                    int(record.get("candidatePlanets", record.get("candidate_planets", 0))),
                    record.get("factionType", record.get("faction_type", "未分类")),
                    int(record.get("displayAfter", record.get("display_after", 0))),
                    record.get("displayUntil", record.get("display_until")),
                    int(record.get("controlStart", record.get("control_start", 2350))),
                    record.get("controlEnd", record.get("control_end")),
                    record.get("notes", ""),
                    record.get("age", ""),
                    record.get("lifespan", ""),
                    record.get("disasters", ""),
                    float(record.get("hz_inner", 0) or 0),
                    float(record.get("hz_outer", 0) or 0),
                    float(record.get("rule_info_time", 0.12) or 0.12),
                    float(record.get("info_speed", 1) or 1),
                    float(record.get("ftl_speed", 1) or 1),
                ),
            )
            for value in (record["id"], record["name"], record["short"]):
                con.execute(
                    "INSERT OR REPLACE INTO aliases(alias, star_id) VALUES (?, ?)",
                    (normalize_alias(value), record["id"]),
                )
            con.commit()
        self.send_json({"ok": True, "star": record}, HTTPStatus.OK if existing else HTTPStatus.CREATED)

    def handle_add_body(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = apply_field_aliases(
            json.loads(self.rfile.read(length).decode("utf-8")),
            {
                "star_id": "starId",
                "parent_id": "parentId",
                "body_type": "bodyType",
                "orbit_au": "orbitAu",
                "radius_label": "radiusLabel",
                "mass_label": "massLabel",
                "sort_order": "sortOrder",
                "terraform_status": "terraformStatus",
                "habitability_score": "habitabilityScore",
            },
        )
        with connect() as con:
            existing_row = con.execute("SELECT * FROM system_bodies WHERE id = ?", (payload.get("id", ""),)).fetchone()
            existing = row_to_body(existing_row) if existing_row else {}
            record = {**existing, **payload}
            required = ["id", "starId", "name", "bodyType"]
            missing = [key for key in required if key not in record]
            if missing:
                self.send_json({"error": "Missing required fields", "missing": missing}, HTTPStatus.BAD_REQUEST)
                return
            if str(record.get("summary", "")).strip().startswith("_设定_"):
                record["summary"] = normalize_fiction_text(record["summary"])
            con.execute(
                """
                INSERT OR REPLACE INTO system_bodies (
                  id, star_id, parent_id, name, body_type, orbit_au,
                  radius_label, mass_label, habitable, terraform_status,
                  habitability_score, summary, sort_order,
                  rule_info_time, info_speed, ftl_speed
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["starId"],
                    record.get("parentId"),
                    record["name"],
                    record["bodyType"],
                    float(record.get("orbitAu", 0) or 0),
                    record.get("radiusLabel", ""),
                    record.get("massLabel", ""),
                    int(record.get("habitable", 0)),
                    record.get("terraformStatus", record.get("terraform_status", "")),
                    float(record.get("habitabilityScore", record.get("habitability_score", 0)) or 0),
                    record.get("summary", ""),
                    int(record.get("sortOrder", 0)),
                    float(record.get("rule_info_time", 0.05) or 0.05),
                    float(record.get("info_speed", 1) or 1),
                    float(record.get("ftl_speed", 1) or 1),
                ),
            )
            con.commit()
        self.send_json({"ok": True, "body": record}, HTTPStatus.OK if existing else HTTPStatus.CREATED)


def api_docs() -> dict:
    return {
        "endpoints": {
            "GET /api/stars": "List stars. Query: q, faction, class, objectType, factionType, minPlanets, maxPlanets, minHabitabilityScore, year, habitableOnly=1, includeOuter=0.",
            "GET /api/search": "Alias of /api/stars for agent filter/search calls.",
            "GET /api/star?id=gj1002": "Find a star by id, name, short name, or alias.",
            "GET /api/factions": "List factions with counts and colors.",
            "GET /api/filter-options": "Return distinct object types, spectral classes, faction types, and planet count range.",
            "GET /api/timeline": "Return available year range and canonical timeline marks.",
            "GET /api/system?id=li-hartman": "Return a star and its internal bodies/orbits.",
            "GET /api/distance?from=gj1002&to=teegarden": "Calculate 3D distance in light years.",
            "GET /api/nearest?from=gj1002&limit=5": "List nearest systems from a given star.",
            "GET /api/zoom-target?star=gj1002": "Return target/camera coordinates for agent-driven zoom.",
            "POST|PUT|PATCH /api/stars": "Add, replace, or partially update a star record. New records need the required star schema; existing records can send only id plus changed fields.",
            "POST|PUT|PATCH /api/system-bodies": "Add, replace, or partially update a clickable body inside a star system. New records need id, starId, name, and bodyType; existing records can send only id plus changed fields.",
        },
        "agentBrowserApi": [
            "window.StarMapAgent.zoomToStar(idOrName)",
            "window.StarMapAgent.distanceBetween(from, to)",
            "window.StarMapAgent.nearestTo(from, limit)",
            "window.StarMapAgent.searchStars(textOrFilters)",
            "window.StarMapAgent.filterStars(filters)",
            "window.StarMapAgent.openSystem(idOrName)",
            "window.StarMapAgent.addStar(payload)",
            "window.StarMapAgent.updateStar({id, ...changedFields})",
            "window.StarMapAgent.addBody(payload)",
            "window.StarMapAgent.updateBody({id, ...changedFields})",
            "window.StarMapAgent.setHabitabilityLabels(trueOrFalse)",
            "window.StarMapAgent.toggleHabitabilityLabels()",
            "window.StarMapAgent.getState()",
        ],
    }


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    count = initialize_database(DB_PATH)
    server = ThreadingHTTPServer(("127.0.0.1", port), StarMapHandler)
    print(f"StarMap database: {DB_PATH} ({count} stars)")
    print(f"StarMap running: http://127.0.0.1:{port}/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
