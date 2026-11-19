// Characters that make Excel, LibreOffice Calc or Google Sheets read a cell as a formula
// (OWASP "CSV Injection"). Tab and carriage return are included because some spreadsheets
// strip them and then read the next character.
const FORMULA_TRIGGER = /^[\s]*[=+\-@\t\r]/;

/**
 * Converts an untrusted value into one quoted CSV cell.
 * - A value that a spreadsheet could read as a formula gets a leading apostrophe,
 *   so it is shown as text and never runs.
 * - Double quotes are doubled, and the cell is always wrapped in double quotes.
 */
export function toCsvCell(value: string): string {
  const neutralised = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return `"${neutralised.replace(/"/g, '""')}"`;
}

export function toCsvRow(values: string[], separator = ';'): string {
  return values.map(toCsvCell).join(separator);
}
