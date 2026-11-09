"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/api-client";
import { dict } from "@/locales";

import { BackupCodeList } from "./backup-code-list";
import { BrandPanel } from "./brand-panel";

const TEXT = dict.auth.twoFactor;

type Open = "regenerate" | "replace" | "forget" | null;

interface TwoFactorManageProps {
  backupCodesLeft: number;
  trustedDevices: number;
}

function Row({
  title,
  hint,
  action,
  onClick,
}: {
  title: string;
  hint: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t px-5 py-4 first:border-t-0">
      <div className="flex min-w-0 flex-[1_1_240px] flex-col">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      <Button type="button" variant="outline" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (id: string) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/** Second factor already on (design TwoFactor.dc.html, last frames). */
export function TwoFactorManage({
  backupCodesLeft,
  trustedDevices,
}: TwoFactorManageProps) {
  const [open, setOpen] = useState<Open>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  function close() {
    setOpen(null);
    setError(null);
  }

  async function post<T>(path: string, body: unknown) {
    setPending(true);
    setError(null);
    const result = await callApi<T>(`/api/me/two-factor/${path}`, {
      method: "POST",
      body,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
    return result;
  }

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    const result = await post<{ backupCodes: string[] }>("backup-codes", {
      password,
    });
    if (result.ok) {
      setOpen(null);
      setNewCodes(result.data.backupCodes);
    }
  }

  async function replace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await post<{ enabled: false }>("replace", {
      password: String(form.get("password")),
      code: String(form.get("code")),
    });
    if (result.ok) window.location.reload();
  }

  async function forget() {
    const result = await post<{ forgotten: number }>("forget-devices", {});
    if (result.ok) window.location.reload();
  }

  const errorLine = (
    <div role="alert" className="empty:hidden">
      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-wrap bg-background text-foreground">
      <BrandPanel headline={TEXT.panelManage}>
        <span className="inline-flex rounded-full bg-highlight px-3.5 py-1 text-sm font-bold text-highlight-foreground">
          {TEXT.active}
        </span>
      </BrandPanel>

      <main className="flex flex-[1_1_420px] items-center px-4 py-8 sm:px-14 sm:py-12">
        <div className="flex w-full max-w-[640px] flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-h1">{TEXT.manageTitle}</h1>
            <p className="text-body text-muted-foreground">
              {TEXT.manageSubtitle}
            </p>
          </div>
          <div className="flex flex-col rounded-2xl border bg-card">
            <Row
              title={TEXT.backupRow}
              hint={TEXT.backupLeft(backupCodesLeft)}
              action={TEXT.regenerate}
              onClick={() => setOpen("regenerate")}
            />
            <Row
              title={TEXT.devicesRow}
              hint={TEXT.devicesLeft(trustedDevices)}
              action={TEXT.forget}
              onClick={() => setOpen("forget")}
            />
            <Row
              title={TEXT.phoneRow}
              hint={TEXT.phoneHint}
              action={TEXT.replace}
              onClick={() => setOpen("replace")}
            />
          </div>
        </div>
      </main>

      <Dialog open={open === "regenerate"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TEXT.regenerateTitle}</DialogTitle>
            <DialogDescription>{TEXT.regenerateBody}</DialogDescription>
          </DialogHeader>
          <form onSubmit={regenerate} className="flex flex-col gap-4">
            <Field id="regen-password" label={TEXT.currentPassword}>
              {(id) => (
                <Input
                  id={id}
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              )}
            </Field>
            {errorLine}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {TEXT.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {TEXT.regenerate}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "replace"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TEXT.replace}</DialogTitle>
            <DialogDescription>{TEXT.replaceBody}</DialogDescription>
          </DialogHeader>
          <form onSubmit={replace} className="flex flex-col gap-4">
            <Field id="replace-password" label={TEXT.currentPassword}>
              {(id) => (
                <Input
                  id={id}
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              )}
            </Field>
            <Field id="replace-code" label={TEXT.codeOrBackup}>
              {(id) => (
                <Input
                  id={id}
                  name="code"
                  required
                  autoComplete="one-time-code"
                />
              )}
            </Field>
            {errorLine}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {TEXT.cancel}
              </Button>
              <Button type="submit" disabled={pending}>
                {TEXT.replace}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "forget"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TEXT.forget}</DialogTitle>
            <DialogDescription>{TEXT.forgetBody}</DialogDescription>
          </DialogHeader>
          {errorLine}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {TEXT.cancel}
            </Button>
            <Button type="button" disabled={pending} onClick={forget}>
              {TEXT.forget}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newCodes !== null}
        onOpenChange={() => window.location.reload()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{TEXT.newCodesTitle}</DialogTitle>
            <DialogDescription>{TEXT.saveSubtitle}</DialogDescription>
          </DialogHeader>
          <BackupCodeList codes={newCodes ?? []} />
          <DialogFooter>
            <Button type="button" onClick={() => window.location.reload()}>
              {TEXT.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
