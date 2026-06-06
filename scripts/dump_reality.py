import sqlite3
import json

c = sqlite3.connect('data/stars.sqlite')
rows = c.execute('SELECT id, name, reality, short FROM stars').fetchall()
data = [{'id': r[0], 'name': r[1], 'reality': r[2], 'short': r[3]} for r in rows]

with open('scratch/stars_reality.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
