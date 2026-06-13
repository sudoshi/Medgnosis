// =============================================================================
// Medgnosis Web — light/dark visual-check harness
// Usage: build + `npx vite preview --port 4180 --strictPort`, then
//   node scripts/ui-shot.mjs [route]   (default route: /shadcn-spike)
// Writes /tmp/ui-<route>-{dark,light}.png
// =============================================================================
import { chromium } from '@playwright/test';

const ROUTE = process.argv[2] ?? '/shadcn-spike';
const BASE = `http://localhost:4180${ROUTE}`;
const browser = await chromium.launch();

for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((t) => {
    localStorage.setItem('mg_theme', t);
    localStorage.setItem('mg_palette', 'clinical-teal');
  }, theme);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const slug = ROUTE.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
  await page.screenshot({ path: `/tmp/ui-${slug}-${theme}.png`, fullPage: true });
  await ctx.close();
  console.log(`captured ${theme} ${ROUTE}`);
}

await browser.close();
console.log('done');
