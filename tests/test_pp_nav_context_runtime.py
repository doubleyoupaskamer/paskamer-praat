"""Read script content for browser injection test."""
from pathlib import Path

p = Path("/app/pwa/extensions/profile/pp-nav-context-v1.js")
print(f"size={p.stat().st_size}")
print(f"head={p.read_text()[:80]!r}")
