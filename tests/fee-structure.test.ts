import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeeTable } from "../components/fee-table";
import { FEE_SOURCE_NOTE, MTECH_PRESENTATION_NOTE, btechFeeStructure, feeStructures, mtechFeeSource, mtechFeeStructure } from "../lib/fee-structure";
import FeeStructurePage from "../app/(public)/admissions/fee-structure/page";

Object.assign(globalThis, { React });

/**
 * The fee tables are a transcription of the institutional fee structure
 * document (uploads/IET26072026.pdf, pages 4–6). These tests pin every value
 * to the source so a later "tidy-up" can never silently change an amount.
 */

const total = (rows: { total?: boolean; amounts: string[] }[]) => rows.find((row) => row.total)?.amounts;
const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const rowAmounts = (rows: { details: string; amounts: string[] }[], details: string) => rows.find((row) => row.details === details)?.amounts;

test("B.Tech (Under Self Finance Scheme): eight semester tables with the printed columns", () => {
  assert.equal(btechFeeStructure.title, "Fee Structure of B.Tech (Under Self Finance Scheme)");
  assert.deepEqual(btechFeeStructure.tables.map((table) => table.title), ["I-SEMESTER", "II-SEMESTER", "III-SEMESTER", "IV-SEMESTER", "V-SEMESTER", "VI-SEMESTER", "VII-SEMESTER", "VIII-SEMESTER"]);
  for (const table of btechFeeStructure.tables) {
    assert.deepEqual(table.columns.map((column) => column.label), ["Sl.No.", "Details", "Gen/OBC/SC/ST (Rs.)", "Disabled (Rs.)", "Semester"], table.title);
    for (const row of table.rows) assert.equal(row.amounts.length, 2, `${table.title} ${row.details} has two amount columns`);
  }
});

test("B.Tech I-SEMESTER values match the source", () => {
  const rows = btechFeeStructure.tables[0].rows;
  assert.deepEqual(rows.map((row) => [row.serial || "", row.details, ...row.amounts, row.semester || ""]), [
    ["1", "Admission Fee", "1000", "1000", "Only on admission time"],
    ["2", "Exam Fee", "3000", "3000", "Per Semester"],
    ["3", "Tuition Fee", "37500", "0", "Per Semester"],
    ["4", "Library Fee", "2000", "2000", "Yearly"],
    ["5", "Development Fee", "1500", "1500", "Yearly"],
    ["6", "Caution Money", "6000", "6000", "Only on admission time"],
    ["7", "Insurance Fee", "105", "105", "Yearly"],
    ["8", "Student Welfare Fund", "100", "100", "Per Semester"],
    ["9", "Game Fee", "100", "100", "Per Semester"],
    ["", "Total Amount", "51305", "13805", ""],
  ]);
});

test("B.Tech even semesters (II, IV, VI, VIII) and odd semesters (III, V, VII) match the source", () => {
  for (const index of [1, 3, 5, 7]) {
    const rows = btechFeeStructure.tables[index].rows;
    assert.deepEqual(rows.map((row) => [row.serial || "", row.details, ...row.amounts, row.semester || ""]), [
      ["1", "Exam Fee", "3000", "3000", "Per Semester"],
      ["2", "Tuition Fee", "37500", "0", "Per Semester"],
      ["3", "Student Welfare Fund", "100", "100", "Per Semester"],
      ["4", "Game Fee", "100", "100", "Per Semester"],
      ["", "Total Amount", "40700", "3200", ""],
    ], btechFeeStructure.tables[index].title);
  }
  for (const index of [2, 4, 6]) {
    const rows = btechFeeStructure.tables[index].rows;
    // The source prints no serial numbers in these tables; none are invented.
    assert.ok(rows.every((row) => !row.serial), `${btechFeeStructure.tables[index].title} keeps the blank Sl.No. column`);
    assert.deepEqual(rows.map((row) => [row.details, ...row.amounts, row.semester || ""]), [
      ["Exam Fee", "3000", "3000", "Per Semester"],
      ["Tuition Fee", "37500", "0", "Per Semester"],
      ["Library Fee", "2000", "2000", "Yearly"],
      ["Development Fee", "2500", "2500", "Yearly"],
      ["Insurance Fee", "105", "105", "Yearly"],
      ["Student Welfare Fund", "100", "100", "Per Semester"],
      ["Game Fee", "100", "100", "Per Semester"],
      ["Total Amount", "45305", "7805", ""],
    ], btechFeeStructure.tables[index].title);
  }
});

