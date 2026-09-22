import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FEE_SOURCE_NOTE, MTECH_PRESENTATION_NOTE, MTECH_SEMESTER_GROUPINGS, btechFeeStructure, feeStructures, mtechFeeSource, mtechFeeStructure } from "../lib/fee-structure";
import FeeStructurePage from "../app/(public)/admissions/fee-structure/page";

Object.assign(globalThis, { React });

/**
 * M.Tech at IET-DSMNRU is a four-semester programme. The institutional fee
 * structure document prints its fees under "1st Year (1st Semester)",
 * "Even Semester (IInd/IVth/VIth Semester)" and "Odd Semester
 * (IIIrd/Vth/VIIth Semester) etc" headings. The public page must present the
 * four programme semesters — Semester 1 = 1st-semester figures, Semesters 2
 * and 4 = even-semester figures, Semester 3 = odd-semester figures — with the
 * source's figures unchanged, and must never show VIth/VIIth (or any semester
 * beyond the fourth) as a programme semester. The mapping is disclosed in a
 * note; the source document itself is neither altered nor called corrected.
 */

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const pageMarkup = () => renderToStaticMarkup(React.createElement(FeeStructurePage));
const mtechSection = (markup: string) => {
  const start = markup.indexOf('id="mtech"');
  assert.ok(start > 0, "the M.Tech section is on the page");
  return markup.slice(start, markup.indexOf("</section>", start));
};
const headerCells = (markup: string) => [...markup.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map((match) => match[1]);

test("the public M.Tech presentation has four programme semesters mapped 1st / even / odd / even, derived from the source table figure by figure", () => {
  assert.deepEqual(MTECH_SEMESTER_GROUPINGS, ["1st Year (1st Semester)", "Even Semester", "Odd Semester", "Even Semester"]);
  assert.equal(mtechFeeStructure.subtitle, "M.Tech — 4 Semester Programme");
  assert.deepEqual(mtechFeeStructure.tables.map((table) => table.title), ["Gen/OBC/SC/ST (Rs.)", "Disabled (Rs.)"]);
  // Source amount columns per category: [1st semester, even semester, odd semester].
  const sourceOffset = { "Gen/OBC/SC/ST (Rs.)": 0, "Disabled (Rs.)": 3 } as const;
  for (const table of mtechFeeStructure.tables) {
    assert.deepEqual(table.columns.map((column) => column.label), ["Fee Component", "Semester 1", "Semester 2", "Semester 3", "Semester 4", "Payable"], table.title);
    assert.equal(table.serialColumn, false, `${table.title}: no serial-number column in the semester presentation`);
    assert.equal(table.rows.length, mtechFeeSource.rows.length, `${table.title}: every printed fee component, nothing added`);
    const offset = sourceOffset[table.title as keyof typeof sourceOffset];
    table.rows.forEach((row, index) => {
      const source = mtechFeeSource.rows[index];
      assert.equal(row.details, source.details, `${table.title} row ${index}: same fee component`);
      const [first, even, odd] = source.amounts.slice(offset, offset + 3);
      assert.deepEqual(row.amounts, [first, even, odd, even], `${table.title} ${row.details}: Semester 1 = 1st semester, 2 = even, 3 = odd, 4 = even`);
      // Printed payment frequency and merged cells travel with the row unchanged.
      assert.equal(row.semester, source.semester, `${table.title} ${row.details}: payable as printed`);
      assert.equal(row.semesterRowSpan, source.semesterRowSpan);
      assert.equal(row.semesterMerged, source.semesterMerged);
      assert.equal(row.total, source.total);
      assert.equal(row.serial, undefined);
    });
  }
});

test("the source figures — including ----, 00 and the printed totals — appear exactly where the source grouping puts them", () => {
  const [gen, disabled] = mtechFeeStructure.tables;
  const amounts = (table: typeof gen, details: string) => table.rows.find((row) => row.details === details)?.amounts;
  assert.deepEqual(amounts(gen, "Admission Fee"), ["1000", "----", "----", "----"]);
  assert.deepEqual(amounts(gen, "Exam Fee"), ["3000", "3000", "3000", "3000"]);
  assert.deepEqual(amounts(gen, "Tuition Fee"), ["32000", "32000", "32000", "32000"]);
  assert.deepEqual(amounts(gen, "Library Fee"), ["2000", "----", "2000", "----"]);
  assert.deepEqual(amounts(gen, "Development Fee"), ["1500", "----", "1500", "----"]);
  assert.deepEqual(amounts(gen, "Caution Money"), ["5000", "----", "----", "----"]);
  assert.deepEqual(amounts(gen, "Insurance Fee"), ["105", "----", "105", "----"]);
  assert.deepEqual(amounts(gen, "Student Welfare Fund"), ["100", "100", "100", "100"]);
  assert.deepEqual(amounts(gen, "Game Fee"), ["100", "100", "100", "100"]);
  assert.deepEqual(amounts(gen, "Total Amount"), ["44805", "35200", "38805", "35200"], "the printed totals of each grouping, not a new calculation");
  assert.deepEqual(amounts(disabled, "Admission Fee"), ["1000", "----", "----", "----"]);
  assert.deepEqual(amounts(disabled, "Tuition Fee"), ["00", "00", "00", "00"]);
  assert.deepEqual(amounts(disabled, "Library Fee"), ["2000", "----", "2000", "----"]);
  assert.deepEqual(amounts(disabled, "Caution Money"), ["5000", "----", "----", "----"]);
  assert.deepEqual(amounts(disabled, "Insurance Fee"), ["105", "----", "105", "----"]);
  assert.deepEqual(amounts(disabled, "Total Amount"), ["12805", "3200", "6805", "3200"]);
  // The source transcription itself is untouched (the presentation is derived from it, not the other way round).
  assert.deepEqual(mtechFeeSource.rows.find((row) => row.total)?.amounts, ["44805", "35200", "38805", "12805", "3200", "6805"]);
  assert.deepEqual(mtechFeeSource.columns.map((column) => column.label).slice(2, 8), [
    "1st Year (1st Semester)", "Even Semester (IInd/IVth/VIth Semester)", "Odd Semester (IIIrd/Vth/VIIth Semester) etc",
    "1st Year (1st Semester)", "Even Semester (IInd/IVth/VIth Semester) etc", "Odd Semester (IIIrd/Vth/VIIth Semester) etc",
  ]);
  // Every public amount string exists in the source row it came from: nothing invented.
  for (const table of mtechFeeStructure.tables) {
    table.rows.forEach((row, index) => {
      for (const amount of row.amounts) assert.ok(mtechFeeSource.rows[index].amounts.includes(amount), `${table.title} ${row.details}: ${amount} is a printed figure`);
    });
  }
});

test("regression: the public M.Tech fee page never presents VIth or VIIth (or any semester beyond the fourth) as a programme semester", () => {
  const markup = pageMarkup();
  const section = mtechSection(markup);
  // The source's broader headings and their semester numerals do not appear anywhere in the M.Tech section.
  assert.doesNotMatch(section, /VIth|VIIth|VIIIth|IInd|IVth|IIIrd|\bVth\b/, "no VIth / VIIth style semester labels");
  assert.doesNotMatch(section, /Semester\s*(?:[5-9]|V\b|VI\b|VII\b|VIII\b)/, "no fifth or later semester");
  assert.doesNotMatch(section, /Even Semester \(|Odd Semester \(|\) etc/, "the source column headings are not shown as programme semesters");
  // The only column headings are the four programme semesters (once per fee category).
  assert.deepEqual(headerCells(section), [
    "Fee Component", "Semester 1", "Semester 2", "Semester 3", "Semester 4", "Payable",
    "Fee Component", "Semester 1", "Semester 2", "Semester 3", "Semester 4", "Payable",
  ]);
  assert.match(section, /<h2 id="mtech-heading">Fee Structure of M\.Tech<\/h2><p class="fee-programme-subtitle">M\.Tech — 4 Semester Programme<\/p>/);
  assert.match(section, /<h3 class="fee-table-title" id="mtech-gen-obc-sc-st-caption">Gen\/OBC\/SC\/ST \(Rs\.\)<\/h3>/);
  assert.match(section, /<h3 class="fee-table-title" id="mtech-disabled-caption">Disabled \(Rs\.\)<\/h3>/);
  // Printed figures in the rendered rows.
  assert.match(section, /<th scope="row">Total Amount<\/th><td class="numeric">44805<\/td><td class="numeric">35200<\/td><td class="numeric">38805<\/td><td class="numeric">35200<\/td>/);
  assert.match(section, /<th scope="row">Total Amount<\/th><td class="numeric">12805<\/td><td class="numeric">3200<\/td><td class="numeric">6805<\/td><td class="numeric">3200<\/td>/);
  assert.match(section, /<td class="fee-details">Tuition Fee<\/td><td class="numeric">00<\/td><td class="numeric">00<\/td><td class="numeric">00<\/td><td class="numeric">00<\/td>/);
  assert.match(section, /<td class="fee-details">Admission Fee<\/td><td class="numeric">1000<\/td><td class="numeric">----<\/td><td class="numeric">----<\/td><td class="numeric">----<\/td><td class="fee-semester">Only on admission time<\/td>/);
  assert.match(section, /<td class="fee-semester" rowSpan="2">Per Semester<\/td>/, "the merged Exam Fee / Tuition Fee cell is kept");
  // The B.Tech tables (an eight-semester programme) are unchanged and still print VI, VII and VIII.
  assert.deepEqual(btechFeeStructure.tables.map((table) => table.title), ["I-SEMESTER", "II-SEMESTER", "III-SEMESTER", "IV-SEMESTER", "V-SEMESTER", "VI-SEMESTER", "VII-SEMESTER", "VIII-SEMESTER"]);
  assert.doesNotMatch(markup, /VIth Semester|VIIth Semester/, "nowhere on the page");
  assert.equal(feeStructures[1], mtechFeeStructure, "the page renders the four-semester presentation, not the source layout");
});

test("the mapping is disclosed with the exact note under the M.Tech heading, without claiming the source document was corrected", () => {
  assert.equal(MTECH_PRESENTATION_NOTE, "Note: The institutional fee-structure document groups some M.Tech fees under 'Even Semester' and 'Odd Semester' headings that reference additional semester numbers. As the M.Tech programme is presented here as a four-semester programme, the applicable four semesters are mapped to the source's 1st-semester, even-semester and odd-semester fee groupings without changing the figures printed in the source document. Students should verify the latest applicable fee through the current university notice.");
  assert.equal(mtechFeeStructure.note, MTECH_PRESENTATION_NOTE);
  assert.equal(btechFeeStructure.note, undefined, "the note is specific to M.Tech");
  const section = mtechSection(pageMarkup());
  const noteAt = section.indexOf(`<p class="source-note fee-programme-note">${escapeHtml(MTECH_PRESENTATION_NOTE)}</p>`);
  assert.ok(noteAt > 0, "the note is printed verbatim");
  assert.ok(noteAt < section.indexOf("<table"), "the note precedes the tables");
  assert.ok(noteAt > section.indexOf("mtech-heading"), "the note follows the heading");
  assert.doesNotMatch(section, /corrected|correction|error in the (?:source|document)|the university has/i);
  // The general source note is still printed on the page.
  assert.ok(pageMarkup().includes(FEE_SOURCE_NOTE));
});
