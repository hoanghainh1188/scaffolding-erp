import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  const m = manifest();

  it("installs the mobile area as a standalone app", () => {
    expect(m.name).toBe("Scaffolding ERP");
    expect(m.short_name).toBe("Kho");
    expect(m.start_url).toBe("/m");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("vi");
  });

  it("takes its colours from the design tokens", () => {
    expect(m.theme_color).toBe("#1D5BFF");
    expect(m.background_color).toBe("#F7F9FF");
  });

  it("has 192 and 512 pixel icons", () => {
    expect(m.icons?.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });
});
