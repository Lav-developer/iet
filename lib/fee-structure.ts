/**
 * Fee structure of IET-DSMNRU, reproduced from the institutional fee
 * structure document (uploads/IET26072026.pdf, "Table.2 : Fee Structure
 * Semester-wise", pages 4–6).
 *
 * Every figure, heading and note is transcribed as printed. Nothing here is
 * derived, estimated or summarised: identical semesters are repeated because
 * the source prints them separately, "----" and "00" are kept as printed, and
 * the serial-number column stays blank where the source leaves it blank.
 * Students must refer to the latest university notice for the fees that
 * currently apply.
 *
 * M.Tech: the source prints one table whose amount columns are grouped as
 * "1st Year (1st Semester)", "Even Semester (IInd/IVth/VIth Semester)" and
 * "Odd Semester (IIIrd/Vth/VIIth Semester) etc" — headings that reference
 * semester numbers beyond the four-semester M.Tech programme. That table is
 * kept verbatim below as `mtechFeeSource` (the record the public presentation
 * is derived from and checked against), while the public page presents the
 * programme's four semesters, each showing the figures of the source grouping
 * it falls under (1st semester, even, odd, even). No figure is changed,
 * calculated or added, and the mapping is stated in `MTECH_PRESENTATION_NOTE`.
 */

export type FeeColumn = {
  /** Header text as printed. */
  label: string;
  /** Optional header group printed above a run of columns (M.Tech). */
  group?: string;
  /** Numeric columns are right-aligned. */
  numeric?: boolean;
};

export type FeeRow = {
  serial?: string;
  details: string;
  /** One entry per amount column, in column order, exactly as printed. */
  amounts: string[];
  /** "Semester" column text; omitted where the printed cell is empty. */
  semester?: string;
  /** Number of rows the printed "Semester" cell spans (merged cells). */
  semesterRowSpan?: number;
  /** True when the printed cell is covered by a merged cell from the row above. */
  semesterMerged?: boolean;
  total?: boolean;
};

export type FeeTable = {
  id: string;
  /** Table heading as printed (for example "I-SEMESTER"). */
  title: string;
  columns: FeeColumn[];
  rows: FeeRow[];
  /** Whether the table carries the printed "Sl.No." column (default true). */
  serialColumn?: boolean;
};

export type FeeProgramme = {
  id: string;
  /** Programme heading as printed. */
  title: string;
  /** Optional line shown under the heading (for example the programme length). */
  subtitle?: string;
  /** Optional note explaining how the tables relate to the source document. */
  note?: string;
  tables: FeeTable[];
};

export const FEE_SOURCE_NOTE = "Fee structure reproduced from the IET-DSMNRU institutional fee structure document. Students should refer to the latest university notice for current applicable fees.";

const BTECH_COLUMNS: FeeColumn[] = [
  { label: "Sl.No." },
  { label: "Details" },
  { label: "Gen/OBC/SC/ST (Rs.)", numeric: true },
  { label: "Disabled (Rs.)", numeric: true },
  { label: "Semester" },
];

const firstSemester: FeeRow[] = [
  { serial: "1", details: "Admission Fee", amounts: ["1000", "1000"], semester: "Only on admission time" },
  { serial: "2", details: "Exam Fee", amounts: ["3000", "3000"], semester: "Per Semester" },
  { serial: "3", details: "Tuition Fee", amounts: ["37500", "0"], semester: "Per Semester" },
  { serial: "4", details: "Library Fee", amounts: ["2000", "2000"], semester: "Yearly" },
  { serial: "5", details: "Development Fee", amounts: ["1500", "1500"], semester: "Yearly" },
  { serial: "6", details: "Caution Money", amounts: ["6000", "6000"], semester: "Only on admission time" },
  { serial: "7", details: "Insurance Fee", amounts: ["105", "105"], semester: "Yearly" },
  { serial: "8", details: "Student Welfare Fund", amounts: ["100", "100"], semester: "Per Semester" },
  { serial: "9", details: "Game Fee", amounts: ["100", "100"], semester: "Per Semester" },
  { details: "Total Amount", amounts: ["51305", "13805"], total: true },
];

