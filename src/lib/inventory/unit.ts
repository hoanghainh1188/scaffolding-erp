import { isQuantityUnit, type QuantityUnit } from "@/domain/quantity";

/**
 * The unit of an item row. The DB CHECK keeps it to the known units, so an
 * unknown one is a programming error, never a user mistake.
 */
export function unitFromDb(value: string): QuantityUnit {
  if (!isQuantityUnit(value)) throw new Error(`Unknown unit ${value}`);
  return value;
}
