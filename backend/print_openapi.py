from app.main import app

schema = app.openapi()
print("=== LIVE OPENAPI ENDPOINTS ===")
for path, methods in sorted(schema["paths"].items()):
    for method in methods:
        print(f"{method.upper():<6} {path}")
