// All UI text in one place, grouped by area. Vietnamese only: there is no
// locale switch, so code imports `dict` directly.
import { auth } from "./vi/auth";
import { catalog } from "./vi/catalog";
import { inventory } from "./vi/inventory";
import { navigation } from "./vi/navigation";
import { purchasing } from "./vi/purchasing";
import { receiving } from "./vi/receiving";
import { repairs } from "./vi/repairs";
import { stocktake } from "./vi/stocktake";
import { users } from "./vi/users";

export const dict = {
  auth,
  navigation,
  purchasing,
  receiving,
  inventory,
  repairs,
  stocktake,
  catalog,
  users,
} as const;
