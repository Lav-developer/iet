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
    // UI chrome must not render browser underlines; focus rings are CSS-only and
    // are asserted separately by the accessibility checks below.
    const underlined = [...document.querySelectorAll(
      '.main-nav a, .mobile-nav a, .breadcrumbs a, .site-footer a, a.data-card, a.route-card, a.dept-card, a.profile-card, a.tag, .contact-line a, .notice-card h3 a, .department-social a, .data-card a, .aside-card a, .aside-item a, .info-aside a, .ecosystem-panel a, .home-notice-list a',
    )].filter(el => el.getClientRects().length && getComputedStyle(el).textDecorationLine.includes('underline')).map(el => `${el.className || el.tagName}:${el.textContent.slice(0, 30)}`);
    const focusOutline = getComputedStyle(document.documentElement).getPropertyValue('--lime').trim();
    return { width: document.documentElement.scrollWidth, splitWords, overflow, underlined, focusOutline };
  });
  assert.ok(result.width <= page.viewportSize().width, `${label}: page overflow`);
  assert.deepEqual(result.splitWords, [], `${label}: mid-word heading/name splits`);
  assert.deepEqual(result.overflow, [], `${label}: overflowing cards`);
  assert.deepEqual(result.underlined, [], `${label}: UI links render an underline`);
  assert.notEqual(result.focusOutline, '', `${label}: accessibility focus tokens are present`);
}

// A published profile must keep its information hierarchy: no CMS language,
// no empty optional sections, and academic details rendered when available.
async function structure(page, route, label, { requireAcademic = false, requireDepartment = false } = {}) {
  const result = await page.evaluate(() => {
    const sections = [...document.querySelectorAll('.faculty-profile-layout .detail-section')];
    return {
      text: document.body.innerText,
      cms: /Edit in CMS|Verified source record|Content provenance|Confirm before official public launch|Administrators can|source marker|record status/i.test(document.body.innerText),
      adminLinks: document.querySelectorAll('a[href^="/admin"]').length,
      identityNames: document.querySelectorAll('.faculty-identity h2').length,
      emptySections: sections.filter(section => !section.querySelector('p, li, dd, a, article') || !section.innerText.replace(section.querySelector('h2')?.innerText || '', '').trim()).map(section => section.id),
      academic: [...document.querySelectorAll('#academic-details dd')].map(el => el.innerText.trim()).filter(Boolean),
      backLink: Boolean(document.querySelector('.faculty-back-link[href="/faculty"]')),
      hasSidebar: Boolean(document.querySelector('.faculty-profile-layout > .info-aside')),
    };
  });
  assert.equal(result.identityNames, 1, `${label}: one profile identity heading`);
  assert.deepEqual(result.emptySections, [], `${label}: empty sections rendered`);
  assert.equal(result.cms, false, `${label}: internal/CMS language present`);
  assert.equal(result.adminLinks, 0, `${label}: admin links present`);
  assert.equal(result.backLink, true, `${label}: back to faculty link`);
  assert.ok(result.text.trim().length > 120, `${label}: profile is not sparse`);
  if (requireAcademic) assert.ok(result.academic.length >= 2, `${label}: published academic details rendered`);
  if (requireDepartment) assert.ok(result.text.includes('Department of'), `${label}: department name rendered`);
  return result;
}

