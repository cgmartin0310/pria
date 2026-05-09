/**
 * Simple ULID-like ID generator using crypto.randomUUID as fallback.
 * In production, install the `ulid` package for proper sortable IDs.
 */
export function createId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, "0");
  const random = Math.random().toString(36).substring(2, 18).toUpperCase().padEnd(16, "0");
  return (timestamp + random).substring(0, 26);
}
