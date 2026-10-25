// Render a list of frames of ScanDiffDemo as JPEG stills, bundling once.
// Usage: node tools/stills.mjs out/stills 120,640,900 [scale]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Playwright's Chrome for Testing; Remotion's own download keeps stalling on this network.
const browserExecutable = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const [outDir, list, scaleArg] = process.argv.slice(2);
const frames = list.split(',').map(Number);
const scale = Number(scaleArg ?? 0.5);
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts'), publicDir: path.resolve('public')});
const composition = await selectComposition({serveUrl, id: 'ScanDiffDemo', browserExecutable});
for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(5, '0')}.jpg`);
  await renderStill({serveUrl, composition, frame, output, imageFormat: 'jpeg', jpegQuality: 85, scale, browserExecutable});
  console.log('rendered', frame);
}