/** II, IV, VI and VIII semester (printed identically). */
const evenSemester: FeeRow[] = [
  { serial: "1", details: "Exam Fee", amounts: ["3000", "3000"], semester: "Per Semester" },
  { serial: "2", details: "Tuition Fee", amounts: ["37500", "0"], semester: "Per Semester" },
  { serial: "3", details: "Student Welfare Fund", amounts: ["100", "100"], semester: "Per Semester" },
  { serial: "4", details: "Game Fee", amounts: ["100", "100"], semester: "Per Semester" },
  { details: "Total Amount", amounts: ["40700", "3200"], total: true },
];

/** III, V and VII semester (printed identically; the source leaves Sl.No. blank). */
const oddSemester: FeeRow[] = [
  { details: "Exam Fee", amounts: ["3000", "3000"], semester: "Per Semester" },
  { details: "Tuition Fee", amounts: ["37500", "0"], semester: "Per Semester" },
  { details: "Library Fee", amounts: ["2000", "2000"], semester: "Yearly" },
  { details: "Development Fee", amounts: ["2500", "2500"], semester: "Yearly" },
  { details: "Insurance Fee", amounts: ["105", "105"], semester: "Yearly" },
  { details: "Student Welfare Fund", amounts: ["100", "100"], semester: "Per Semester" },
  { details: "Game Fee", amounts: ["100", "100"], semester: "Per Semester" },
  { details: "Total Amount", amounts: ["45305", "7805"], total: true },
];

const btechSemesters: [string, FeeRow[]][] = [
  ["I-SEMESTER", firstSemester],
  ["II-SEMESTER", evenSemester],
  ["III-SEMESTER", oddSemester],
  ["IV-SEMESTER", evenSemester],
  ["V-SEMESTER", oddSemester],
  ["VI-SEMESTER", evenSemester],
  ["VII-SEMESTER", oddSemester],
  ["VIII-SEMESTER", evenSemester],
];

export const btechFeeStructure: FeeProgramme = {
  id: "btech",
  title: "Fee Structure of B.Tech (Under Self Finance Scheme)",
  tables: btechSemesters.map(([title, rows], index) => ({ id: `btech-semester-${index + 1}`, title, columns: BTECH_COLUMNS, rows })),
};

const MTECH_SOURCE_COLUMNS: FeeColumn[] = [
  { label: "Sl.No." },
  { label: "Details" },
  { group: "Gen/OBC/SC/ST (Rs.)", label: "1st Year (1st Semester)", numeric: true },
  { group: "Gen/OBC/SC/ST (Rs.)", label: "Even Semester (IInd/IVth/VIth Semester)", numeric: true },
  { group: "Gen/OBC/SC/ST (Rs.)", label: "Odd Semester (IIIrd/Vth/VIIth Semester) etc", numeric: true },
  { group: "Disabled (Rs.)", label: "1st Year (1st Semester)", numeric: true },
  { group: "Disabled (Rs.)", label: "Even Semester (IInd/IVth/VIth Semester) etc", numeric: true },
  { group: "Disabled (Rs.)", label: "Odd Semester (IIIrd/Vth/VIIth Semester) etc", numeric: true },
  { label: "Semester" },
];

/**
 * The M.Tech table exactly as printed in the source document (headings
 * included). It is the record of what the university document says and the
 * data every public figure is copied from; it is not rendered on the public
 * page as-is, because its column headings reference semester numbers beyond
 * the four-semester programme (see `mtechFeeStructure`).
 */
