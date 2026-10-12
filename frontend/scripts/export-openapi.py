import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "backend"))
from app.main import app

document = app.openapi()
out = root / "docs/backend/openapi.json"
text = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
if "--check" in sys.argv:
    if out.read_text(encoding="utf-8") != text:
        raise SystemExit("OpenAPI drift: run npm run api:generate")
else:
    out.write_text(text, encoding="utf-8")
    print("Exported backend OpenAPI")
