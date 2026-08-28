// Dialog draft persistence: the client-side half of the rule that a
// non-temporary dialog's in-progress input survives a page refresh or a
// browser crash. Drafts are whole-value JSON under one `dsh.draft.` prefix,
// written through on every change and cleared on the gesture that ends the
// work (successful commit or explicit cancel) — never on unmount alone, so a
// crash leaves the draft behind for the next mount to restore. Storage
// failures (quota, private mode) only disable persistence, never break the
// dialog, mirroring the snapshot-store persistence posture.

/** localStorage key prefix every dialog draft shares. */
const DRAFT_PREFIX = 'dsh.draft.'

/**
 * Read one dialog draft, falling back when absent or unreadable (an
 * unreadable entry is removed).
 * @param key - draft identity (stable across mounts, unique per surface and target).
 * @param fallback - value returned when no draft survives; passing the
 * fresh-open default restores "absent member means default" semantics.
 * @returns the stored value, or the fallback.
 */
export function readDialogDraft<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback
  let raw: string | null
  try {
    raw = localStorage.getItem(DRAFT_PREFIX + key)
  } catch {
    return fallback
  }
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // A corrupt entry is stale by definition; keeping it would poison every
    // future mount, so it goes the way of an absent one.
    try {
      localStorage.removeItem(DRAFT_PREFIX + key)
    } catch {
      // Removal failing changes nothing: the entry stays ignored.
    }
    return fallback
  }
}

/**
 * Write one dialog draft (write-through; call on every change worth restoring).
 * @param key - draft identity.
 * @param value - JSON-serializable draft value.
 */
export function writeDialogDraft(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value))
  } catch (error) {
    console.error(`dialog draft '${key}' persistence failed:`, error)
  }
}

/**
 * Clear one dialog draft — the commit/cancel gesture that ends the work.
 * @param key - draft identity.
 */
export function clearDialogDraft(key: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    // A failing removal leaves a stale draft that a later clear or overwrite
    // supersedes; nothing here can act on the failure.
  }
}
