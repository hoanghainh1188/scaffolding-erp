import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface AppBarProps {
  title: string;
  /** Detail pages pass where "back" goes. */
  backHref?: string;
}

export function AppBar({ title, backHref }: AppBarProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-card pt-[env(safe-area-inset-top)] print:hidden">
      <div className="flex h-14 items-center gap-1 px-[max(1rem,env(safe-area-inset-left))]">
        {backHref && (
          <Button asChild variant="ghost" size="icon" className="-ml-2">
            <Link href={backHref} aria-label="Quay lại">
              <ChevronLeft aria-hidden className="size-6" />
            </Link>
          </Button>
        )}
        <h1 className="truncate font-display text-h2">{title}</h1>
      </div>
    </header>
  );
}
