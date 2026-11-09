"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { printDocument } from "@/lib/print";
import { dict } from "@/locales";

const TEXT = dict.auth.twoFactor;

/** The codes, shown only while this component is on screen. */
export function BackupCodeList({ codes }: { codes: readonly string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={TEXT.backupRow}
        className="grid gap-x-5 gap-y-2 rounded-xl border bg-card px-5 py-4 font-mono text-[15px] leading-[26px] font-semibold sm:grid-cols-2"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-3 print:hidden">
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? TEXT.copied : TEXT.copy}
        </Button>
        <Button type="button" variant="outline" onClick={() => printDocument()}>
          {TEXT.print}
        </Button>
      </div>
    </div>
  );
}
