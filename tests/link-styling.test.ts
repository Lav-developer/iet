import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Link-affordance policy: UI chrome (navigation, cards, chips, breadcrumbs,
// CTAs) must not render a browser underline, while inline links inside
// long-form copy keep theirs. Focus outlines must survive both.
const css = readFileSync("app/globals.css", "utf8");

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] || "";
}

const uiLinks = [
  ".main-nav a", ".mobile-nav a", ".breadcrumbs a", ".site-footer a", ".admin-nav a",
  "a.link-arrow", "a.button", "a.icon-button", "a.tag", ".contact-line",
  ".ecosystem-link", ".search-result", "a.data-card", "a.route-card",
  "a.dept-card", "a.profile-card", ".faculty-academic-details a",
  ".faculty-related-link", ".research-map a", ".notice-card h3 a",
];

test("every public UI link group explicitly removes the default underline", () => {
  const reset = css.slice(css.indexOf("UI chrome links"), css.indexOf("Clear hover/focus affordance"));
  assert.ok(reset.length > 0, "the UI-link block is present");
  for (const selector of uiLinks) assert.ok(reset.includes(selector), `${selector} is in the UI-link reset group`);
  const declarations = reset.split("}")[0];
  assert.match(declarations, /text-decoration:\s*none/, "the group sets text-decoration: none");
});

test("the underline removal is scoped, never a blanket anchor reset", () => {
  // A bare `a { text-decoration: none }` would also strip inline prose links.
  assert.doesNotMatch(css, /(^|[},]\s*)a\s*\{[^}]*text-decoration:\s*none/);
  const base = ruleBody("a");
  assert.doesNotMatch(base, /text-decoration:\s*none/);
  // Inline links in paragraphs therefore keep the browser default underline.
  assert.match(css, /a \{ color: inherit; text-decoration-thickness/);
});

test("anchors nested inside cards, asides and other UI containers are reset too", () => {
  const containers = [".data-card a", ".aside-card a", ".aside-item a", ".info-aside a", ".notice-card a", ".home-notice-list a", ".ecosystem-panel a", ".faculty-academic-details a"];
  const block = css.slice(css.indexOf("Anchors nested inside cards"), css.indexOf("Clear hover/focus affordance"));
  for (const selector of containers) assert.ok(block.includes(selector), `${selector} is reset inside UI containers`);
  assert.match(block.split("}")[0], /text-decoration:\s*none/);
  const hover = css.slice(css.indexOf("Anchors nested inside cards"), css.indexOf(".breadcrumbs a:is(:hover, :focus-visible)"));
  for (const selector of containers) assert.ok(hover.includes(`${selector}:is(:hover, :focus-visible)`), `${selector} keeps a hover/focus underline`);
});

test("hover and keyboard focus affordances are preserved for de-underlined links", () => {
  assert.match(css, /a\.data-card:is\(:hover, :focus-visible\), a\.route-card:is\(:hover, :focus-visible\)/);
  assert.match(css, /border-color: var\(--copper\)/);
  assert.match(css, /\.breadcrumbs a:is\(:hover, :focus-visible\) \{ color: #ffffff; text-decoration: underline; \}/);
  assert.match(css, /\.notice-card h3 a:is\(:hover, :focus-visible\), \.home-notice-list a:is\(:hover, :focus-visible\) \{ text-decoration: underline; \}/);
  // The global focus ring is never removed.
  assert.match(css, /:focus-visible \{ outline: 3px solid var\(--lime\); outline-offset: 3px; \}/);
  assert.doesNotMatch(css, /outline:\s*none|outline:\s*0/);
});

test("cards, breadcrumbs and chips do not inherit the browser underline on any public page shell", () => {
  const shell = readFileSync("components/public-shell.tsx", "utf8");
  const ui = readFileSync("components/ui.tsx", "utf8");
  assert.match(shell, /className="main-nav"/);
  assert.match(ui, /className="breadcrumbs"/);
  // Card components render as anchors with the classes covered above.
  for (const file of ["components/content-cards.tsx", "components/laboratory-directory.tsx", "components/program-explorer.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /className="data-card"/, `${file} uses data-card links`);
  }
});
