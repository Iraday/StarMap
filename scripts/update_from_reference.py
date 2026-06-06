#!/usr/bin/env python3
"""
Update star positions, distances, and basic stellar data in stars.sqlite
from reference/solar_neighborhood_50ly.json.

Fields updated (only when reference data is present and more precise):
  - distance  (light-years, from reference distance.light_years)
  - x, y, z   (light-years, converted from position_heliocentric_pc × 3.26156)
  - spectral_class  (first token of photometry.spectral_type, only for
                     single-spectral DB entries like 'M', 'K', 'G' etc.)
  - confirmed_planets  (sum across all components for multi-component systems)
  - star_count  (from stellar_properties.n_stars_in_system when > 0)

Fields NOT overwritten:
  - planet_count, faction, setting, reality, and anything in STAR_OVERRIDES
    that is explicitly fictional (those stay as-is from seed_data).
  - Spectral class for multi-component DB entries (e.g. 'G/K/M', 'K/DA/M').
  - Any star listed in FICTIONAL_IDS.

New stars (in MAPPING but absent from DB) are inserted with faction="无/无所属".

Auto-scan: after processing MAPPING, the script scans ALL reference systems
not covered by any MAPPING key and inserts them as new "无/无所属" entries,
unless already in DB. The only skip condition is truly missing position data
(which does not occur in solar_neighborhood_50ly.json).

Coordinate verification: after all inserts, existing real (non-fictional) DB
stars are re-verified against their reference positions and updated if needed.
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
from pathlib import Path

PC_TO_LY = 3.26156  # 1 parsec = 3.26156 light-years

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "reference" / "solar_neighborhood_50ly.json"
DB = ROOT / "data" / "stars.sqlite"

# ---------------------------------------------------------------------------
# Fictional / hand-crafted star IDs that must never be modified by this script.
# ---------------------------------------------------------------------------
FICTIONAL_IDS: set[str] = {
    "li-hartman",   # fictional anchor star; all data is custom
    "sol",          # Sol has special curated fields
}

# ---------------------------------------------------------------------------
# Mapping: DB star id → one or more reference JSON system keys.
# For multi-key entries the first key with position data supplies x/y/z and
# distance; confirmed_planets is summed across all listed keys.
# ---------------------------------------------------------------------------
MAPPING: dict[str, str | list[str]] = {
    # Inner neighbors (< 10 ly)
    "alpha":           ["Rigil Kentaurus", "HIP 71681", "Proxima Cen"],
    "barnard":         "Barnard's star",
    "lalande":         "GJ 411",
    "sirius":          "Sirius",
    "luyten726":       "HIP 92403",          # UV Ceti / Luyten 726-8
    "wolf359":         "HIP 54211",          # Wolf 359 / CN Leo
    # 10-15 ly
    "epsilon-eridani": "eps Eri",
    "gj887":           "GJ 887",
    "ross128":         "Ross 128",
    "ez-aqr":          "HIP 115332",         # EZ Aquarii / GJ 866
    "61cyg":           "HIP 104214",          # 61 Cyg A
    "procyon":         "Procyon",
    "struve2398":      "Gl 725 A",
    "groombridge34":   "GJ 15 A",
    "dx-cancri":       "HIP 37766",          # DX Cancri / GJ 1111
    "epsilon-indi":    "eps Ind A",
    "tau-ceti":        "tau Cet",
    "gj1061":          None,                 # not in reference catalog
    "yz-ceti":         "YZ Cet",
    "gj273":           "GJ 273",
    "teegarden":       "HIP 113296",         # Teegarden's Star
    "kapteyn":         "Kapteyn",
    "scr1845":         "HIP 91699",          # SCR 1845-6357
    "kruger60":        "HIP 110893",         # Kruger 60 / DO Cep
    "denis1048":       "HIP 57544",          # DENIS 1048-3956
    # 14-18 ly
    "wolf1061":        "Wolf 1061",
    "van-maanen":      "HIP 3829",           # Van Maanen 2
    "gliese1":         None,                 # GJ 1 — reference distance mismatch
    "wolf424":         "HIP 67593",          # Wolf 424 / FL Vir
    "gj674":           "GJ 674",
    "gj876":           "GJ 876",
    "gj1002":          None,                 # not matched reliably
    "ad-leonis":       None,                 # AD Leo = GJ 388; HIP 49908 is actually GJ 380 (K8V) — no reliable match
    "gliese832":       "GJ 832",
    "40eridani":       "Keid",               # 40 Eri = Keid
    "gj682":           "GJ 682",
    "70oph":           "HIP 88601",
    # 16-25 ly
    "altair":          "Altair",
    "stein2051":       "HIP 15689",          # Stein 2051
    "gj251":           "GJ 251",
    "sigma-dra":       "HIP 96100",
    "gliese229":       "GJ 229",
    "gliese570":       "HIP 73184",
    "v1216sgr":        None,                 # Ross 154 / GJ 729 — not located in reference
    "eta-cas":         "Achird",             # Eta Cassiopeiae = Achird
    "36oph":           "HIP 88601",
    "hd20794":         "HD 20794",
    "delta-pav":       "HIP 99240",
    "eq-peg":          "HIP 117473",         # EQ Pegasi
    "gliese581":       "GJ 581",
    "gj625":           "GJ 625",
    "hd219134":        "HD 219134",
    "xi-bootis":       "HIP 72659",
    "ltt1445":         "LTT 1445 A",
    "gj667c":          "HIP 84709",
    "beta-hydri":      "HIP 2021",
    "107piscium":      "HIP 7981",
    "vega":            "Vega",
    "fomalhaut":       "Fomalhaut",
    # 25-50 ly
    "gliese486":       "GJ 486",
    "61vir":           "61 Vir",
    "gj433":           "GJ 433",
    "gamma-pav":       "HIP 105858",
    "gj357":           "GJ 357",
    "gliese436":       "GJ 436",
    "l98-59":          "HIP 45343",          # L 98-59 / TOI-175
    "hd85512":         "HIP 48331",          # HD 85512
    "gj180":           "GJ 180",
    "trappist-1":      None,                 # not in reference catalog
    "hd69830":         "HD 69830",
    "55cnc":           "55 Cnc",
    "hd40307":         "HD 40307",
    "ups-and":         "ups And",
    "47uma":           "47 UMa",
    "lhs1140":         "HIP 4856",           # LHS 1140
    # Stars in MAPPING not yet in DB → will be inserted with faction 无/无所属
    "gj163":           "GJ 163",
}


def first_spectral_token(spec: str | None) -> str | None:
    """Return the first OBAFGKM… token from a spectral type string."""
    if not spec:
        return None
    text = spec.strip().upper()
    for token in ("O", "B", "A", "F", "G", "K", "M", "L", "T", "Y"):
        if text.startswith(token):
            return token
    return None


def is_multi_spectral(db_class: str) -> bool:
    """Return True if the DB entry already stores a multi-component spectral class."""
    return "/" in db_class or db_class.upper() in {"L/T", "A/DA", "K/DA/M", "G/K/M", "K/T", "M/T", "F/D"}


def load_reference() -> dict:
    with open(REFERENCE, encoding="utf-8") as fh:
        return json.load(fh)["systems"]


def resolve_keys(raw: str | list) -> list[str]:
    return raw if isinstance(raw, list) else [raw]


def pick_primary(systems: dict, keys: list[str]) -> dict | None:
    """Return the first entry that has position data, or the first that exists."""
    first_found = None
    for key in keys:
        sys = systems.get(key)
        if sys is None:
            continue
        if first_found is None:
            first_found = sys
        if sys.get("position_heliocentric_pc"):
            return sys
    return first_found


def sum_confirmed_planets(systems: dict, keys: list[str]) -> int:
    total = 0
    for key in keys:
        sys = systems.get(key)
        if sys:
            total += int(sys.get("n_confirmed_planets") or 0)
    return total


def compute_octant(x: float, y: float, z: float) -> str:
    return ("+" if x >= 0 else "-") + ("+" if y >= 0 else "-") + ("+" if z >= 0 else "-")


def insert_new_star(cur: sqlite3.Cursor, db_id: str, primary: dict, ref_confirmed: int) -> None:
    """Insert a star record that does not yet exist in the DB."""
    dist = round((primary.get("distance") or {}).get("light_years") or 0, 4)

    pos = primary.get("position_heliocentric_pc")
    if pos:
        x = round(pos["x"] * PC_TO_LY, 4)
        y = round(pos["y"] * PC_TO_LY, 4)
        z = round(pos["z"] * PC_TO_LY, 4)
    else:
        # Fall back to RA/Dec spherical conversion
        astro = primary.get("astrometry") or {}
        ra_deg = astro.get("ra_deg")
        dec_deg = astro.get("dec_deg")
        if ra_deg is not None and dec_deg is not None and dist > 0:
            ra = math.radians(ra_deg)
            dec = math.radians(dec_deg)
            x = round(dist * math.cos(dec) * math.cos(ra), 4)
            y = round(dist * math.cos(dec) * math.sin(ra), 4)
            z = round(dist * math.sin(dec), 4)
        else:
            x = y = z = 0.0

    spec_raw = (primary.get("photometry") or {}).get("spectral_type")
    spec = first_spectral_token(spec_raw) or "?"
    n_stars = int((primary.get("stellar_properties") or {}).get("n_stars_in_system") or 1)
    name_raw = primary.get("nasa_hostname") or primary.get("proper_name") or db_id
    short = name_raw
    octant = compute_octant(x, y, z)
    arrival = round(2278 + dist, 4)
    status = "outer" if dist > 25.0 else "minor"

    cur.execute(
        """
        INSERT INTO stars (
          id, name, short, octant, octant_order, distance, arrival,
          x, y, z, faction, rank, class_name, planets, reality,
          setting, habitable, status, object_type, spectral_class,
          star_count, planet_count, confirmed_planets, candidate_planets,
          faction_type, display_after, rule_info_time, info_speed, ftl_speed
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
        """,
        (
            db_id, name_raw, short, octant, int(dist), dist, arrival,
            x, y, z, "无/无所属", "-", spec_raw or spec, "", "",
            "", 0, status, "star_system", spec,
            n_stars, ref_confirmed, ref_confirmed, 0,
            "无/无所属", 0, 0.04, 1.0, 1.0,
        ),
    )
    print(f"  [INSERT]  {db_id}: dist={dist} ly, xyz=({x},{y},{z}), planets={ref_confirmed}, faction=无/无所属")


def ref_key_to_db_id(ref_key: str) -> str:
    """Derive a stable DB id from a reference JSON system key.

    Rules (applied in order):
    - Catalog prefixes GJ/Gl/GJ → "gj"
    - HD, HIP, HN, AU → kept lowercase
    - Proper names or Greek-letter names → hyphenated lowercase
    - Trailing " A" / " B" component letters → appended without hyphen
    """
    key = ref_key.strip()
    # Component suffix like " A" or " B" at end
    comp_match = re.match(r"^(.*?)\s+([AB])$", key)
    suffix = ""
    if comp_match:
        key = comp_match.group(1)
        suffix = comp_match.group(2).lower()

    # Catalog-number patterns: "GJ 123", "Gl 123", "HD 123", "HIP 123", "HN Lib" etc.
    catalog = re.match(r"^(GJ|Gl|HD|HIP|HN|AU|LTT|Ross)\s+(.+)$", key, re.IGNORECASE)
    if catalog:
        prefix = catalog.group(1).lower()
        rest = catalog.group(2).strip().replace(" ", "")
        return f"{prefix}{rest}{suffix}"

    # Greek letter abbreviations like "gam Cep", "eps Eri", "tau Cet", "ups And"
    greek = re.match(r"^(gam|eps|tau|ups|bet|alp|del|eta|sig|xi|mu|nu|kap|lam|zet|omi|pi|rho|chi|psi|ome)\s+(.+)$", key, re.IGNORECASE)
    if greek:
        abbr = greek.group(1).lower()
        const = greek.group(2).lower().replace(" ", "")
        return f"{abbr}-{const}{suffix}"

    # Proper names / compound names → hyphenated lowercase
    return re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-") + suffix


def build_covered_keys(mapping: dict) -> set[str]:
    """Return the set of all reference keys already covered by MAPPING."""
    covered: set[str] = set()
    for v in mapping.values():
        if v is None:
            continue
        if isinstance(v, list):
            covered.update(v)
        else:
            covered.add(v)
    return covered


def has_valid_position(sys_data: dict) -> bool:
    """Return True if usable position data exists (pc vector OR RA/Dec+dist)."""
    if sys_data.get("position_heliocentric_pc"):
        return True
    astro = sys_data.get("astrometry") or {}
    dist = (sys_data.get("distance") or {}).get("light_years")
    return (
        astro.get("ra_deg") is not None
        and astro.get("dec_deg") is not None
        and dist is not None
        and float(dist) > 0
    )


def ref_xyz(sys_data: dict) -> tuple[float, float, float] | None:
    """Return (x, y, z) in light-years for a reference entry, or None."""
    pos = sys_data.get("position_heliocentric_pc")
    if pos:
        return (
            round(pos["x"] * PC_TO_LY, 4),
            round(pos["y"] * PC_TO_LY, 4),
            round(pos["z"] * PC_TO_LY, 4),
        )
    astro = sys_data.get("astrometry") or {}
    ra_deg = astro.get("ra_deg")
    dec_deg = astro.get("dec_deg")
    dist = (sys_data.get("distance") or {}).get("light_years")
    if ra_deg is not None and dec_deg is not None and dist:
        ra = math.radians(ra_deg)
        dec = math.radians(dec_deg)
        d = float(dist)
        return (
            round(d * math.cos(dec) * math.cos(ra), 4),
            round(d * math.cos(dec) * math.sin(ra), 4),
            round(d * math.sin(dec), 4),
        )
    return None


def scan_and_insert_uncovered(
    systems: dict,
    cur: sqlite3.Cursor,
    covered_keys: set[str],
    existing_ids: set[str],
) -> int:
    """Insert ALL reference systems not covered by MAPPING and not already in DB.

    Only skip condition: no valid position data (never happens in the 50ly catalog).
    Returns (inserted_count, ref_key→db_id map for newly inserted entries).
    """
    inserted = 0
    for ref_key, sys_data in systems.items():
        if ref_key in covered_keys:
            continue

        if not has_valid_position(sys_data):
            print(f"  [NOPOS]   {ref_key}: no usable position data — skipped")
            continue

        db_id = ref_key_to_db_id(ref_key)

        # Skip if already in DB
        if db_id in existing_ids:
            continue

        n_planets = int(sys_data.get("n_confirmed_planets") or 0)
        insert_new_star(cur, db_id, sys_data, n_planets)
        existing_ids.add(db_id)
        covered_keys.add(ref_key)
        inserted += 1

    return inserted


def verify_scan_coords(
    systems: dict,
    cur: sqlite3.Cursor,
    covered_keys: set[str],
) -> int:
    """Re-verify xyz/distance for all auto-inserted (scan-derived) DB stars.

    Iterates all reference keys that are NOT in the manual MAPPING, derives
    the db_id, and checks whether the DB coordinates match the reference
    (preferring position_heliocentric_pc over RA/Dec). Updates if off by
    more than 0.01 ly.
    Returns count of records updated.
    """
    updated = 0
    manual_covered = build_covered_keys(MAPPING)  # keys in manual MAPPING only
    for ref_key, sys_data in systems.items():
        if ref_key in manual_covered:
            continue  # handled by the MAPPING pass
        db_id = ref_key_to_db_id(ref_key)
        row = cur.execute(
            "SELECT id, distance, x, y, z FROM stars WHERE id = ?", (db_id,)
        ).fetchone()
        if row is None:
            continue

        xyz = ref_xyz(sys_data)
        if xyz is None:
            continue
        ref_x, ref_y, ref_z = xyz
        ref_dist = round((sys_data.get("distance") or {}).get("light_years") or 0, 4)

        upd: dict[str, float] = {}
        if ref_dist > 0 and abs(ref_dist - row["distance"]) > 0.01:
            upd["distance"] = ref_dist
        if abs(ref_x - row["x"]) > 0.01 or abs(ref_y - row["y"]) > 0.01 or abs(ref_z - row["z"]) > 0.01:
            upd["x"] = ref_x
            upd["y"] = ref_y
            upd["z"] = ref_z

        if upd:
            set_clause = ", ".join(f"{col} = ?" for col in upd)
            cur.execute(f"UPDATE stars SET {set_clause} WHERE id = ?", [*upd.values(), db_id])
            print(f"  [XYZ-FIX] {db_id}: {upd}")
            updated += 1

    return updated


def main() -> None:
    systems = load_reference()

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    updated = 0
    inserted = 0
    skipped = 0
    missing = []

    # Track which reference keys are covered and which DB ids already exist
    covered_keys = build_covered_keys(MAPPING)
    existing_ids: set[str] = {r[0] for r in con.execute("SELECT id FROM stars").fetchall()}

    for db_id, raw_keys in MAPPING.items():
        # Never touch fictional/hand-crafted stars
        if db_id in FICTIONAL_IDS:
            print(f"  [PROTECT] {db_id}: fictional star — skipped")
            skipped += 1
            continue

        # None value means star has no reliable reference match
        if raw_keys is None:
            print(f"  [NOREF]   {db_id}: no reference key assigned")
            skipped += 1
            continue

        keys = resolve_keys(raw_keys)

        # Check which keys actually exist in reference
        found_keys = [k for k in keys if k in systems]
        if not found_keys:
            print(f"  [MISSING] {db_id}: none of {keys} found in reference")
            missing.append(db_id)
            skipped += 1
            continue

        primary = pick_primary(systems, found_keys)
        if primary is None:
            print(f"  [SKIP]    {db_id}: no usable primary entry")
            skipped += 1
            continue

        ref_confirmed = sum_confirmed_planets(systems, found_keys)

        # Fetch current DB row
        row = cur.execute(
            "SELECT id, distance, x, y, z, spectral_class, confirmed_planets, star_count FROM stars WHERE id = ?",
            (db_id,),
        ).fetchone()

        if row is None:
            # Star not in DB → insert with faction 无/无所属
            insert_new_star(cur, db_id, primary, ref_confirmed)
            existing_ids.add(db_id)
            inserted += 1
            continue

        updates: dict[str, float | int | str] = {}

        # --- distance ---
        ref_dist_ly = (primary.get("distance") or {}).get("light_years")
        if ref_dist_ly and abs(ref_dist_ly - row["distance"]) > 0.01:
            updates["distance"] = round(ref_dist_ly, 4)

        # --- x, y, z position ---
        pos = primary.get("position_heliocentric_pc")
        if pos:
            ref_x = round(pos["x"] * PC_TO_LY, 4)
            ref_y = round(pos["y"] * PC_TO_LY, 4)
            ref_z = round(pos["z"] * PC_TO_LY, 4)
            if abs(ref_x - row["x"]) > 0.05 or abs(ref_y - row["y"]) > 0.05 or abs(ref_z - row["z"]) > 0.05:
                updates["x"] = ref_x
                updates["y"] = ref_y
                updates["z"] = ref_z

        # --- spectral class (only for single-spectral DB entries) ---
        if not is_multi_spectral(row["spectral_class"]):
            ref_spec = (primary.get("photometry") or {}).get("spectral_type")
            token = first_spectral_token(ref_spec)
            if token and token != row["spectral_class"]:
                updates["spectral_class"] = token

        # --- confirmed planets (sum across all components) ---
        if ref_confirmed > 0 and ref_confirmed != row["confirmed_planets"]:
            updates["confirmed_planets"] = ref_confirmed

        # --- star count ---
        n_stars = (primary.get("stellar_properties") or {}).get("n_stars_in_system")
        if n_stars and int(n_stars) > 1 and int(n_stars) != row["star_count"]:
            updates["star_count"] = int(n_stars)

        if updates:
            set_clause = ", ".join(f"{col} = ?" for col in updates)
            values = list(updates.values()) + [db_id]
            cur.execute(f"UPDATE stars SET {set_clause} WHERE id = ?", values)
            print(f"  [UPDATE]  {db_id}: {updates}")
            updated += 1
        else:
            print(f"  [OK]      {db_id}: no changes needed")

    # --- Auto-scan: insert ALL uncovered reference systems ---
    print()
    print("=== Auto-scan: inserting ALL uncovered reference systems ===")
    scan_inserted = scan_and_insert_uncovered(systems, cur, covered_keys, existing_ids)
    inserted += scan_inserted

    # --- Coordinate verification for auto-inserted stars ---
    print()
    print("=== Coordinate verification for scan-inserted stars ===")
    coord_fixed = verify_scan_coords(systems, cur, covered_keys)

    con.commit()
    con.close()

    print()
    print(f"Done — {updated} updated, {inserted} inserted ({scan_inserted} via scan), {coord_fixed} xyz-fixed, {skipped} skipped.")
    if missing:
        print(f"Not found in reference: {missing}")


if __name__ == "__main__":
    main()