test("M.Tech source transcription: the printed nine-column structure, values and totals (including 6805 for Disabled odd semesters)", () => {
  const table = mtechFeeSource;
  assert.equal(mtechFeeStructure.title, "Fee Structure of M.Tech");
  assert.equal(table.title, "Fee Structure of M.Tech");
  assert.deepEqual(table.columns.map((column) => [column.group || "", column.label]), [
    ["", "Sl.No."],
    ["", "Details"],
    ["Gen/OBC/SC/ST (Rs.)", "1st Year (1st Semester)"],
    ["Gen/OBC/SC/ST (Rs.)", "Even Semester (IInd/IVth/VIth Semester)"],
    ["Gen/OBC/SC/ST (Rs.)", "Odd Semester (IIIrd/Vth/VIIth Semester) etc"],
    ["Disabled (Rs.)", "1st Year (1st Semester)"],
    ["Disabled (Rs.)", "Even Semester (IInd/IVth/VIth Semester) etc"],
    ["Disabled (Rs.)", "Odd Semester (IIIrd/Vth/VIIth Semester) etc"],
    ["", "Semester"],
  ]);
  assert.deepEqual(rowAmounts(table.rows, "Admission Fee"), ["1000", "----", "----", "1000", "----", "----"]);
  assert.deepEqual(rowAmounts(table.rows, "Exam Fee"), ["3000", "3000", "3000", "3000", "3000", "3000"]);
  assert.deepEqual(rowAmounts(table.rows, "Tuition Fee"), ["32000", "32000", "32000", "00", "00", "00"]);
  assert.deepEqual(rowAmounts(table.rows, "Library Fee"), ["2000", "----", "2000", "2000", "----", "2000"]);
  assert.deepEqual(rowAmounts(table.rows, "Development Fee"), ["1500", "----", "1500", "1500", "----", "1500"]);
  assert.deepEqual(rowAmounts(table.rows, "Caution Money"), ["5000", "----", "----", "5000", "----", "----"]);
  assert.deepEqual(rowAmounts(table.rows, "Insurance Fee"), ["105", "----", "105", "105", "----", "105"]);
  assert.deepEqual(rowAmounts(table.rows, "Student Welfare Fund"), ["100", "100", "100", "100", "100", "100"]);
  assert.deepEqual(rowAmounts(table.rows, "Game Fee"), ["100", "100", "100", "100", "100", "100"]);
  assert.deepEqual(total(table.rows), ["44805", "35200", "38805", "12805", "3200", "6805"]);
  // The merged "Per Semester" cell (Exam Fee + Tuition Fee) is kept as a rowSpan, not duplicated or dropped.
  const exam = table.rows.find((row) => row.details === "Exam Fee");
  const tuition = table.rows.find((row) => row.details === "Tuition Fee");
  assert.equal(exam?.semester, "Per Semester");
  assert.equal(exam?.semesterRowSpan, 2);
  assert.equal(tuition?.semesterMerged, true);
  assert.deepEqual(table.rows.map((row) => row.semester || (row.semesterMerged ? "(merged)" : "")), ["Only on admission time", "Per Semester", "(merged)", "Yearly", "Yearly", "Only on admission time", "Yearly", "Per Semester", "Per Semester", ""]);
});

