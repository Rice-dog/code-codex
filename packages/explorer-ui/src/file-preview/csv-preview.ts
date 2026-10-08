import type { CodeCodexMainPreviewElement as PreviewHost } from "../main-preview";
import type { CsvModel, MainPreviewTextView } from './contracts';
const MAX_CSV_ROWS = 1_000;

const MAX_CSV_COLUMNS = 128;

const MAX_CSV_CELLS = 10_000;

const MAX_CSV_CELL_TEXT_UNITS = 16_384;

function parseCsv(source: string, allowIncompleteFinalRecord = false): CsvModel {
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (input.length === 0) {
    return { rows: [], totalRows: 0, maximumColumns: 0, limited: false, malformed: false };
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let rowColumns = 0;
  let totalRows = 0;
  let maximumColumns = 0;
  let retainedCells = 0;
  let inQuotes = false;
  let atFieldStart = true;
  let afterClosingQuote = false;
  let endedAtRecordBoundary = false;
  let limited = false;
  let malformed = false;

  const canRetainField = (): boolean =>
    totalRows < MAX_CSV_ROWS && rowColumns < MAX_CSV_COLUMNS && retainedCells < MAX_CSV_CELLS;
  const append = (value: string): void => {
    if (!canRetainField()) {
      limited = true;
      return;
    }
    const remaining = MAX_CSV_CELL_TEXT_UNITS - field.length;
    if (remaining <= 0) {
      limited = true;
      return;
    }
    const candidate = value.slice(0, remaining);
    const finalCodeUnit = candidate.charCodeAt(candidate.length - 1);
    const safeCandidate = finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff ? candidate.slice(0, -1) : candidate;
    field += safeCandidate;
    if (safeCandidate.length < value.length) limited = true;
  };
  const finishField = (): void => {
    if (canRetainField()) {
      row.push(field);
      retainedCells += 1;
    } else {
      limited = true;
    }
    rowColumns += 1;
    field = "";
    atFieldStart = true;
    afterClosingQuote = false;
  };
  const finishRow = (): void => {
    finishField();
    maximumColumns = Math.max(maximumColumns, rowColumns);
    if (totalRows < MAX_CSV_ROWS && row.length > 0) rows.push(row);
    else limited = true;
    totalRows += 1;
    row = [];
    rowColumns = 0;
  };

  for (let index = 0;index < input.length;index += 1) {
    let character = input[index] ?? "";
    const firstCodeUnit = character.charCodeAt(0);
    const secondCodeUnit = input.charCodeAt(index + 1);
    if (
      firstCodeUnit >= 0xd800 && firstCodeUnit <= 0xdbff &&
      secondCodeUnit >= 0xdc00 && secondCodeUnit <= 0xdfff
    ) {
      character += input[index + 1];
      index += 1;
    }
    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          append('"');
          index += 1;
        } else {
          inQuotes = false;
          afterClosingQuote = true;
        }
      } else if (character === "\r") {
        append("\n");
        if (input[index + 1] === "\n") index += 1;
      } else {
        append(character);
      }
      endedAtRecordBoundary = false;
      continue;
    }

    if (character === ",") {
      finishField();
      endedAtRecordBoundary = false;
      continue;
    }
    if (character === "\r" || character === "\n") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      finishRow();
      endedAtRecordBoundary = true;
      continue;
    }
    if (character === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      endedAtRecordBoundary = false;
      continue;
    }
    if (character === '"') malformed = true;
    if (afterClosingQuote) malformed = true;
    append(character);
    atFieldStart = false;
    afterClosingQuote = false;
    endedAtRecordBoundary = false;
  }

  if (inQuotes && !allowIncompleteFinalRecord) malformed = true;
  if (!endedAtRecordBoundary || rowColumns > 0 || field.length > 0 || atFieldStart === false) finishRow();
  return { rows, totalRows, maximumColumns, limited, malformed };
}

function visibleCsvCellText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

