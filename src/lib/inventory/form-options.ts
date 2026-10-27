// Choices for the adjustment form: active items and active places.
import type { Database } from "@/db/client";
import { listItems } from "@/lib/catalog/items";
import { listLocations } from "@/lib/catalog/places";

const ORDER = { YARD: 0, WORKSHOP: 1, SITE: 2 } as const;

export async function adjustmentFormOptions(db: Database) {
  const [{ items }, places] = await Promise.all([
    listItems(db),
    listLocations(db),
  ]);
  return {
    items: items.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit,
    })),
    // Yards and workshops first: most adjustments happen there.
    places: [...places]
      .sort(
        (a, b) => ORDER[a.type] - ORDER[b.type] || a.code.localeCompare(b.code),
      )
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
      })),
  };
}
