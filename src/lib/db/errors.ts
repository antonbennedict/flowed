import { ZodError } from "zod";

export type DatabaseErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONSTRAINT"
  | "INIT_FAILED"
  | "MIGRATION_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "UNKNOWN";

/** Error type surfaced to the UI. `message` is always safe to show the user. */
export class DatabaseError extends Error {
  constructor(
    public readonly code: DatabaseErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export function validationError(err: ZodError, what: string): DatabaseError {
  const first = err.issues[0];
  const field = first?.path.join(".");
  const msg = first ? `${first.message}${field ? ` (${field})` : ""}` : "Invalid data";
  return new DatabaseError("VALIDATION", `Could not save ${what}: ${msg}`, err.issues);
}

/** Converts driver-level failures (SQLite strings, DOMExceptions) into DatabaseError. */
export function toDatabaseError(err: unknown, action: string): DatabaseError {
  if (err instanceof DatabaseError) return err;
  if (err instanceof ZodError) return validationError(err, action);
  const raw = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  if (/FOREIGN KEY constraint failed/i.test(raw))
    return new DatabaseError("CONSTRAINT", `Could not ${action}: it refers to a record that no longer exists.`, raw);
  if (/UNIQUE constraint failed|ConstraintError/i.test(raw) || name === "ConstraintError")
    return new DatabaseError("CONSTRAINT", `Could not ${action}: a record with the same id already exists.`, raw);
  if (/CHECK constraint failed/i.test(raw))
    return new DatabaseError("CONSTRAINT", `Could not ${action}: some values are out of range.`, raw);
  if (name === "QuotaExceededError" || /quota/i.test(raw))
    return new DatabaseError("QUOTA_EXCEEDED", `Could not ${action}: device storage is full.`, raw);
  return new DatabaseError("UNKNOWN", `Could not ${action}. ${raw}`.trim(), raw);
}
