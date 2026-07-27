"""Crop LookPick logo from brand hero source for header use."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "lookpick-source.png"
OUTPUT = ROOT / "public" / "images" / "lookpick-header-logo.png"


def is_background(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    lum = (r + g + b) / 3
    # Black band and soft gradient around the logo.
    if lum < 28:
        return True
    if lum < 55 and max(r, g, b) - min(r, g, b) < 18:
        return True
    return False


def trim_content_box(image: Image.Image) -> Image.Image:
    px = image.load()
    w, h = image.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 12:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x <= min_x or max_y <= min_y:
        return image
    pad = 8
    return image.crop(
        (
            max(0, min_x - pad),
            max(0, min_y - pad),
            min(w, max_x + pad + 1),
            min(h, max_y + pad + 1),
        )
    )


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    px = source.load()
    w, h = source.size

    # Focus on icon + wordmark; exclude tagline below ~y=520.
    min_x, min_y, max_x, max_y = w, 520, 0, 320
    for y in range(320, 521):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a):
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

    pad_x, pad_y = 16, 12
    crop = source.crop(
        (
            max(0, min_x - pad_x),
            max(0, min_y - pad_y),
            min(w, max_x + pad_x + 1),
            min(h, max_y + pad_y + 1),
        )
    )

    # Transparent background works on the white header; dark grey logo stays visible.
    cropped_px = crop.load()
    cw, ch = crop.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = cropped_px[x, y]
            if is_background(r, g, b, a):
                cropped_px[x, y] = (255, 255, 255, 0)
            else:
                cropped_px[x, y] = (r, g, b, 255)

    crop = trim_content_box(crop)

    # Scale to a practical header asset width while keeping aspect ratio.
    target_height = 72  # 2x for retina; displayed at 36px in CSS
    scale = target_height / crop.height
    target_width = max(1, round(crop.width * scale))
    crop = crop.resize((target_width, target_height), Image.Resampling.LANCZOS)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    crop.save(OUTPUT, format="PNG", optimize=True)
    print(f"Saved {OUTPUT} ({crop.width}x{crop.height})")


if __name__ == "__main__":
    main()
