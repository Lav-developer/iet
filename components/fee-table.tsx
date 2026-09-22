import type { FeeTable as FeeTableData } from "@/lib/fee-structure";

/**
 * One fee table: a full table on desktop, and the same table inside a
 * horizontally scrollable wrapper on small screens (the page itself never
 * overflows). Grouped headers use two header rows with scope attributes;
 * merged "Semester"/"Payable" cells keep their rowSpan; the serial column is
 * rendered only for tables that carry one.
 */
export function FeeTable({ table, headingLevel = 3, labelledBy }: { table: FeeTableData; headingLevel?: 3 | 4; /** Id of an existing heading that names the table (no heading of its own is rendered). */ labelledBy?: string }) {
  const groups = table.columns.some((column) => column.group);
  const serialColumn = table.serialColumn !== false;
  const captionId = labelledBy || `${table.id}-caption`;
  const Heading = headingLevel === 4 ? "h4" : "h3";
  // Header groups, in order, with the number of columns each spans.
  const groupCells: { label?: string; span: number; numeric?: boolean }[] = [];
  for (const column of table.columns) {
    const last = groupCells[groupCells.length - 1];
    if (column.group && last?.label === column.group) last.span += 1;
    else groupCells.push({ label: column.group, span: 1, numeric: column.numeric });
  }
  return <div className="fee-table-block">
    {!labelledBy && <Heading className="fee-table-title" id={captionId}>{table.title}</Heading>}
    <p className="fee-scroll-hint" aria-hidden="true">Scroll sideways to see all columns.</p>
    <div className="table-wrap fee-table-wrap" role="region" aria-labelledby={captionId} tabIndex={0}>
      <table className={`data-table fee-table${groups ? " fee-table-grouped" : ""}`}>
        <thead>
          {groups
            ? <>
              <tr>
                {groupCells.map((cell, index) => cell.label
                  ? <th key={`group-${index}`} scope="colgroup" colSpan={cell.span} className={cell.numeric ? "numeric" : undefined}>{cell.label}</th>
                  : <th key={`group-${index}`} scope="col" rowSpan={2} className={table.columns[groupIndexToColumn(groupCells, index)].numeric ? "numeric" : undefined}>{table.columns[groupIndexToColumn(groupCells, index)].label}</th>)}
              </tr>
              <tr>
                {table.columns.filter((column) => column.group).map((column, index) => <th key={`sub-${index}`} scope="col" className={column.numeric ? "numeric" : undefined}>{column.label}</th>)}
              </tr>
            </>
            : <tr>{table.columns.map((column) => <th key={column.label} scope="col" className={column.numeric ? "numeric" : undefined}>{column.label}</th>)}</tr>}
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => <tr key={`${table.id}-${rowIndex}`} className={row.total ? "fee-total" : undefined}>
            {serialColumn && <td className="fee-serial">{row.serial || ""}</td>}
            {row.total ? <th scope="row">{row.details}</th> : <td className="fee-details">{row.details}</td>}
            {row.amounts.map((amount, index) => <td key={index} className="numeric">{amount}</td>)}
            {row.semesterMerged ? null : <td className="fee-semester" rowSpan={row.semesterRowSpan}>{row.semester || ""}</td>}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

/** Index in `columns` of the first column belonging to group cell `index`. */
function groupIndexToColumn(groupCells: { span: number }[], index: number) {
  return groupCells.slice(0, index).reduce((sum, cell) => sum + cell.span, 0);
}
