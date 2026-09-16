#!/usr/bin/env python3
"""Genera los iconos PNG de la app (corazon sobre degradado) sin dependencias externas."""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "icons")

def lerp(a, b, t):
    return a + (b - a) * t

def heart_inside(x, y):
    """Ecuacion implicita del corazon en coordenadas normalizadas [-1.4, 1.4]."""
    v = (x * x + y * y - 1.0)
    return v * v * v - x * x * y * y * y <= 0.0

def render(size, pad_ratio, rounded, bg_a, bg_b, fg):
    ss = 3  # supersampling
    w = size
    rows = []
    r_corner = size * 0.24 if rounded else 0.0
    scale = 1.0 / (size * (1.0 - 2 * pad_ratio) / 2.0 / 1.22)
    cx, cy = size / 2.0, size / 2.0 * 1.06
    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(ss):
                for sx in range(ss):
                    fx = px + (sx + 0.5) / ss
                    fy = py + (sy + 0.5) / ss
                    # fondo degradado diagonal
                    t = max(0.0, min(1.0, (fx / w * 0.65 + fy / w * 0.35)))
                    cr = lerp(bg_a[0], bg_b[0], t)
                    cg = lerp(bg_a[1], bg_b[1], t)
                    cb = lerp(bg_a[2], bg_b[2], t)
                    ca = 255.0
                    if rounded:
                        # esquinas redondeadas
                        dx = max(r_corner - fx, fx - (w - r_corner), 0.0)
                        dy = max(r_corner - fy, fy - (w - r_corner), 0.0)
                        if math.hypot(dx, dy) > r_corner:
                            ca = 0.0
                    # corazon
                    hx = (fx - cx) * scale
                    hy = -(fy - cy) * scale
                    if ca > 0 and heart_inside(hx, hy):
                        cr, cg, cb = fg
                    acc[0] += cr; acc[1] += cg; acc[2] += cb; acc[3] += ca
            n = ss * ss
            row += bytes((int(acc[0] / n), int(acc[1] / n), int(acc[2] / n), int(acc[3] / n)))
        rows.append(row)
    raw = b"".join(b"\x00" + bytes(r) for r in rows)
    return png_bytes(size, size, raw)

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def png_bytes(w, h, raw):
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))

ROSE_A = (255, 138, 160)
ROSE_B = (176, 20, 66)
CREAM = (255, 244, 246)

def write(name, data):
    path = os.path.join(OUT, name)
    with open(path, "wb") as f:
        f.write(data)
    print(f"{name}: {len(data)} bytes")

os.makedirs(OUT, exist_ok=True)
write("icon-192.png", render(192, 0.16, True, ROSE_A, ROSE_B, CREAM))
write("icon-512.png", render(512, 0.16, True, ROSE_A, ROSE_B, CREAM))
# maskable: mas margen para que el recorte circular no corte el corazon
write("maskable-512.png", render(512, 0.26, False, ROSE_A, ROSE_B, CREAM))
write("apple-touch-icon.png", render(180, 0.16, False, ROSE_A, ROSE_B, CREAM))
write("favicon-64.png", render(64, 0.10, True, ROSE_A, ROSE_B, CREAM))
