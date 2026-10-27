// The stored costs must always agree with the ledger (inventory-ledger
// design D6). `npm run inventory:check` runs this; tests run it after every
// scenario.
import { sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import { CONDITION_LABELS, type Condition } from "@/domain/condition";
import { formatMoney, toMoney } from "@/domain/money";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  type QuantityUnit,
} from "@/domain/quantity";

interface Row extends Record<string, unknown> {
  code: string;
  unit: QuantityUnit;
  condition: Condition;
  stored_avg: string | null;
  stored_pool: string | null;
  ledger_avg: string | null;
  ledger_pool: string | null;
}

const money = (value: string | null) =>
  value === null ? "–" : formatMoney(toMoney(Number(value)));
// Pieces are stored with three decimals too; read them as thousandths.
const amount = (value: string | null, unit: QuantityUnit) =>
  `${formatQuantity(quantityFromDb(value ?? "0", "KG"))} ${QUANTITY_UNIT_LABELS[unit]}`;

/** One line per (item + condition) whose stored cost disagrees. */
export async function reconcileInventory(db: Database): Promise<string[]> {
  const rows = await db.execute<Row>(sql`
    with ledger as (
      select item_id, condition,
             sum(quantity) as pool,
             (array_agg(avg_cost_after order by id desc))[1] as avg
      from inventory_ledger
      group by item_id, condition
    )
    select i.code, i.unit, coalesce(c.condition, l.condition) as condition,
           c.avg_cost::text as stored_avg, c.pool_quantity::text as stored_pool,
           l.avg::text as ledger_avg, l.pool::text as ledger_pool
    from inventory_cost c
    full join ledger l on l.item_id = c.item_id and l.condition = c.condition
    join item i on i.id = coalesce(c.item_id, l.item_id)
    order by i.code, condition
  `);
  const problems: string[] = [];
  for (const row of rows) {
    const label = `${row.code} ${CONDITION_LABELS[row.condition]}`;
    const storedPool = quantityFromDb(row.stored_pool ?? "0", "KG").milli;
    const ledgerPool = quantityFromDb(row.ledger_pool ?? "0", "KG").milli;
    if (row.stored_avg !== row.ledger_avg) {
      problems.push(
        `${label}: giá BQ ${money(row.stored_avg)}, sổ kho ${money(row.ledger_avg)}`,
      );
    }
    if (storedPool !== ledgerPool) {
      problems.push(
        `${label}: tồn ${amount(row.stored_pool, row.unit)}, sổ kho ${amount(row.ledger_pool, row.unit)}`,
      );
    }
  }
  return problems;
}
