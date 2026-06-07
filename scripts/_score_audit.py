import sqlite3, os

# Find the backup that has habitability_score
for d in sorted(os.listdir("backup"), reverse=True):
    p = f"backup/{d}/stars.sqlite"
    if not os.path.exists(p):
        continue
    c2 = sqlite3.connect(p)
    cols = [r[1] for r in c2.execute("PRAGMA table_info(system_bodies)").fetchall()]
    n_lh = c2.execute("SELECT COUNT(*) FROM system_bodies WHERE star_id='li-hartman'").fetchone()[0]
    has_score = "habitability_score" in cols
    if has_score:
        score = c2.execute(
            "SELECT SUM(habitability_score) FROM system_bodies WHERE star_id='li-hartman' AND terraform_status NOT IN ('','none')"
        ).fetchone()[0] or 0
    else:
        score = "N/A"
    print(f"backup/{d}: li-hartman bodies={n_lh}  has_score={has_score}  score={score}")
    c2.close()

print()
# Current DB: show all li-hartman bodies
c = sqlite3.connect("data/stars.sqlite")
total_lh = c.execute(
    "SELECT SUM(habitability_score) FROM system_bodies WHERE star_id='li-hartman' AND terraform_status NOT IN ('','none')"
).fetchone()[0] or 0
print(f"Current li-hartman tf score sum: {total_lh:.4f}")
print()

# Show distribution of habitability_score
print("=== habitability_score distribution ===")
for r in c.execute("""
    SELECT CASE
        WHEN habitability_score = 0 THEN '0'
        WHEN habitability_score < 0.3 THEN '<0.3'
        WHEN habitability_score < 0.5 THEN '0.3-0.5'
        WHEN habitability_score < 0.7 THEN '0.5-0.7'
        WHEN habitability_score < 1.0 THEN '0.7-1.0'
        WHEN habitability_score = 1.0 THEN '=1.0'
        WHEN habitability_score > 1.0 THEN '>1.0'
    END as bucket, COUNT(*) as n
    FROM system_bodies
    GROUP BY bucket ORDER BY MIN(habitability_score)
""").fetchall():
    print(f"  {r[0]:10s}: {r[1]}")

print()
print("=== Auto-generated moon bodies sample (id ends with 卫NN pattern) ===")
rows = c.execute("""
    SELECT sb.id, sb.star_id, sb.terraform_status, sb.habitability_score, sb.body_type
    FROM system_bodies sb
    WHERE sb.id LIKE '%卫%'
    ORDER BY sb.habitability_score DESC LIMIT 10
""").fetchall()
for r in rows:
    print(f"  {r[0]:35s}  star={r[1]:15s}  tf={r[2]:15s}  score={r[3]:.2f}  type={r[4]}")
total_auto = c.execute("SELECT COUNT(*) FROM system_bodies WHERE id LIKE '%卫%'").fetchone()[0]
print(f"  Total auto-generated 卫 bodies: {total_auto}")
