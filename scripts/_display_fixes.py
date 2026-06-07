"""Apply all remaining faction/display changes."""
import sqlite3

c = sqlite3.connect("data/stars.sqlite")

# ── 1. Clear reality on fictional stars; italicize reef-epsilon name ────
c.execute("UPDATE stars SET reality='' WHERE id='reef-epsilon'")
c.execute("UPDATE stars SET name=?, short=? WHERE id='reef-epsilon'", (
    "_暗礁-ε_ / _Reef-Epsilon_", "_Reef-ε_"
))
c.execute("UPDATE stars SET reality='' WHERE id='li-hartman'")
print("Cleared reality on fictional stars; italicized reef-epsilon name")

# ── 2. Rename 人类群星联合 → 人类群星 ─────────────────────────────────────
c.execute("UPDATE stars SET faction='人类群星' WHERE faction='人类群星联合'")
n = c.execute("SELECT COUNT(*) FROM stars WHERE faction='人类群星'").fetchone()[0]
print(f"Renamed 人类群星联合 → {n} stars")

# ── 3. Set 格利泽远星物流网络 rank to 7 (right after 半人马联合重工=6) ────────
# Shift ranks 7-99 up by 1 first
c.execute("""
    UPDATE stars SET rank=CAST(CAST(rank AS INTEGER)+1 AS TEXT)
    WHERE rank != '-' AND CAST(rank AS INTEGER) >= 7 AND CAST(rank AS INTEGER) <= 99
    AND faction != '格利泽远星物流网络'
""")
c.execute("UPDATE stars SET rank='7' WHERE faction='格利泽远星物流网络'")
print("格利泽远星物流网络 rank set to 7")

# ── 4. Add notes to 半人马联合重工 stars ────────────────────────────────────
note_camara = (
    "_半人马联合重工前身（近邻三角军工托管区）与太阳系军工体系深度绑定，"
    "太阳系内战期间调回参战的大量舰队与人员损失殆尽，战后失去核心技术人员和主力战舰，"
    "仅凭残余设施勉强维持运营，实力严重缩水，2350年已沦为二线军工承包商。_"
)
c.execute("UPDATE stars SET notes=? WHERE faction='半人马联合重工'", (note_camara,))
print("Added notes to 半人马联合重工 stars")

# ── 5. Add notes to 格利泽远星物流网络 stars ─────────────────────────────────
note_gliese = (
    "_格利泽远星物流网络仅有GJ 625 b与GJ 667 Cc两处定居点，相互间距超过10光年，"
    "距太阳系亦在20光年以上；漫长的殖民时间差（内战消息到达两地时已是2290年代末）"
    "与极端分散的星系分布，使得政治协调极为困难，在各大巨企的博弈中话语权极为有限，"
    "是公认的边缘运输商。_"
)
c.execute("UPDATE stars SET notes=? WHERE faction='格利泽远星物流网络'", (note_gliese,))
print("Added notes to 格利泽远星物流网络 stars")

# ── Verify ────────────────────────────────────────────────────────────────
print("\n=== Fictional stars ===")
for r in c.execute("SELECT id, name, short, reality FROM stars WHERE id IN ('reef-epsilon','li-hartman')").fetchall():
    print(f"  {r[0]}: name={r[1]}  reality={repr(r[3][:30])}")

print("\n=== Rank check ===")
for r in c.execute(
    "SELECT faction, MIN(CAST(rank AS INTEGER)) as mr FROM stars WHERE rank!='-' "
    "GROUP BY faction HAVING mr BETWEEN 5 AND 9 ORDER BY mr"
).fetchall():
    print(f"  {r[0]:30s} rank={r[1]}")

c.commit()
c.close()
print("\nDone.")
