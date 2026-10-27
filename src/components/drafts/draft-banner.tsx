"use client";

// "N phiếu chưa gửi" at the top of M1 (spec mobile-home): read from this
// phone only, so it shows even after the signal drops.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/business-date";
import { useDrafts } from "@/hooks/use-drafts";

import { draftHref } from "./draft-links";

export function DraftBanner({ userId }: { userId: string }) {
  const drafts = useDrafts(userId);
  const [latest] = drafts ?? [];
  if (!latest) return null;
  return (
    <section
      aria-label="Phiếu chưa gửi"
      className="flex items-center gap-3 rounded-lg border-2 border-warning bg-card p-4"
    >
      <p className="flex-1 text-body">
        <span className="font-semibold">{drafts?.length} phiếu chưa gửi:</span>{" "}
        {latest.title.split(" · ")[0]}, nháp lúc{" "}
        {formatDateTime(new Date(latest.updatedAt)).slice(11)}
      </p>
      <Button asChild className="h-12">
        <Link href={draftHref(latest)}>Tiếp tục</Link>
      </Button>
    </section>
  );
}