test("the table component renders grouped headers, rowSpans and a scrollable wrapper without inventing cells", () => {
  const markup = renderToStaticMarkup(React.createElement(FeeTable, { table: mtechFeeSource }));
  assert.match(markup, /<th scope="colgroup" colSpan="3"[^>]*>Gen\/OBC\/SC\/ST \(Rs\.\)<\/th>/);
  assert.match(markup, /<th scope="colgroup" colSpan="3"[^>]*>Disabled \(Rs\.\)<\/th>/);
  assert.match(markup, /<th scope="col" rowSpan="2"[^>]*>Sl\.No\.<\/th>/);
  assert.match(markup, /<th scope="col" rowSpan="2"[^>]*>Semester<\/th>/);
  assert.match(markup, /<td class="fee-semester" rowSpan="2">Per Semester<\/td>/);
  assert.match(markup, /class="table-wrap fee-table-wrap" role="region" aria-labelledby="mtech-fee-source-caption" tabindex="0"/);
  assert.match(markup, /<th scope="row">Total Amount<\/th>/);
  assert.equal((markup.match(/<td class="numeric">6805<\/td>/g) || []).length, 1);
  // Row cell counts: 9 columns per data row (merged rows carry 8 cells).
  const rows = markup.slice(markup.indexOf("<tbody>")).split("<tr").slice(1);
  const cellCounts = rows.map((row) => (row.match(/<t[dh]/g) || []).length);
  assert.deepEqual(cellCounts, [9, 9, 8, 9, 9, 9, 9, 9, 9, 9]);
  const btech = renderToStaticMarkup(React.createElement(FeeTable, { table: btechFeeStructure.tables[0] }));
  assert.match(btech, /<h3 class="fee-table-title" id="btech-semester-1-caption">I-SEMESTER<\/h3>/);
  assert.match(btech, /<td class="numeric">51305<\/td><td class="numeric">13805<\/td>/);
});

test("the public page shows both programmes, the exact source note and no unsupported claims", () => {
  const markup = renderToStaticMarkup(React.createElement(FeeStructurePage));
  assert.match(markup, /Fee Structure of B\.Tech \(Under Self Finance Scheme\)/);
  assert.match(markup, /Fee Structure of M\.Tech/);
  assert.equal(FEE_SOURCE_NOTE, "Fee structure reproduced from the IET-DSMNRU institutional fee structure document. Students should refer to the latest university notice for current applicable fees.");
  assert.ok(markup.includes(FEE_SOURCE_NOTE), "the source note is printed");
  assert.match(markup, /class="source-note"/);
  assert.ok(markup.includes(escapeHtml(MTECH_PRESENTATION_NOTE)), "the M.Tech mapping note is printed");
  assert.doesNotMatch(markup, /approx|estimated|latest fees|currently applicable fees are|guaranteed|accredit|corrected/i);
  assert.equal(feeStructures.length, 2);
  for (const table of [...btechFeeStructure.tables, ...mtechFeeStructure.tables]) assert.ok(markup.includes(`id="${table.id}-caption"`), table.id);
  // Every semester heading appears exactly once.
  for (const title of ["I-SEMESTER", "II-SEMESTER", "III-SEMESTER", "IV-SEMESTER", "V-SEMESTER", "VI-SEMESTER", "VII-SEMESTER", "VIII-SEMESTER"]) {
    assert.equal((markup.match(new RegExp(`>${title}<`, "g")) || []).length, 1, title);
  }
});

test("the fee structure is reachable from navigation, admissions, resources, the homepage and the sitemap", () => {
  const shell = readFileSync("components/public-shell.tsx", "utf8");
  assert.match(shell, /\{ href: "\/admissions\/fee-structure", label: "Fee structure" \}/, "mobile navigation");
  assert.match(shell, /<Link href="\/admissions\/fee-structure">Fee structure<\/Link>/, "footer");
  assert.match(readFileSync("app/(public)/admissions/page.tsx", "utf8"), /<Link href="\/admissions\/fee-structure" className="link-arrow">View fee structure<\/Link>/);
  assert.match(readFileSync("app/(public)/resources/page.tsx", "utf8"), /href="\/admissions\/fee-structure"/);
  assert.match(readFileSync("app/(public)/page.tsx", "utf8"), /<Link href="\/admissions\/fee-structure" className="button secondary">Fee structure<\/Link>/);
  assert.match(readFileSync("app/(public)/sitemap.xml/route.ts", "utf8"), /"\/admissions\/fee-structure"/);
  // Responsive: the wrapper scrolls horizontally; the page never does.
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.table-wrap \{ overflow-x: auto;/);
  assert.match(css, /\.data-table\.fee-table \{ width: 100%; min-width: 560px; \}/);
  assert.match(css, /\.data-table\.fee-table\.fee-table-grouped \{ min-width: 860px; \}/);
});
