from __future__ import annotations

import json
import math
import sqlite3
import sys
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from scripts.init_db import DEFAULT_DB, initialize_database, normalize_alias


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "stars.sqlite"


FACTION_COLORS = {
    "太阳系": "#f4f2de",
    "无限未来": "#ff6575",
    "人类群星联合": "#68a8ff",
    "明日晨曦": "#ffc857",
    "S&F": "#b28cff",
    "美丽花园巨企": "#78dd8a",
    "近邻三角军工托管区": "#e68a4e",
    "星蓝元素": "#2bd7ff",
    "巴纳德星际动力": "#b9bdc5",
    "拉卡伊冶金公会": "#d5eef2",
    "沃尔夫潮汐能源财团": "#6fd3c7",
    "Ross 128生态城邦": "#a3efb6",
    "远岭联营": "#e6b06f",
    "南爪边境开发集团": "#d070ff",
    "外环水蛇-北落师门采掘同盟": "#b9b86b",
    "许可/争议区": "#93a0ad",
}


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = MEMORY")
    return con


def row_to_star(row: sqlite3.Row) -> dict:
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
        "status": row["status"],
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


class StarMapHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args) -> None:
        print(f"[StarMap] {self.address_string()} - {format % args}")

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
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
        parsed = urlparse(self.path)
        if parsed.path == "/api/stars":
            self.handle_add_star()
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
                elif path == "/api/factions":
                    self.send_json(self.list_factions(con))
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
        if query_bool(params, "habitableOnly"):
            where.append("habitable >= 1")
        if not query_bool(params, "includeOuter", True):
            where.append("status != 'outer'")
        sql = "SELECT * FROM stars"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY CASE octant WHEN '原点' THEN '000' ELSE octant END, octant_order, distance"
        return [row_to_star(row) for row in con.execute(sql, values)]

    def list_factions(self, con: sqlite3.Connection) -> list[dict]:
        rows = con.execute(
            """
            SELECT faction, COUNT(*) AS count, MIN(CAST(NULLIF(rank, '-') AS INTEGER)) AS best_rank
            FROM stars
            GROUP BY faction
            ORDER BY COALESCE(best_rank, 999), faction
            """
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
        candidates = []
        for row in con.execute("SELECT * FROM stars WHERE id != ?", (origin["id"],)):
            star = row_to_star(row)
            if not include_outer and star["status"] == "outer":
                continue
            if habitable_only and star["habitable"] < 1:
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
        payload = json.loads(self.rfile.read(length).decode("utf-8"))
        required = ["id", "name", "short", "octant", "distance", "arrival", "xyz", "faction"]
        missing = [key for key in required if key not in payload]
        if missing:
            self.send_json({"error": "Missing required fields", "missing": missing}, HTTPStatus.BAD_REQUEST)
            return
        x, y, z = payload["xyz"]
        with connect() as con:
            con.execute(
                """
                INSERT OR REPLACE INTO stars (
                  id, name, short, octant, octant_order, distance, arrival,
                  x, y, z, faction, rank, class_name, planets, reality,
                  setting, habitable, status, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    payload["id"],
                    payload["name"],
                    payload["short"],
                    payload["octant"],
                    int(payload.get("order", 0)),
                    float(payload["distance"]),
                    float(payload["arrival"]),
                    float(x),
                    float(y),
                    float(z),
                    payload["faction"],
                    str(payload.get("rank", "-")),
                    payload.get("className", payload.get("class_name", "unknown")),
                    payload.get("planets", ""),
                    payload.get("reality", ""),
                    payload.get("setting", ""),
                    int(payload.get("habitable", 0)),
                    payload.get("status", "core"),
                ),
            )
            for value in (payload["id"], payload["name"], payload["short"]):
                con.execute(
                    "INSERT OR REPLACE INTO aliases(alias, star_id) VALUES (?, ?)",
                    (normalize_alias(value), payload["id"]),
                )
            con.commit()
        self.send_json({"ok": True, "star": payload}, HTTPStatus.CREATED)


def api_docs() -> dict:
    return {
        "endpoints": {
            "GET /api/stars": "List stars. Query: faction, habitableOnly=1, includeOuter=0.",
            "GET /api/star?id=gj1002": "Find a star by id, name, short name, or alias.",
            "GET /api/factions": "List factions with counts and colors.",
            "GET /api/distance?from=gj1002&to=teegarden": "Calculate 3D distance in light years.",
            "GET /api/nearest?from=gj1002&limit=5": "List nearest systems from a given star.",
            "GET /api/zoom-target?star=gj1002": "Return target/camera coordinates for agent-driven zoom.",
            "POST /api/stars": "Add or replace a star record. JSON body follows the app star schema.",
        },
        "agentBrowserApi": [
            "window.StarMapAgent.zoomToStar(idOrName)",
            "window.StarMapAgent.distanceBetween(from, to)",
            "window.StarMapAgent.nearestTo(from, limit)",
            "window.StarMapAgent.searchStars(text)",
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
