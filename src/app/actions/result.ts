export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/**
 * Turn a database error into a message the user can read. Known cases get a
 * specific message; anything else is logged on the server and shown as generic
 * (never the raw database text).
 */
export function dbFail(error: { code?: string; message: string }): ActionResult<never> {
  if (error.code === "23P01") return fail("errors.slot_taken");
  if (error.code === "23503") return fail("errors.not_found");
  console.error("[db]", error.code, error.message);
  return fail("errors.generic");
}
