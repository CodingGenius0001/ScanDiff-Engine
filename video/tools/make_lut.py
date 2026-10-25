"""Write a 3D LUT that turns iPhone HLG / BT.2020 footage into graded Rec.709 SDR.

This ffmpeg build has no zscale, so the conversion is done in a LUT applied
after swscale converts the BT.2020 YUV to RGB:
HLG inverse OETF -> HLG OOTF (1000 nit display) -> BT.2020 to BT.709 primaries
-> soft tone map with diffuse white (203 nit) at ~0.82 -> grade -> BT.709 gamma.

The grade is the film's shared look: a touch less saturation (the red counter
otherwise fights the orange accent) and slightly lifted blacks for the dark UI.

Usage: python video/tools/make_lut.py video/public/luts/hlg_to_709.cube
"""

import sys

import numpy as np

N = 33
A, B, C = 0.17883277, 0.28466892, 0.55991073
LW = 1000.0  # nominal peak luminance for the OOTF
GAMMA = 1.2  # HLG system gamma at 1000 nit
M2020_709 = np.array([
    [1.6605, -0.5876, -0.0728],
    [-0.1246, 1.1329, -0.0083],
    [-0.0182, -0.1006, 1.1187],
])
SAT = 0.88
BLACK_LIFT = 0.012


def hlg_inv_oetf(e):
    return np.where(e <= 0.5, (e**2) / 3.0, (np.exp((e - C) / A) + B) / 12.0)


def tone(x):
    # x: luminance relative to diffuse white (203 nit = 1.0). Extended Reinhard
    # with white point 4.9 (1000 nit), scaled so diffuse white lands at 0.82.
    w = LW / 203.0
    y = x * (1 + x / (w * w)) / (1 + x)
    ref = 1.0 * (1 + 1.0 / (w * w)) / 2.0
    return y * 0.82 / ref


def main(out):
    g = np.linspace(0, 1, N)
    # .cube order: red varies fastest
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")
    rgb = np.stack([r, gg, b], -1).reshape(-1, 3)
    scene = hlg_inv_oetf(rgb)
    ys = scene @ np.array([0.2627, 0.6780, 0.0593])
    disp = LW * np.power(np.maximum(ys, 1e-9), GAMMA - 1)[:, None] * scene  # nits, BT.2020
    lin709 = np.clip(disp @ M2020_709.T, 0, None) / 203.0
    lum = lin709 @ np.array([0.2126, 0.7152, 0.0722])
    mapped = tone(lum)
    scale = np.where(lum > 1e-9, mapped / np.maximum(lum, 1e-9), 0)[:, None]
    out709 = lin709 * scale
    # Grade in linear light: desaturate toward luminance, then lift blacks.
    l2 = (out709 @ np.array([0.2126, 0.7152, 0.0722]))[:, None]
    out709 = l2 + SAT * (out709 - l2)
    out709 = np.clip(out709, 0, 1)
    enc = np.where(out709 < 0.018, 4.5 * out709, 1.099 * np.power(out709, 0.45) - 0.099)
    enc = BLACK_LIFT + (1 - BLACK_LIFT) * enc
    with open(out, "w") as f:
        f.write("TITLE \"ScanDiff HLG to Rec.709\"\nLUT_3D_SIZE %d\n" % N)
        for v in np.clip(enc, 0, 1):
            f.write("%.6f %.6f %.6f\n" % tuple(v))


if __name__ == "__main__":
    main(sys.argv[1])
