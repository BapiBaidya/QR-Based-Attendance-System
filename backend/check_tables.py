import psycopg2

conn = psycopg2.connect(
    dbname="attendance_db",
    user="postgres",
    password="123",
    host="localhost",
    port=5432
)
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
tables = [row[0] for row in cur.fetchall()]
print("Tables created in PostgreSQL:")
for t in tables:
    print(f" - {t}")
cur.close()
conn.close()
