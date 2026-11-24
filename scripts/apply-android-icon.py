from pathlib import Path
import io
import cairosvg
from PIL import Image

root = Path("android/app/src/main/res")
svg = Path("public/icon.svg").read_bytes()
sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in sizes.items():
    out = root / folder
    out.mkdir(parents=True, exist_ok=True)
    png = cairosvg.svg2png(bytestring=svg, output_width=size, output_height=size)
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    image.save(out / "ic_launcher.png", optimize=True)
    image.save(out / "ic_launcher_round.png", optimize=True)

# Prefer the branded density-specific icons over the template's generic adaptive icon.
adaptive = root / "mipmap-anydpi-v26"
if adaptive.exists():
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        target = adaptive / name
        if target.exists():
            target.unlink()
print("Applied VoiceCast AI launcher icons.")
