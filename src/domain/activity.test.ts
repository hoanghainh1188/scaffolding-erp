import { describe, expect, it } from "vitest";

import {
  ACTION_GROUPS,
  ACTIVITY_ACTIONS,
  APPROVAL_TILE_ACTIONS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  EDIT_TILE_ACTIONS,
  GROUP_ACTIONS,
  WORKING_HOURS,
  actionLabel,
  detectBrowser,
  deviceText,
  isOffHours,
} from "./activity";
import { detectDevice } from "./device";

describe("actions and groups (design D3)", () => {
  it("puts every action in exactly one filter group", () => {
    const grouped = ACTION_GROUPS.flatMap((group) => GROUP_ACTIONS[group]);
    expect([...grouped].sort()).toEqual([...ACTIVITY_ACTIONS].sort());
  });

  it("groups like D18's filter chips", () => {
    expect(GROUP_ACTIONS.APPROVAL).toEqual([
      "SUBMIT",
      "SEND",
      "APPROVE",
      "POST",
      "CLOSE_PERIOD",
      "SETTLE",
    ]);
    expect(GROUP_ACTIONS.REVERSAL).toEqual([
      "RETURN",
      "RECALL",
      "REJECT",
      "CANCEL",
      "CLOSE",
      "DELETE_DRAFT",
      "DELETE",
      "ANONYMIZE",
    ]);
  });

  it("counts approve, post, closing a period and settling, not submit, on the 'Duyệt, ghi sổ' tile", () => {
    expect(APPROVAL_TILE_ACTIONS).toEqual([
      "APPROVE",
      "POST",
      "CLOSE_PERIOD",
      "SETTLE",
    ]);
    expect(APPROVAL_TILE_ACTIONS).not.toContain("SUBMIT");
    expect(APPROVAL_TILE_ACTIONS).not.toContain("SEND");
  });

  it("counts edits and reversals on the 'Sửa, xóa, trả lại' tile", () => {
    expect(EDIT_TILE_ACTIONS).toEqual(["UPDATE", ...GROUP_ACTIONS.REVERSAL]);
  });

  it("labels submitting an order 'Đặt đơn'", () => {
    expect(actionLabel("SUBMIT", "PURCHASE_ORDER")).toBe("Đặt đơn");
    expect(actionLabel("SUBMIT", "STOCKTAKE")).toBe("Gửi duyệt");
    expect(actionLabel("DELETE_DRAFT", "REPAIR_ORDER")).toBe("Xóa nháp");
    expect(actionLabel("SIGN_IN", null)).toBe("Đăng nhập");
    expect(actionLabel("REJECT", "COMPENSATION_NOTE")).toBe("Từ chối");
    expect(actionLabel("RETURN", "REPAIR_ORDER")).toBe("Trả lại xưởng");
    expect(actionLabel("ASSIGN", "REPAIR_ORDER")).toBe("Giao xưởng");
    expect(actionLabel("REPORT", "PRODUCTION_ORDER")).toBe("Báo làm xong");
    expect(actionLabel("RETURN", "PRODUCTION_ORDER")).toBe("Trả lại xưởng");
    expect(actionLabel("APPROVE", "PRODUCTION_ORDER")).toBe(
      "Duyệt vượt định mức",
    );
    expect(actionLabel("APPROVE", "CONTRACT")).toBe("Duyệt");
    expect(GROUP_ACTIONS.UPDATE).toEqual([
      "UPDATE",
      "START",
      "ASSIGN",
      "RECEIVE",
      "REPORT",
      "COUNT",
    ]);
  });

  it("labels every document type", () => {
    expect(DOCUMENT_TYPES.every((type) => DOCUMENT_TYPE_LABELS[type])).toBe(
      true,
    );
  });
});

// 28/10/2026 in Vietnam (UTC+7, no daylight saving).
const vn = (clock: string) => new Date(`2026-10-28T${clock}+07:00`);

describe("isOffHours (design D8)", () => {
  it.each([
    ["20:59:59", false],
    ["21:00:00", true],
    ["22:47:13", true],
    ["05:59:59", true],
    ["06:00:00", false],
    ["07:41:00", false],
    ["00:00:00", true],
  ])("%s Vietnam time → off hours %s", (clock, expected) => {
    expect(isOffHours(vn(clock), WORKING_HOURS)).toBe(expected);
  });

  it("reads Vietnam time, not UTC", () => {
    // 27/10 23:30 UTC is 06:30 on 28/10 in Vietnam.
    expect(isOffHours(new Date("2026-10-27T23:30:00Z"), WORKING_HOURS)).toBe(
      false,
    );
    // 27/10 22:30 UTC is 05:30 on 28/10 in Vietnam.
    expect(isOffHours(new Date("2026-10-27T22:30:00Z"), WORKING_HOURS)).toBe(
      true,
    );
  });

  it("takes the working hours as a parameter", () => {
    const office = { start: "07:00", end: "17:00" };
    expect(isOffHours(vn("17:00:00"), office)).toBe(true);
    expect(isOffHours(vn("16:59:59"), office)).toBe(false);
    expect(isOffHours(vn("06:30:00"), office)).toBe(true);
  });
});

const AGENTS = {
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  coccoc:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/130.0.180 Chrome/124.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  firefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
};

describe("detectBrowser", () => {
  it.each([
    ["edge", "EDGE", "Máy tính · Edge"],
    ["chromeAndroid", "CHROME", "Điện thoại · Chrome"],
    ["coccoc", "COCCOC", "Máy tính · Cốc Cốc"],
    ["safariIphone", "SAFARI", "Điện thoại · Safari"],
    ["firefox", "FIREFOX", "Máy tính · Firefox"],
    ["chromeIphone", "CHROME", "Điện thoại · Chrome"],
  ] as const)("%s", (name, browser, text) => {
    const agent = AGENTS[name];
    expect(detectBrowser(agent)).toBe(browser);
    expect(deviceText(detectDevice(agent), detectBrowser(agent))).toBe(text);
  });

  it("calls a missing or odd agent 'Khác'", () => {
    expect(detectBrowser(null)).toBe("OTHER");
    expect(detectBrowser("")).toBe("OTHER");
    expect(detectBrowser("curl/8.7.1")).toBe("OTHER");
    expect(deviceText(detectDevice(null), detectBrowser(null))).toBe(
      "Máy tính · Khác",
    );
  });
});
