/**
 * Escape a value interpolated into a PocketBase filter string.
 * PocketBase uses double-quoted string literals; backslash and quotes must be escaped.
 */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** `field = "escapedValue"` */
export function pbEqual(field: string, value: string): string {
  return `${field} = "${escapeFilterValue(value)}"`;
}
