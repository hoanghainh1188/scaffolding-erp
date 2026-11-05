// The D14 list query read from the URL (receivables design D7).
import { describe, expect, it } from "vitest";

import { balanceQuery } from "./respond";

const read = (search: string) =>
  balanceQuery(new URL(`http://localhost/api/receivables/customers${search}`));

describe("balanceQuery", () => {
  it("defaults to owing customers, page 1", () => {
    expect(read("")).toEqual({ filter: "owing", q: "", page: 1 });
  });

  it("keeps a known filter, the search and the page", () => {
    expect(read("?filter=overdue&q=minh&page=3")).toEqual({
      filter: "overdue",
      q: "minh",
      page: 3,
    });
  });

  it("falls back on an unknown filter and a bad page", () => {
    expect(read("?filter=x&page=-2")).toEqual({
      filter: "owing",
      q: "",
      page: 1,
    });
    expect(read("?page=abc").page).toBe(1);
  });
});
