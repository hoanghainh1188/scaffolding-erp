"use client";

// Kỳ báo cáo of D15 (spec management-reports "Chọn kỳ trên D15"): Tháng /
// Quý / Năm and the period, both kept in the URL; "Xuất Excel" downloads
// the period on screen.
import { DownloadIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Segmented } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import type { PeriodKind } from "@/domain/report-period";

export interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodPickerProps {
  kind: PeriodKind;
  value: string;
  options: readonly PeriodOption[];
  /** The value each kind opens on (the one holding this period). */
  switchTo: Readonly<Record<PeriodKind, string>>;
}

const KINDS = [
  { value: "month", label: "Tháng" },
  { value: "quarter", label: "Quý" },
  { value: "year", label: "Năm" },
] as const;

export const reportHref = (kind: PeriodKind, value: string) =>
  `/reports?period=${kind}&value=${encodeURIComponent(value)}`;

export function PeriodPicker({
  kind,
  value,
  options,
  switchTo,
}: PeriodPickerProps) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Segmented
        label="Loại kỳ"
        value={kind}
        options={KINDS}
        onChange={(next) => router.push(reportHref(next, switchTo[next]))}
      />
      <select
        aria-label="Kỳ"
        value={value}
        onChange={(event) => router.push(reportHref(kind, event.target.value))}
        className="h-11 w-44 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button asChild variant="secondary" className="h-11">
        <a
          href={`/api/reports/export?period=${kind}&value=${encodeURIComponent(value)}`}
          download
        >
          <DownloadIcon aria-hidden /> Xuất Excel
        </a>
      </Button>
    </div>
  );
}
