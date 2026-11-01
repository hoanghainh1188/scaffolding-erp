// Centralized UI dictionary export for Scaffolding ERP.
// Both React Server Components and Client Components import from this entry.

import { activity } from "./vi/activity";
import { auth } from "./vi/auth";
import { catalog } from "./vi/catalog";
import { common } from "./vi/common";
import { inventory } from "./vi/inventory";
import { navigation } from "./vi/navigation";
import { purchasing } from "./vi/purchasing";
import { receiving } from "./vi/receiving";
import { repairs } from "./vi/repairs";
import { stocktake } from "./vi/stocktake";
import { users } from "./vi/users";

export const dict = {
  common,
  auth,
  navigation,
  purchasing,
  receiving,
  inventory,
  repairs,
  stocktake,
  catalog,
  users,
  activity,
} as const;

export type Dictionary = typeof dict;

/**
 * Access the active dictionary. In the future, this can accept a locale parameter
 * (e.g. getDictionary("en")) for full multi-language support.
 */
export function getDictionary(): Dictionary {
  return dict;
}
