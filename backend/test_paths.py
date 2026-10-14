"""A trailing slash is served, not redirected: a redirect carries this API's own
absolute URL, which a proxy in front would hand to the browser.

    python test_paths.py      # no database needed
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, base_url="https://api.example.test")

slash = client.get("/api/agent/tools/", follow_redirects=False)
plain = client.get("/api/agent/tools")
assert slash.status_code == 200, slash.status_code
assert "location" not in slash.headers
assert slash.json() == plain.json()
assert client.get("/", follow_redirects=False).status_code == 200
print("ok")