function excelColumnLabel(index: number): string {
  let value = Math.max(1, Math.trunc(index));
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export const methods = {
  _csvReader(this: PreviewHost, view: MainPreviewTextView): HTMLElement {
    const model = parseCsv(view.text, view.truncated);
    if (model.rows.length === 0) {
      return this._statePanel("Empty CSV file", "This CSV file has no rows.", "empty", view);
    }

    const container = this.ownerDocument.createElement("article");
    container.className = "csv-preview";
    container.setAttribute("aria-label", `CSV preview: ${view.name}`);

    const header = this.ownerDocument.createElement("header");
    header.className = "csv-header";
    const headingCopy = this.ownerDocument.createElement("div");
    const title = this.ownerDocument.createElement("h2");
    title.className = "csv-title";
    title.textContent = view.name;
    const summary = this.ownerDocument.createElement("div");
    summary.className = "csv-summary";
    summary.textContent = `${model.totalRows.toLocaleString()} ${model.totalRows === 1 ? "row" : "rows"} · ${model.maximumColumns.toLocaleString()} ${model.maximumColumns === 1 ? "column" : "columns"} · comma-delimited`;
    headingCopy.append(title, summary);
    const mode = this._textSpan("Preview grid", "csv-mode");
    header.append(headingCopy, mode);

    const notices = this.ownerDocument.createElement("div");
    notices.className = "csv-notices";
    if (view.truncated) {
      notices.append(this._textSpan("Showing the beginning of this file. The final record may be incomplete.", "csv-notice"));
    }
    if (model.limited) notices.append(this._textSpan("Preview limited for performance.", "csv-notice"));
    if (model.malformed) {
      notices.append(this._textSpan("CSV quoting is malformed. Displayed using best effort.", "csv-notice csv-warning"));
    }

    const scroller = this.ownerDocument.createElement("div");
    scroller.className = "csv-table-scroll";
    scroller.tabIndex = 0;
    scroller.setAttribute("aria-label", `Scrollable CSV table for ${view.name}`);
    const table = this.ownerDocument.createElement("table");
    table.className = "csv-table";
    const caption = this.ownerDocument.createElement("caption");
    caption.className = "csv-caption";
    caption.textContent = `${view.name} CSV preview${view.truncated || model.limited ? ", partial data" : ""}`;

    const head = this.ownerDocument.createElement("thead");
    const headingRow = this.ownerDocument.createElement("tr");
    const corner = this.ownerDocument.createElement("th");
    corner.className = "csv-row-number csv-corner";
    corner.scope = "col";
    corner.textContent = "#";
    headingRow.append(corner);
    const displayedColumns = Math.min(model.maximumColumns, MAX_CSV_COLUMNS);
    for (let column = 1;column <= displayedColumns;column += 1) {
      const cell = this.ownerDocument.createElement("th");
      cell.className = "csv-column-header";
      cell.scope = "col";
      cell.textContent = excelColumnLabel(column);
      headingRow.append(cell);
    }
    head.append(headingRow);

    const body = this.ownerDocument.createElement("tbody");
    const fragment = this.ownerDocument.createDocumentFragment();
    for (let rowIndex = 0;rowIndex < model.rows.length;rowIndex += 1) {
      const row = model.rows[rowIndex] ?? [];
      const tableRow = this.ownerDocument.createElement("tr");
      const rowNumber = this.ownerDocument.createElement("th");
      rowNumber.className = "csv-row-number";
      rowNumber.scope = "row";
      rowNumber.textContent = String(rowIndex + 1);
      tableRow.append(rowNumber);
      for (const value of row) {
        const cell = this.ownerDocument.createElement("td");
        cell.dir = "auto";
        cell.textContent = visibleCsvCellText(value);
        tableRow.append(cell);
      }
      fragment.append(tableRow);
    }
    body.append(fragment);
    table.append(caption, head, body);
    scroller.append(table);
    container.append(header);
    if (notices.childElementCount > 0) container.append(notices);
    container.append(scroller);
    return container;
  }
};
