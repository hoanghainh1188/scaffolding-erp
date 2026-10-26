import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CONDITIONS, type Condition } from "@/domain/condition";
import {
  DISPLAY_DOCUMENT_STATUSES,
  type DisplayDocumentStatus,
} from "@/domain/document-status";
import { LOCATION_TYPES } from "@/domain/location-type";

import { ConditionBadge } from "./condition-badge";
import { DocumentStatusBadge } from "./document-status-badge";
import { LocationBadge } from "./location-badge";

const CONDITION_EXPECTED: Record<Condition, [string, string]> = {
  NEW: ["Mới", "highlight"],
  GOOD: ["Tốt", "success"],
  NEEDS_REPAIR: ["Chờ sửa", "warning"],
  SCRAP: ["Phế liệu", "muted"],
};

const STATUS_EXPECTED: Record<DisplayDocumentStatus, [string, string]> = {
  DRAFT: ["Nháp", "muted"],
  PENDING_APPROVAL: ["Chờ duyệt", "warning"],
  IN_PROGRESS: ["Đang xử lý", "primary"],
  DONE: ["Hoàn thành", "success"],
  OVERDUE: ["Quá hạn", "destructive"],
};

describe("ConditionBadge", () => {
  it.each(CONDITIONS)("shows %s with its label and token", (condition) => {
    const [label, tone] = CONDITION_EXPECTED[condition];
    render(<ConditionBadge condition={condition} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute("data-tone", tone);
  });

  it("uses four different tokens", () => {
    const tones = new Set(CONDITIONS.map((c) => CONDITION_EXPECTED[c][1]));
    expect(tones.size).toBe(4);
  });
});

describe("DocumentStatusBadge", () => {
  it.each(DISPLAY_DOCUMENT_STATUSES)(
    "shows %s with its label and token",
    (status) => {
      const [label, tone] = STATUS_EXPECTED[status];
      render(<DocumentStatusBadge status={status} />);
      expect(screen.getByText(label)).toHaveAttribute("data-tone", tone);
    },
  );
});

describe("LocationBadge", () => {
  it.each([
    ["YARD", "Tại bãi"],
    ["WORKSHOP", "Tại xưởng"],
    ["SITE", "Tại công trình"],
  ] as const)("shows %s as %s", (type, label) => {
    render(<LocationBadge type={type} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("covers every location type", () => {
    expect(LOCATION_TYPES).toHaveLength(3);
  });
});

describe("tone styles", () => {
  it("fills highlight with its foreground pair", () => {
    render(<ConditionBadge condition="NEW" />);
    expect(screen.getByText("Mới")).toHaveClass(
      "bg-highlight",
      "text-highlight-foreground",
    );
  });

  it("outlines success and warning on card", () => {
    render(<ConditionBadge condition="GOOD" />);
    expect(screen.getByText("Tốt")).toHaveClass(
      "border-success",
      "text-success",
      "bg-card",
    );
  });

  it("keeps extra class names", () => {
    render(<ConditionBadge condition="SCRAP" className="ml-2" />);
    expect(screen.getByText("Phế liệu")).toHaveClass("ml-2", "bg-muted");
  });
});
