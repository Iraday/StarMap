import sqlite3
c = sqlite3.connect('data/stars.sqlite')
print(c.execute('SELECT COUNT(*) FROM stars WHERE status="outer"').fetchone())
