import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

conn = psycopg2.connect(
    dbname="postgres",
    user="postgres",
    password="123",
    host="localhost",
    port=5432
)
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
cur = conn.cursor()

# Check if database already exists
cur.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = 'attendance_db'")
exists = cur.fetchone()
if not exists:
    cur.execute("CREATE DATABASE attendance_db")
    print("Database attendance_db created successfully!")
else:
    print("Database attendance_db already exists!")

cur.close()
conn.close()
