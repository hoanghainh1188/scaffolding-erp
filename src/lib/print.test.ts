// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { printDocument } from "./print";

afterEach(() => {
  vi.restoreAllMocks();
  document.title = "";
});

describe("printDocument", () => {
  it("opens the browser print dialog once", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument();
    expect(print).toHaveBeenCalledOnce();
  });

  it("uses the given title while printing and restores it afterwards", () => {
    document.title = "Scaffolding ERP";
    let titleDuringPrint = "";
    vi.spyOn(window, "print").mockImplementation(() => {
      titleDuringPrint = document.title;
    });

    printDocument({ title: "Phieu-nhap-PN0001" });

    expect(titleDuringPrint).toBe("Phieu-nhap-PN0001");
    expect(document.title).toBe("Phieu-nhap-PN0001");
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Scaffolding ERP");
  });

  it("keeps the title when none is given", () => {
    document.title = "Scaffolding ERP";
    vi.spyOn(window, "print").mockImplementation(() => {});
    printDocument();
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe("Scaffolding ERP");
  });
});
