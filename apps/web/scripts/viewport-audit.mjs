import { chromium } from 'playwright';

/**
 * Measures a page at the three viewports the product commits to.
 *
 * Written because two responsive passes done by reading code missed a real
 * defect that a browser found in seconds: at 375px the assessment screen was
 * 495px wide. Reading CSS tells you what a rule says; only layout tells you
 * what it does.
 *
 *   node scripts/viewport-audit.mjs http://localhost:3000/some-route
 *
 * Two things are checked, both objective:
 *
 * - **Horizontal overflow.** `scrollWidth > clientWidth` is the page scrolling
 *   sideways, which is the single worst responsive defect on a phone.
 * - **Touch targets under 44px**, below `lg` only. At `lg` the controls fall
 *   back to the design system default on purpose (see `components/common/touch.ts`),
 *   so flagging them there would be noise.
 *
 * It opens a mobile menu if it finds one — a control inside a closed panel is
 * not in the layout and would otherwise be measured as absent rather than small.
 */
const url = process.argv[2] ?? 'http://localhost:3000/';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'desktop', width: 1280, height: 900, touch: false },
];

const browser = await chromium.launch();
let failures = 0;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  await page.goto(url, { waitUntil: 'networkidle' });

  const menu = page.getByRole('button', { name: /Menü/ });
  if (await menu.isVisible().catch(() => false)) await menu.click();

  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('button, a, input, select, textarea')]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0 && box.height < 44)
      .map(({ el, box }) => {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim();
        return `${String(Math.round(box.height))}px  ${name.slice(0, 40)}`;
      });

    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, small };
  });

  const overflow = result.scrollWidth > result.clientWidth + 1;
  console.log(`\n${vp.name} (${String(vp.width)}px)`);
  console.log(
    `  Breite ${String(result.scrollWidth)}/${String(result.clientWidth)} — horizontales Scrollen: ${overflow ? 'JA' : 'nein'}`,
  );
  if (overflow) failures += 1;

  if (vp.touch) {
    console.log(`  Bedienelemente unter 44px: ${String(result.small.length)}`);
    for (const entry of result.small) console.log(`    ${entry}`);
    failures += result.small.length;
  }

  await page.close();
}

await browser.close();
process.exit(failures === 0 ? 0 : 1);
