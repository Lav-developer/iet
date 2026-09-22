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
};

export type FeeProgramme = {
  id: string;
  /** Programme heading as printed. */
  title: string;
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

const MTECH_COLUMNS: FeeColumn[] = [
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

export const mtechFeeStructure: FeeProgramme = {
  id: "mtech",
  title: "Fee Structure of M.Tech",
  tables: [{
    id: "mtech-fee-structure",
    title: "Fee Structure of M.Tech",
    columns: MTECH_COLUMNS,
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
  }],
};

export const feeStructures: FeeProgramme[] = [btechFeeStructure, mtechFeeStructure];
