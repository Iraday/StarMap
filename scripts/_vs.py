import sqlite3
c = sqlite3.connect("data/stars.sqlite")
print("score>1:", c.execute("SELECT COUNT(*) FROM system_bodies WHERE habitability_score > 1.0").fetchone()[0])
lh = c.execute("SELECT SUM(habitability_score) FROM system_bodies WHERE star_id='li-hartman' AND terraform_status NOT IN ('','none')").fetchone()[0] or 0
print(f"li-hartman: {lh:.4f}  (target 4.74)")
print()
for r in c.execute("""
    SELECT s.faction, ROUND(SUM(sb.habitability_score),2) as total,
           COUNT(CASE WHEN sb.terraform_status='terraformed' THEN 1 END) as done
    FROM system_bodies sb JOIN stars s ON s.id=sb.star_id
    WHERE sb.habitability_score > 0
    GROUP BY s.faction ORDER BY total DESC
""").fetchall():
    print(f"  {r[0]:<25}  {r[1]:>7.2f}  done={r[2]}")
