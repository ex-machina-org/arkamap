"""Optional pixel evidence; install Pillow separately and run browser QA first."""
import json
from pathlib import Path
from PIL import Image, ImageChops

results = {}
for theme in ("light", "dark"):
    source = Image.open(f".runtime/visual/shell-5175-{theme}.png").convert("RGB")
    target = Image.open(f".runtime/visual/shell-5174-{theme}.png").convert("RGB")
    difference = ImageChops.difference(source, target)
    count = sum(any(pixel) for pixel in difference.getdata())
    results[theme] = {"size": source.size, "changed_pixels": count,
                      "changed_percent": round(count / (source.width * source.height) * 100, 5),
                      "bbox": difference.getbbox()}
    difference.save(f".runtime/visual/shell-diff-{theme}.png")
Path(".runtime/visual/comparison.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results))
