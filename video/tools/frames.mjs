// Print each VO line's start frame and the composition length, mirroring src/timeline.ts.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/timeline.ts', import.meta.url), 'utf8');
const lead = parseFloat(src.match(/const LEAD = ([\d.]+)/)[1]);
const gaps = Object.fromEntries([...src.matchAll(/(L\d\d): ([\d.]+)/g)].map((m) => [m[1], parseFloat(m[2])]));
const vo = JSON.parse(fs.readFileSync(new URL('../src/data/vo.json', import.meta.url), 'utf8'));
let t = lead;
for (const l of vo.lines) {
  const s = Math.round(t * 30);
  console.log(l.id, s, `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`, 'cards', l.cards.map((c) => s + Math.round(c.start * 30)).join(','));
  t += l.duration + (gaps[l.id] ?? 0.5);
}
console.log('TOTAL', Math.round(t * 30), `${Math.floor(t / 60)}:${(t % 60).toFixed(1)}`);
