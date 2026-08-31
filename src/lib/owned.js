import { store } from '../state/store.js';

export function currentUserId() {
  return store.currentUser?.id || null;
}

/** Stamp user_id on a row or array of rows. No-op if not signed in (DB default still applies). */
export function withUserId(rowOrRows) {
  const uid = currentUserId();
  if (!uid) return rowOrRows;
  if (Array.isArray(rowOrRows)) return rowOrRows.map((r) => withUserId(r));
  if (!rowOrRows || typeof rowOrRows !== 'object') return rowOrRows;
  return { ...rowOrRows, user_id: uid };
}

/** Drop identity/owner fields so inserts allocate new ids for the current user. */
export function asNewOwnedRows(rows) {
  return (rows || []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    const { id, user_id, ...rest } = row;
    return withUserId(rest);
  });
}
