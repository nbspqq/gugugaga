# 生成托盘图标 assets/tray.png（32x32 企鹅连体衣小头像），避免仓库里出现来路不明的二进制文件。
import os
import struct
import zlib

SIZE = 32
HOOD = (54, 59, 71, 255)
HOOD_DARK = (38, 42, 52, 255)
BEAK = (255, 194, 60, 255)
BEAK_DARK = (226, 154, 21, 255)
BELLY = (253, 253, 255, 255)
PUPIL = (43, 37, 48, 255)
CLEAR = (0, 0, 0, 0)


def blend(dst, src):
    a = src[3] / 255
    return tuple(round(dst[i] * (1 - a) + src[i] * a) for i in range(3)) + (255,)


class Canvas:
    def __init__(self, size):
        self.size = size
        self.px = [[CLEAR] * size for _ in range(size)]

    def put(self, x, y, color):
        if 0 <= x < self.size and 0 <= y < self.size:
            self.px[y][x] = color

    def blend(self, x, y, color):
        if 0 <= x < self.size and 0 <= y < self.size:
            self.px[y][x] = blend(self.px[y][x], color)

    def ellipse(self, cx, cy, rx, ry, color):
        for y in range(self.size):
            for x in range(self.size):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                    self.put(x, y, color)

    def triangle(self, p1, p2, p3, color):
        xs = [p1[0], p2[0], p3[0]]
        ys = [p1[1], p2[1], p3[1]]
        for y in range(min(ys), max(ys) + 1):
            for x in range(min(xs), max(xs) + 1):
                if self._inside(x + 0.5, y + 0.5, p1, p2, p3):
                    self.put(x, y, color)

    @staticmethod
    def _inside(x, y, p1, p2, p3):
        def sign(a, b, c):
            return (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1])

        d1 = sign((x, y), p1, p2)
        d2 = sign((x, y), p2, p3)
        d3 = sign((x, y), p3, p1)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

    def to_png(self):
        raw = b"".join(
            b"\x00" + b"".join(bytes(self.px[y][x]) for x in range(self.size))
            for y in range(self.size)
        )
        return (
            b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", self.size, self.size, 8, 6, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(raw, 9))
            + _chunk(b"IEND", b"")
        )


def _chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def main():
    c = Canvas(SIZE)

    # 身体（连体衣）
    c.ellipse(16, 22, 11, 9.5, HOOD)
    c.ellipse(16, 24, 6.5, 6.5, BELLY)

    # 头套
    c.ellipse(16, 12, 11, 10, HOOD)
    for y in range(SIZE):
        for x in range(SIZE):
            d = (x - 16) ** 2 + (y - 12) ** 2
            if 9 ** 2 < d <= 10 ** 2:
                c.blend(x, y, (255, 255, 255, 45))

    # 喙
    c.triangle((11, 14), (21, 14), (16, 22), BEAK)
    c.triangle((13, 15), (19, 15), (16, 19), BEAK_DARK)

    # 企鹅的眼睛
    c.ellipse(10.5, 8.5, 2.4, 2.6, (255, 255, 255, 255))
    c.ellipse(21.5, 8.5, 2.4, 2.6, (255, 255, 255, 255))
    c.put(11, 8, PUPIL)
    c.put(21, 8, PUPIL)

    out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "tray.png"
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(c.to_png())
    print("wrote", out)


if __name__ == "__main__":
    main()
