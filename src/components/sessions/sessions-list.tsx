"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DeviceSessionRow } from "@/domain/device-session";
import { callApi } from "@/lib/api-client";
import { TWO_FACTOR_PATH } from "@/lib/auth/paths";
import { dict } from "@/locales";

const TEXT = dict.auth.sessions;
const BUTTON_SIZE = "h-12 sm:h-10";

type Confirm = { kind: "one"; row: DeviceSessionRow } | { kind: "others" };
type Notice = { tone: "success" | "error"; text: string };

interface SessionsListProps {
  rows: DeviceSessionRow[];
  twoFactorEnabled: boolean;
}

/** The signed-in devices with their sign-out actions (Sessions.dc.html). */
export function SessionsList({ rows, twoFactorEnabled }: SessionsListProps) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const others = rows.filter((row) => !row.isCurrent).length;

  async function signOutOne(row: DeviceSessionRow) {
    setBusy(true);
    const result = await callApi<{ signedOut: true }>(
      `/api/me/sessions/${encodeURIComponent(row.id)}/sign-out`,
      { method: "POST" },
    );
    setBusy(false);
    setConfirm(null);
    setNotice(
      result.ok
        ? { tone: "success", text: TEXT.signedOutOne(row.deviceName) }
        : { tone: "error", text: result.error },
    );
    router.refresh();
  }

  async function signOutOthers() {
    setBusy(true);
    const result = await callApi<{ count: number; forgotten: number }>(
      "/api/me/sessions/sign-out-others",
      { method: "POST" },
    );
    setBusy(false);
    setConfirm(null);
    setNotice(
      result.ok
        ? {
            tone: "success",
            text: TEXT.signedOutOthers(
              result.data.count,
              result.data.forgotten,
            ),
          }
        : { tone: "error", text: result.error },
    );
    router.refresh();
  }

  return (
    <>
      <p className="text-body text-muted-foreground">
        {TEXT.summary(rows.length)}
      </p>

      <div role="status" className="empty:hidden">
        {notice ? (
          <p
            className={
              notice.tone === "success"
                ? "rounded-lg border bg-accent px-3 py-2 text-sm text-accent-foreground"
                : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col rounded-2xl border bg-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t px-5 py-4 first:border-t-0"
          >
            <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                {row.deviceName}
                {row.isCurrent ? <Badge>{TEXT.thisDevice}</Badge> : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                {TEXT.signedIn(row.signedIn)} ·{" "}
                {row.isCurrent ? TEXT.inUse : TEXT.lastActive(row.lastActive)}
              </p>
            </div>
            {row.isCurrent ? null : (
              <Button
                type="button"
                variant="outline"
                className={BUTTON_SIZE}
                onClick={() => setConfirm({ kind: "one", row })}
              >
                {TEXT.signOutOne}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">{TEXT.note}</p>

      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          variant="outline"
          className={`${BUTTON_SIZE} text-destructive`}
          disabled={others === 0}
          onClick={() => setConfirm({ kind: "others" })}
        >
          {TEXT.signOutOthers}
        </Button>
        {others === 0 ? (
          <p className="text-sm text-muted-foreground">{TEXT.noOthers}</p>
        ) : null}
      </div>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "one"
                ? TEXT.confirmOneTitle(confirm.row.deviceName)
                : TEXT.confirmOthersTitle(others)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "one"
                ? TEXT.confirmOneBody
                : TEXT.confirmOthersBody(others)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {twoFactorEnabled && confirm?.kind === "one" ? (
            <p className="text-sm text-muted-foreground">
              {TEXT.lostBefore}
              <Link href={TWO_FACTOR_PATH} className="underline">
                {TEXT.lostLink}
              </Link>
              {TEXT.lostAfter}
            </p>
          ) : null}
          {twoFactorEnabled && confirm?.kind === "others" ? (
            <p className="text-sm text-muted-foreground">
              {TEXT.confirmOthersTrusted}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{TEXT.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (confirm?.kind === "one") void signOutOne(confirm.row);
                else void signOutOthers();
              }}
            >
              {confirm?.kind === "one"
                ? TEXT.confirmOneAction
                : TEXT.confirmOthersAction(others)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
