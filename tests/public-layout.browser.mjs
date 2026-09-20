/**
 * Read-only browser regression checks against an already-running local/preview site.
 * No login, content mutations, database access or production deployment.
 * Optional QA dependency: npm install --no-save --package-lock=false playwright
 * Usage: node tests/public-layout.browser.mjs http://localhost:3000 [chromium-path]
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({
  ...(process.argv[3] ? { executablePath: process.argv[3] } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors = [];
let checks = 0;

async function withinViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  assert.ok(box && box.width > 0 && box.height > 0, `${label}: visible`);
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label}: inside viewport ${JSON.stringify(box)}`);
}

async function layout(page, label) {
  const result = await page.evaluate(() => {
    const splitWords = [];
    for (const el of document.querySelectorAll('.dept-card :is(h2,h3), .faculty-profile-layout .aside-card h2, .faculty-profile-layout .aside-card > .link-arrow, .profile-card h3')) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        for (const match of node.textContent.matchAll(/[A-Za-z]{2,}/g)) {
          const range = document.createRange();
          range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
          if (range.getClientRects().length > 1) splitWords.push(match[0]);
        }
      }
    }
    const overflow = [...document.querySelectorAll('.dept-card, .profile-card, .faculty-profile-layout .aside-card')].filter(el => {
      const card = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect();
      return el.scrollWidth > el.clientWidth + 1 || card.left < parent.left - 1 || card.right > parent.right + 1;
    }).map(el => el.className);
    return { width: document.documentElement.scrollWidth, splitWords, overflow };
  });
  assert.ok(result.width <= page.viewportSize().width, `${label}: page overflow`);
  assert.deepEqual(result.splitWords, [], `${label}: mid-word heading/name splits`);
  assert.deepEqual(result.overflow, [], `${label}: overflowing cards`);
}

try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/departments', '/faculty', '/faculty/archana-awasthi']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      for (const enlarged of [false, true]) {
        const label = `${width}px ${route} ${enlarged ? '125%' : '100%'}`;
        await layout(page, label);
        const trigger = page.getByRole('button', { name: 'Open accessibility preferences', exact: true });
        await withinViewport(trigger, `${label} trigger`);
        if (route === '/departments') {
          const headings = await page.locator('.dept-card h2').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)));
          assert.ok(headings.every(size => size <= (enlarged ? 28 : 23)), `${label}: card typography is not section-sized`);
          assert.equal(await page.locator('a.dept-card').first().evaluate(el => getComputedStyle(el).textDecorationLine), 'none');
        }
        if (route.includes('/faculty/')) {
          const sidebar = await page.locator('.faculty-profile-layout > .info-aside').boundingBox();
          assert.ok(sidebar.width >= 288, `${label}: sensible sidebar width`);
          if (width === 768) {
            const main = await page.locator('.faculty-profile-layout > div').first().boundingBox();
            assert.ok(sidebar.y >= main.y + main.height, `${label}: sidebar stacks at tablet size`);
          }
        }
        await trigger.click();
        const panel = page.getByRole('region', { name: 'Accessibility preferences', exact: true });
        await withinViewport(panel, `${label} panel`);
        assert.equal(await panel.evaluate(el => el.parentElement === document.body), true, 'panel escapes filtered header');
        assert.equal(await panel.evaluate(el => getComputedStyle(el).position), 'fixed');
        await withinViewport(panel.getByRole('button', { name: 'Close accessibility preferences', exact: true }), 'close button');
        if (!enlarged) {
          for (let i = 0; i < 3; i++) await panel.getByRole('button', { name: 'Larger text', exact: true }).click();
          await panel.getByRole('button', { name: 'High contrast', exact: true }).click();
          await panel.getByRole('button', { name: 'Reduce motion', exact: true }).click();
          await withinViewport(panel, `${label} enlarged panel`);
          assert.equal(await page.locator('body').evaluate(el => el.classList.contains('high-contrast') && el.classList.contains('reduce-motion')), true);
        } else {
          await panel.getByRole('button', { name: 'Reset', exact: true }).click();
        }
        await page.keyboard.press('Escape');
        assert.equal(await panel.count(), 0);
        assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape restores trigger focus');
        checks++;
      }
      // Fixed position must remain within the viewport after the header sticks.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole('button', { name: 'Open accessibility preferences', exact: true }).click();
      await withinViewport(page.getByRole('region', { name: 'Accessibility preferences', exact: true }), `${width}px scrolled panel`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.scrollTo(0, 0));
      if (width <= 768) {
        await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
        const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
        await withinViewport(nav, `${width}px mobile navigation`);
        await nav.getByRole('link', { name: 'Departments', exact: true }).click();
        await page.waitForURL(base + '/departments');
        assert.equal(await page.getByRole('button', { name: 'Toggle navigation', exact: true }).getAttribute('aria-expanded'), 'false');
      } else {
        await withinViewport(page.getByRole('navigation', { name: 'Primary navigation', exact: true }), 'desktop navigation');
      }
    }
    // Small-height / landscape view: controls scroll inside the panel, not offscreen.
    await page.setViewportSize({ width, height: 360 });
    await page.getByRole('button', { name: 'Open accessibility preferences', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Accessibility preferences', exact: true });
    await withinViewport(panel, `${width}px short viewport panel`);
    await panel.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.keyboard.press('Escape');
    await context.close();
  }
  assert.deepEqual(errors, [], 'browser errors');
  console.log(`PASS: ${checks} route/viewport/text-scale checks; scrolled and short-viewport panels; navigation; accessibility controls and focus.`);
} finally { await browser.close(); }
