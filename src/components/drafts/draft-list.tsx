"use client";

// "Chưa gửi · lưu trên máy này" on M7 (spec mobile-history, mobile-drafts):
// continue, resend now, or delete after asking.
import Link from "next/link";
import { useState } from "react";

import { ToneBadge } from "@/components/domain/tone-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/domain/business-date";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { draftsChanged, outboxFor } from "@/lib/drafts/runtime";
import {
  draftStore,
  isStale,
  type DraftRecord,
  type DraftState,
} from "@/lib/drafts/store";

import { draftHref } from "./draft-links";

const STATE_LABELS: Readonly<Record<DraftState, string>> = {
  EDITING: "Đang làm",
  QUEUED: "Chờ gửi",
  SENDING: "Đang gửi",
  REJECTED: "Bị từ chối",
};

const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

interface DraftListProps {
  userId: string;
  drafts: DraftRecord[];
  now: Date;
}

export function DraftList({ userId, drafts, now }: DraftListProps) {
  const online = useOnlineStatus();
  const [removing, setRemoving] = useState<DraftRecord | null>(null);
  if (drafts.length === 0) return null;
  return (
    <section aria-labelledby="drafts-title" className="flex flex-col gap-3">
      <h2 id="drafts-title" className="text-label text-muted-foreground">
        Chưa gửi · lưu trên máy này
      </h2>
      {drafts.map((draft) => {
        const [what, ...rest] = draft.title.split(" ");
        const waiting = draft.state === "QUEUED" || draft.state === "SENDING";
        return (
          <article
            key={draft.draftId}
            aria-label={draft.title}
            className="flex flex-col gap-3 rounded-lg border-2 border-warning bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-label">
                {what} · {rest.join(" ").split(" · ")[0]}
              </p>
              <ToneBadge
                tone={draft.state === "REJECTED" ? "destructive" : "warning"}
              >
                {STATE_LABELS[draft.state]}
              </ToneBadge>
              {isStale(draft, now) && (
                <ToneBadge tone="muted">Nháp cũ</ToneBadge>
              )}
            </div>
            <p className="text-body text-muted-foreground">
              Nháp lúc {formatDateTime(new Date(draft.updatedAt)).slice(11)} ·{" "}
              {draft.progress}
            </p>
            {draft.error && (
              <p className="text-body text-destructive">{draft.error}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {waiting ? (
                <Button
                  type="button"
                  className="h-12"
                  disabled={!online || draft.state === "SENDING"}
                  onClick={() => void outboxFor(userId).submit(draft.draftId)}
                >
                  Gửi lại
                </Button>
              ) : (
                <Button asChild className="h-12">
                  <Link href={draftHref(draft)}>Tiếp tục</Link>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-12"
                onClick={() => setRemoving(draft)}
              >
                Xóa nháp
              </Button>
            </div>
          </article>
        );
      })}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Xóa nháp {lowerFirst(removing?.title.split(" · ")[0] ?? "")}?
            </AlertDialogTitle>
            <AlertDialogDescription>Số đã đếm sẽ mất.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (removing) await draftStore().remove(removing.draftId);
                setRemoving(null);
                draftsChanged.emit();
              }}
            >
              Xóa nháp
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
