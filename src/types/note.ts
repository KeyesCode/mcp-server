// Shared shape for a note in our tiny "database".
// Keeping types in their own folder makes it easy to grow later
// (e.g. add a Tag type, a User type, etc.) without rewiring imports.

export interface Note {
  /** Unique identifier — we just use the title slug + timestamp for simplicity. */
  id: string;
  /** Human-readable title supplied by the caller. */
  title: string;
  /** Free-form body text supplied by the caller. */
  body: string;
  /** ISO-8601 timestamp of when the note was saved. */
  createdAt: string;
}