try {
  for (const width of [1440, 768, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/departments', '/notices', '/about', '/contact', '/faculty', '/faculty/archana-awasthi']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      for (const enlarged of [false, true]) {
        const label = `${width}px ${route} ${enlarged ? '125%' : '100%'}`;
        await layout(page, label);
        const trigger = page.getByRole('button', { name: 'Open accessibility preferences', exact: true });
        await withinViewport(trigger, `${label} trigger`);
        if (route === '/notices') {
          const board = await page.evaluate(() => ({
            cards: document.querySelectorAll('.notice-card').length,
            empty: Boolean(document.querySelector('.empty-state')),
            heading: document.querySelector('.page-hero h1')?.textContent || '',
          }));
          assert.equal(board.heading, 'Notices', `${label}: notice board heading`);
          assert.ok(board.cards > 0 || board.empty, `${label}: notice board shows notices or an empty state`);
        }
        if (route === '/departments') {
          const headings = await page.locator('.dept-card h2').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).fontSize)));
          assert.ok(headings.every(size => size <= (enlarged ? 28 : 23)), `${label}: card typography is not section-sized`);
          assert.equal(await page.locator('a.dept-card').first().evaluate(el => getComputedStyle(el).textDecorationLine), 'none');
        }
        if (route.includes('/faculty/')) {
          await structure(page, route, label, { requireAcademic: true, requireDepartment: true });
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
    // Department profiles: the channel section is absent unless configured, and
    // a card CTA still underlines on hover.
    const departmentResponse = await page.goto(base + '/departments/mechanical-engineering', { waitUntil: 'networkidle' });
    assert.equal(departmentResponse.status(), 200, 'department profile');
    await layout(page, `${width}px /departments/mechanical-engineering`);
    assert.equal(await page.locator('#channels, .department-social').count(), 0, `${width}px: a department without configured channels renders no section`);

    // When a department does have configured channels they must be safe,
    // accessible external links that stay inside the viewport.
    await page.goto(base + '/departments/civil-engineering', { waitUntil: 'networkidle' });
    await layout(page, `${width}px /departments/civil-engineering`);
    const channels = page.locator('.department-social a');
    const channelCount = await channels.count();
    if (channelCount > 0) {
      for (let index = 0; index < channelCount; index++) {
        const link = channels.nth(index);
        await link.scrollIntoViewIfNeeded();
        await withinViewport(link, `${width}px department channel ${index}`);
        const attributes = await link.evaluate((element) => ({ href: element.getAttribute('href'), target: element.getAttribute('target'), rel: element.getAttribute('rel'), label: element.getAttribute('aria-label') }));
        assert.match(attributes.href, /^https?:\/\//, `${width}px: channel URL is absolute`);
        assert.equal(attributes.target, '_blank', `${width}px: channel opens in a new tab`);
        assert.match(attributes.rel, /noopener/, `${width}px: channel rel is safe`);
        assert.ok(attributes.label && attributes.label.length > 5, `${width}px: channel has an accessible label`);
      }
      assert.equal(await page.locator('#channels').count(), 1, `${width}px: channel section renders once`);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const card = page.locator('a.data-card').first();
    if (await card.count()) {
      const before = await card.evaluate(el => getComputedStyle(el).borderColor);
      await card.hover();
      await page.waitForTimeout(120);
      const after = await card.evaluate(el => ({ border: getComputedStyle(el).borderColor, cta: getComputedStyle(el.querySelector('.link-arrow') || el).textDecorationLine }));
      assert.notEqual(after.border, before, `${width}px: card hover cue is visible`);
    }
    // Keyboard focus stays visible on de-underlined links.
    await page.keyboard.press('Tab');
    const focusedOutline = await page.evaluate(() => { const el = document.activeElement; return el ? getComputedStyle(el).outlineStyle : 'none'; });
    assert.notEqual(focusedOutline, 'none', `${width}px: keyboard focus outline is preserved`);

    // Other profile shapes: leadership with interests and no department, and laboratory staff.
    for (const [route, expected] of [['/faculty/chandra-kumar-dixit', 'Research interests'], ['/faculty/aman-kumar-yadav', 'Role type']]) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      await layout(page, `${width}px ${route}`);
      const result = await structure(page, route, `${width}px ${route}`, { requireAcademic: true, requireDepartment: route !== '/faculty/chandra-kumar-dixit' });
      assert.ok(result.text.toLowerCase().includes(expected.toLowerCase()), `${width}px ${route}: missing ${expected}`);
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
  console.log(`PASS: ${checks} route/viewport/text-scale checks; faculty profile structure on 5 profiles; scrolled and short-viewport panels; navigation; accessibility controls and focus.`);
} finally { await browser.close(); }
