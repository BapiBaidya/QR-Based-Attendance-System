from app.main import app
from starlette.routing import Route, Mount

def get_routes(routes, prefix=""):
    result = []
    for r in routes:
        if isinstance(r, Route):
            for m in r.methods:
                result.append(f"{m:<6} {prefix + r.path}")
        elif isinstance(r, Mount):
            result.extend(get_routes(r.routes, prefix=prefix + r.path))
        elif hasattr(r, "routes"):
            result.extend(get_routes(r.routes, prefix=prefix))
        elif hasattr(r, "path"):
            result.append(f"ANY    {prefix + r.path}")
    return result

print("=== ALL REGISTERED FASTAPI ENDPOINTS ===")
for line in sorted(get_routes(app.routes)):
    print(line)
