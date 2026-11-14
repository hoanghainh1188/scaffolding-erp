"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const DATA_NOTICE_FIELD = "dataNoticeConfirmed";
const CHECKBOX_ID = "field-dataNoticeConfirmed";

/** The sentence to read to the seller, and the tick that records it (D6). */
export function DataNoticeBlock({ text }: { text: string }) {
  return (
    <section
      aria-label="Thông báo cho người bán"
      className="flex flex-col gap-3 rounded-lg border bg-accent p-3"
    >
      <p className="text-sm">{text}</p>
      <div className="flex items-center gap-2">
        <Checkbox id={CHECKBOX_ID} name={DATA_NOTICE_FIELD} />
        <Label htmlFor={CHECKBOX_ID} required>
          Đã thông báo cho người bán
        </Label>
      </div>
    </section>
  );
}
