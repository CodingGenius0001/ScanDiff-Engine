import vo from "./data/vo.json";

export const FPS = 30;

export type Card = { text: string; start: number; end: number };
export type Word = { text: string; start: number; end: number };
export type Line = {
  id: string;
  speaker: "Adithya" | "Koushik";
  src: string;
  duration: number;
  words: Word[];
  cards: Card[];
};

export const LINES = vo.lines as Line[];

// Silence before the first line, and after each line before the next one (s).
// Longer gaps mark a change of speaker or act; the logo and the end card get holds.
const LEAD = 0.7;
const GAP_AFTER: Record<string, number> = {
  L01: 0.6,
  L02: 1.0,
  L03: 0.45,
  L04: 0.9,
  L05: 0.4,
  L06: 0.5,
  L07: 0.5,
  L08: 0.6,
  L09: 0.9,
  L10: 0.5,
  L11: 0.5,
  L12: 0.4,
  L13: 0.45,
  L14: 0.9,
  L15: 0.3,
  L16: 0.6,
  L17: 1.0,
  L18: 0.9,
  L19: 0.8,
  L20: 0.7,
  L21: 0.55,
  L22: 4.2,
};

const starts: Record<string, number> = {};
let t = LEAD;
for (const l of LINES) {
  starts[l.id] = Math.round(t * FPS);
  t += l.duration + (GAP_AFTER[l.id] ?? 0.5);
}
export const TOTAL_FRAMES = Math.round(t * FPS);

export const line = (id: string): Line => {
  const l = LINES.find((x) => x.id === id);
  if (!l) throw new Error(`No VO line ${id}`);
  return l;
};

/** First frame of a VO line. */
export const at = (id: string) => starts[id];
/** Last frame (exclusive) of a VO line's audio. */
export const endOf = (id: string) =>
  starts[id] + Math.round(line(id).duration * FPS);
/** Frame where caption card `i` of a line starts (the phrase it holds is spoken). */
export const cue = (id: string, i: number) =>
  starts[id] + Math.round(line(id).cards[i].start * FPS);
// How whisper spelled the proper nouns (see video/tools/captions.py).
const ALIASES: Record<string, string[]> = {
  scandiff: ["scandiff", "scandif", "scandish", "skandiff", "scandeaf", "scan"],
  supabase: ["supabase", "superbase"],
  nessie: ["nessie", "nestle", "nasty"],
};

/** Frame where the first word starting with `text` (after `afterS` seconds) is spoken. */
export const word = (id: string, text: string, afterS = 0) => {
  const forms = ALIASES[text.toLowerCase()] ?? [text.toLowerCase()];
  const w = line(id).words.find(
    (x) =>
      x.start >= afterS &&
      forms.some((f) =>
        x.text
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .startsWith(f),
      ),
  );
  if (!w) throw new Error(`No word "${text}" in ${id}`);
  return starts[id] + Math.round(w.start * FPS);
};
