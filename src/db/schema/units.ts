import { sql } from "drizzle-orm";

import { QUANTITY_UNITS } from "../../domain/quantity";

/** The 9 units of src/domain/quantity.ts, for CHECK constraints. */
export const UNIT_SQL = sql.raw(
  `(${QUANTITY_UNITS.map((unit) => `'${unit}'`).join(", ")})`,
);
