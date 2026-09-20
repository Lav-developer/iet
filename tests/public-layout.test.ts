import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Fast source guards complement the real viewport/word-wrap checks in
// public-layout.browser.mjs (run against a local server or review preview).
const css = readFileSync("app/globals.css", "utf8");

test("department card styles cover semantic h2 and h3 headings without changing global headings", () => {
  const card = css.match(/\.dept-card :is\(h2, h3\)\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(card, /font-size:\s*clamp\(/);
  assert.match(card, /line-height:\s*1\.25/);
  assert.match(card, /overflow-wrap:\s*normal/);
  assert.match(css, /a\.dept-card, a\.profile-card\s*\{\s*text-decoration:\s*none/);
  assert.match(css, /a\.dept-card:is\(:hover, :focus-visible\) \.link-arrow/);
});

test("ordinary card and sidebar words are not subjected to broad anywhere wrapping", () => {
  const shared = css.match(/\.data-card, \.profile-card, \.dept-card, \.info-aside\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(shared, /min-width:\s*0/);
  assert.doesNotMatch(shared, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  // Long email addresses retain their existing, intentionally scoped fallback.
  assert.match(css, /\.contact-line\s*\{[^}]*overflow-wrap:\s*anywhere/);
});

test("faculty sidebar uses a bounded grid and card-sized headings with an earlier stacking breakpoint", () => {
  const page = readFileSync("app/(public)/faculty/[slug]/page.tsx", "utf8");
  assert.match(page, /container detail-layout faculty-profile-layout/);
  assert.match(css, /\.faculty-profile-layout\s*\{[^}]*minmax\(0, 1fr\) minmax\(18rem, 21rem\)/);
  assert.match(css, /\.faculty-profile-layout \.aside-card h2\s*\{[^}]*font-size:\s*\.8rem/);
  assert.match(css, /@media \(max-width: 960px\)\s*\{\s*\.faculty-profile-layout\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("public accessibility panel escapes the filtered header and does not share admin positioning", () => {
  const widget = readFileSync("components/accessibility.tsx", "utf8");
  assert.match(widget, /open && createPortal\(/);
  assert.match(widget, /document\.body/);
  assert.match(widget, /className="public-accessibility-panel"/);
  const panel = css.match(/\.public-accessibility-panel\s*\{([^}]+)\}/)?.[1] || "";
  assert.match(panel, /position:\s*fixed/);
  assert.match(panel, /100dvh/);
  assert.match(panel, /100vw/);
  assert.match(panel, /overflow-y:\s*auto/);
  assert.match(panel, /z-index:\s*100/);
  assert.match(widget, /event\.key === "Escape"/);
  assert.match(widget, /triggerRef\.current\?\.focus\(\)/);
});
