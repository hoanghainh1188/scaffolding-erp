"use client";

// "Làm mới" (dashboard-basic design D4): the server computes every block
// again; the shell stays. No timer refreshes the page.
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} />
      {pending ? "Đang làm mới…" : "Làm mới"}
    </Button>
  );
}
