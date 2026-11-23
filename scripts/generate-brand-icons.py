import os
import sys

from PIL import Image, ImageDraw, ImageFilter

# Windows consoles default to a legacy code page (cp1252) that cannot encode the
# non-ASCII workspace path, which used to crash this script before the .ico was
# written. Force UTF-8 output so the generator always completes.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

def create_ryox_icon(size=512):
    # Create base RGBA canvas
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Padding
    pad = int(size * 0.08)
    radius = int(size * 0.22)

    # 1. Outer Neon Glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle([pad - 8, pad - 8, size - pad + 8, size - pad + 8], radius=radius + 8, fill=(0, 229, 255, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(size * 0.04)))
    img.alpha_composite(glow)

    # 2. Main Obsidian Shield
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=(5, 7, 13, 255), outline=(0, 229, 255, 220), width=int(size * 0.025))

    # 3. Inner Cyber Gradient Lines
    inner_pad = pad + int(size * 0.06)
    draw.rounded_rectangle([inner_pad, inner_pad, size - inner_pad, size - inner_pad], radius=radius - int(size * 0.05), outline=(139, 92, 246, 140), width=int(size * 0.012))

    # 4. Stylized 'R' Emblem
    scale = size / 100.0
    # Coordinates scaled from vector:
    # Stem: (26, 22) to (38, 78)
    # Loop: (38, 22) to (68, 50)
    # Diagonal leg: (48, 48) to (74, 78)

    c_stem = (0, 229, 255, 255)
    c_leg = (168, 85, 247, 255)

    # Vertical Stem
    draw.rounded_rectangle([int(27 * scale), int(22 * scale), int(39 * scale), int(78 * scale)], radius=int(3 * scale), fill=c_stem)

    # Top horizontal bar
    draw.rounded_rectangle([int(38 * scale), int(22 * scale), int(60 * scale), int(34 * scale)], radius=int(2 * scale), fill=c_stem)
    # Right curve of loop
    draw.arc([int(44 * scale), int(22 * scale), int(72 * scale), int(50 * scale)], start=270, end=90, fill=c_stem, width=int(12 * scale))
    # Middle horizontal bar
    draw.rounded_rectangle([int(38 * scale), int(38 * scale), int(58 * scale), int(50 * scale)], radius=int(2 * scale), fill=c_stem)

    # Diagonal dynamic leg
    draw.line([int(46 * scale), int(48 * scale), int(73 * scale), int(78 * scale)], fill=c_leg, width=int(12 * scale))

    # Neon circuit node circles
    draw.ellipse([int(68 * scale), int(33 * scale), int(74 * scale), int(39 * scale)], fill=(0, 255, 204, 255))
    draw.ellipse([int(71 * scale), int(75 * scale), int(77 * scale), int(81 * scale)], fill=(255, 0, 128, 255))

    return img

def main():
    build_dir = os.path.join(os.path.dirname(__file__), "..", "build")
    os.makedirs(build_dir, exist_ok=True)

    icon_512 = create_ryox_icon(512)
    png_path = os.path.join(build_dir, "icon.png")
    icon_512.save(png_path, format="PNG")
    print(f"Generated {png_path}")

    # Generate multi-size .ico file
    ico_path = os.path.join(build_dir, "icon.ico")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    icon_512.save(ico_path, format="ICO", sizes=sizes)
    print(f"Generated {ico_path} with sizes {sizes}")

if __name__ == "__main__":
    main()
