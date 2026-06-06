import sqlite3

c = sqlite3.connect('data/stars.sqlite')
# Replace 自然天体/科研区 with 无/无所属
c.execute('UPDATE stars SET faction = "无/无所属" WHERE faction = "自然天体/科研区"')
# Also override stars > 25 ly that currently have other factions to "无/无所属" since in 2350 they're unaffiliated
c.execute('UPDATE stars SET faction = "无/无所属" WHERE distance > 25')
count1 = c.execute('SELECT changes()').fetchone()[0]
c.commit()
print(f"Updated faction for {count1} stars > 25 ly")
print("Stars with 无/无所属:", c.execute('SELECT COUNT(*) FROM stars WHERE faction = "无/无所属"').fetchone()[0])
print("Distinct factions:", [r[0] for r in c.execute('SELECT DISTINCT faction FROM stars ORDER BY faction').fetchall()])
