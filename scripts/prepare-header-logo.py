"""Prepare LookPick header logo: LP icon + LookPick only, white background."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts" / "lookpick-header-source.png"
OUTPUT = ROOT / "public" / "images" / "lookpick-header-logo.png"

CANVAS_WIDTH = 420
CANVAS_HEIGHT = 96
PAD_X = 8
PAD_Y = 10
WORDMARK_MAX_Y = 112


def is_background(r: int, g: int, b: int, a: int) -> bool:
    if a < 8:
        return True
    return r > 248 and g > 248 and b > 248


def is_left_divider(x: int, y: int, r: int, g: int, b: int, a: int) -> bool:
    return x <= 1 and a > 8 and r < 40 and g < 40 and b < 40


def content_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    px = image.load()
    w, _ = image.size
    min_x, min_y, max_x, max_y = w, WORDMARK_MAX_Y, 0, 0

    for y in range(0, WORDMARK_MAX_Y + 1):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a) or is_left_divider(x, y, r, g, b, a):
                continue
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

    return min_x, min_y, max_x, max_y


def composite_on_white(image: Image.Image) -> Image.Image:
    base = Image.new("RGBA", image.size, (255, 255, 255, 255))
    return Image.alpha_composite(base, image.convert("RGBA")).convert("RGB")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    min_x, min_y, max_x, max_y = content_bounds(source)

    crop = source.crop(
        (
            max(0, min_x - 4),
            max(0, min_y - 4),
            min(source.width, max_x + 5),
            min(source.height, max_y + 5),
        )
    )

    rgba = crop.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_background(r, g, b, a):
                px[x, y] = (255, 255, 255, 0)
            else:
                px[x, y] = (r, g, b, 255)

    max_w = CANVAS_WIDTH - PAD_X * 2
    max_h = CANVAS_HEIGHT - PAD_Y * 2
    scale = min(max_w / rgba.width, max_h / rgba.height)
    target_w = max(1, round(rgba.width * scale))
    target_h = max(1, round(rgba.height * scale))
    resized = rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (255, 255, 255, 255))
    offset_x = PAD_X
    offset_y = (CANVAS_HEIGHT - target_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)

    final = composite_on_white(canvas)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUTPUT, format="PNG", optimize=True)
    print(
        f"Saved {OUTPUT} ({CANVAS_WIDTH}x{CANVAS_HEIGHT}) "
        f"from crop {crop.width}x{crop.height} -> {target_w}x{target_h}"
    )


if __name__ == "__main__":
    main()
