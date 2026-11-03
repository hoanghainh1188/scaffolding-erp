// M1 "Thu hồi" (spec mobile-home): the button that opens M4 and the return
// notes posted today. Not counted in today's tasks; no money shown.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/business-date";
import type { ReturnListRow } from "@/lib/returns/queries";

/** "trả 100, mất 2": pieces need no unit on this short row. */
const shortText = (text: string) => text.replace(/ cái/g, "");

export function ReturnHome({ notes }: { notes: readonly ReturnListRow[] }) {
  return (
    <section
      aria-labelledby="returns-title"
      data-mask
      className="flex flex-col gap-3"
    >
      <h2 id="returns-title" className="text-h3">
        Thu hồi
      </h2>
      {notes.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {notes.map((note) => (
            <li key={note.code}>
              <Link
                href={`/m/returns/${note.code}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent"
              >
                <span className="min-w-0 flex-1 truncate text-body">
                  {note.code} · {note.siteName} · {shortText(note.text)}
                </span>
                <span className="text-body text-muted-foreground tabular-nums">
                  {formatDateTime(new Date(note.postedAt)).slice(11)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Button asChild className="h-12">
        <Link href="/m/returns/new">Nhập thu hồi</Link>
      </Button>
    </section>
  );
}
