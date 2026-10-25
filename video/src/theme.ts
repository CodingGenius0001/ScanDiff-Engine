import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { Easing } from "remotion";

// Same tokens as web/app/globals.css: a black studio, light ink, one signal orange.
export const C = {
  paper: "#0b0b0b",
  paperDeep: "#161616",
  plate: "#1c1c1c",
  panel: "#111111",
  ink: "#ededeb",
  inkSoft: "#a2a29e",
  inkFaint: "#6c6c69",
  rule: "#2a2a29",
  stamp: "#ff6a1a",
  // The heat map's own scale (contract: diverging_blue_gray_red).
  dent: "#3b82f6",
  added: "#ef4444",
  unchanged: "#9a9a96",
};

const geist = loadGeist("normal", {
  weights: ["300", "400", "500", "600"],
  subsets: ["latin"],
});
const mono = loadGeistMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
});

export const FONT = geist.fontFamily;
export const MONO = mono.fontFamily;

// Video-first sizes for a 1920 x 1080 canvas.
export const SAFE_X = 120;
export const SAFE_Y = 90;

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
