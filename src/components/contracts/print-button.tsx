"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { printDocument } from "@/lib/print";

/** Prints the page; the title is the PDF file name ("Báo giá 112026/…"). */
export function PrintButton({ title }: { title: string }) {
  return (
    <Button onClick={() => printDocument({ title })}>
      <Printer aria-hidden /> In
    </Button>
  );
}
