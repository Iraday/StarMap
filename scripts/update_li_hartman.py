import sqlite3
import os

db_path = 'data/stars.sqlite'
if not os.path.exists(db_path):
    print("DB not found")
    exit(1)

con = sqlite3.connect(db_path)
con.execute('UPDATE stars SET name = "*李-哈特曼* / *Li-Hartman*", short = "*Li-Hartman*" WHERE id = "li-hartman"')
con.execute('UPDATE aliases SET alias = "*李-哈特曼* / *Li-Hartman*" WHERE alias = "李-哈特曼 / Li-Hartman"')
con.execute('UPDATE aliases SET alias = "*Li-Hartman*" WHERE alias = "Li-Hartman"')
con.commit()
print("Updated li-hartman in DB")
