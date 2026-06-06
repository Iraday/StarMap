import sqlite3
c = sqlite3.connect('data/stars.sqlite')
print([r[0] for r in c.execute('SELECT id FROM stars WHERE status="outer"').fetchall()])
