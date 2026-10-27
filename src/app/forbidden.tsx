import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Không có quyền" };

/** Rendered by forbidden(): the role lacks the page's permission (D7). */
export default function Forbidden() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <section className="flex max-w-md flex-col items-start gap-4 rounded-lg border bg-card p-6">
        <span className="grid size-11 place-items-center rounded-md bg-highlight text-highlight-foreground">
          <ShieldAlert aria-hidden className="size-5" />
        </span>
        <h1 className="text-h2">Bạn không có quyền xem trang này</h1>
        <p className="text-body text-muted-foreground">
          Trang này dành cho vai trò khác. Nếu bạn cần dùng, hãy nhờ Giám đốc
          đổi vai trò trong Cài đặt › Người dùng.
        </p>
        {/* "/" goes to the dashboard, which sends phone roles on to /m. */}
        <Button asChild>
          <Link href="/">Về trang chính</Link>
        </Button>
      </section>
    </main>
  );
}