export const mtechFeeSource: FeeTable = {
  id: "mtech-fee-source",
  title: "Fee Structure of M.Tech",
  columns: MTECH_SOURCE_COLUMNS,
  rows: [
    { serial: "1", details: "Admission Fee", amounts: ["1000", "----", "----", "1000", "----", "----"], semester: "Only on admission time" },
    // "Per Semester" is one merged cell covering Exam Fee and Tuition Fee in the source.
    { serial: "2", details: "Exam Fee", amounts: ["3000", "3000", "3000", "3000", "3000", "3000"], semester: "Per Semester", semesterRowSpan: 2 },
    { serial: "3", details: "Tuition Fee", amounts: ["32000", "32000", "32000", "00", "00", "00"], semesterMerged: true },
    { serial: "4", details: "Library Fee", amounts: ["2000", "----", "2000", "2000", "----", "2000"], semester: "Yearly" },
    { serial: "5", details: "Development Fee", amounts: ["1500", "----", "1500", "1500", "----", "1500"], semester: "Yearly" },
    { serial: "6", details: "Caution Money", amounts: ["5000", "----", "----", "5000", "----", "----"], semester: "Only on admission time" },
    { serial: "7", details: "Insurance Fee", amounts: ["105", "----", "105", "105", "----", "105"], semester: "Yearly" },
    { serial: "8", details: "Student Welfare Fund", amounts: ["100", "100", "100", "100", "100", "100"], semester: "Per Semester" },
    { serial: "9", details: "Game Fee", amounts: ["100", "100", "100", "100", "100", "100"], semester: "Per Semester" },
    { details: "Total Amount", amounts: ["44805", "35200", "38805", "12805", "3200", "6805"], total: true },
  ],
};

/** Printed under the M.Tech heading: how the four semesters relate to the source's groupings. */
export const MTECH_PRESENTATION_NOTE = "Note: The institutional fee-structure document groups some M.Tech fees under 'Even Semester' and 'Odd Semester' headings that reference additional semester numbers. As the M.Tech programme is presented here as a four-semester programme, the applicable four semesters are mapped to the source's 1st-semester, even-semester and odd-semester fee groupings without changing the figures printed in the source document. Students should verify the latest applicable fee through the current university notice.";

/** The source grouping each M.Tech programme semester falls under. */
export type MtechSourceGrouping = "1st Year (1st Semester)" | "Even Semester" | "Odd Semester";
export const MTECH_SEMESTER_GROUPINGS: readonly [MtechSourceGrouping, MtechSourceGrouping, MtechSourceGrouping, MtechSourceGrouping] = ["1st Year (1st Semester)", "Even Semester", "Odd Semester", "Even Semester"];

/** Position of each grouping inside a fee category's three printed amount columns. */
const groupingOffset: Record<MtechSourceGrouping, number> = { "1st Year (1st Semester)": 0, "Even Semester": 1, "Odd Semester": 2 };

/** The two fee categories as printed, with the index of their first amount column in `mtechFeeSource`. */
const MTECH_CATEGORIES: { id: string; title: string; firstColumn: number }[] = [
  { id: "mtech-gen-obc-sc-st", title: "Gen/OBC/SC/ST (Rs.)", firstColumn: 0 },
  { id: "mtech-disabled", title: "Disabled (Rs.)", firstColumn: 3 },
];

const MTECH_SEMESTER_COLUMNS: FeeColumn[] = [
  { label: "Fee Component" },
  { label: "Semester 1", numeric: true },
  { label: "Semester 2", numeric: true },
  { label: "Semester 3", numeric: true },
  { label: "Semester 4", numeric: true },
  { label: "Payable" },
];

/**
 * Public four-semester presentation of the source table for one fee category:
 * Semester 1 shows the "1st Year (1st Semester)" figures, Semesters 2 and 4
 * the "Even Semester" figures, Semester 3 the "Odd Semester" figures. Each
 * amount is copied from `mtechFeeSource` — "----" and "00" included — and the
 * printed payment frequency ("Payable") and merged cells are kept.
 */
function mtechSemesterTable(category: { id: string; title: string; firstColumn: number }): FeeTable {
  return {
    id: category.id,
    title: category.title,
    columns: MTECH_SEMESTER_COLUMNS,
    serialColumn: false,
    rows: mtechFeeSource.rows.map(({ serial: _serial, ...row }) => ({
      ...row,
      amounts: MTECH_SEMESTER_GROUPINGS.map((grouping) => row.amounts[category.firstColumn + groupingOffset[grouping]]),
    })),
  };
}

export const mtechFeeStructure: FeeProgramme = {
  id: "mtech",
  title: "Fee Structure of M.Tech",
  subtitle: "M.Tech — 4 Semester Programme",
  note: MTECH_PRESENTATION_NOTE,
  tables: MTECH_CATEGORIES.map(mtechSemesterTable),
};

export const feeStructures: FeeProgramme[] = [btechFeeStructure, mtechFeeStructure];
