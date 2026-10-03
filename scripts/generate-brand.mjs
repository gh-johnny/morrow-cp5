import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const source = await readFile('assets/brand/kite.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await mkdir('assets/brand', { recursive: true });
for (const [file, background, size, monochrome] of [
  ['icon.png', '#111714', 1024, false], ['adaptive.png', 'transparent', 1024, false],
  ['favicon.png', '#111714', 96, false], ['splash.png', 'transparent', 512, false], ['notification.png', 'transparent', 96, true],
]) {
  const svg = monochrome ? source.replaceAll('#DBF581', '#FFFFFF').replaceAll('#A8CBC2', '#FFFFFF').replaceAll('#17200F', '#000000').replaceAll('#F1F3E8', '#FFFFFF') : source;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:${background}}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  await page.locator('svg').screenshot({ path: `assets/brand/${file}`, omitBackground: background === 'transparent' });
}
await browser.close();
console.log('Morrow brand assets rendered from the original Kite SVG.');
