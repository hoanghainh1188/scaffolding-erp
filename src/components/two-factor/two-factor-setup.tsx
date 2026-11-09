"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/api-client";
import { signOutAction } from "@/lib/auth/actions";
import { dict } from "@/locales";

import { BackupCodeList } from "./backup-code-list";
import { BrandPanel } from "./brand-panel";
import { QrCode } from "./qr-code";

const TEXT = dict.auth.twoFactor;

interface SetupData {
  totpUri: string;
  secretText: string;
  backupCodes: string[];
}

function ErrorLine({ message }: { message: string | null }) {
  return (
    <div role="alert" className="empty:hidden">
      {message ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1">{title}</h1>
      <p className="text-body text-muted-foreground">{body}</p>
    </div>
  );
}

/** Turning the second factor on (design TwoFactor.dc.html, three steps). */
export function TwoFactorSetup({ doneHref }: { doneHref: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password"));
    const result = await post<SetupData>("setup", { password });
    if (result.ok) {
      setSetup(result.data);
      setStep(2);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code"));
    const result = await post<{ enabled: true }>("confirm", { code });
    if (result.ok) setStep(3);
  }

  return (
    <div className="flex min-h-dvh flex-wrap bg-background text-foreground">
      <BrandPanel headline={TEXT.panelSetup}>
        <ol className="hidden flex-col gap-3.5 font-medium lg:flex">
          {TEXT.steps.map((label, index) => {
            const current = index + 1 === step;
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-3 ${current ? "font-bold" : "opacity-70"}`}
              >
                <span
                  className={`grid size-7 flex-none place-items-center rounded-full border-[1.5px] text-sm ${current ? "border-card bg-card text-primary" : "border-current"}`}
                >
                  {index + 1}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      </BrandPanel>

      <main className="flex flex-[1_1_420px] items-center px-4 py-8 sm:px-14 sm:py-12">
        <div className="flex w-full max-w-[440px] flex-col gap-5">
          {step === 1 ? (
            <>
              <Heading title={TEXT.setupTitle} body={TEXT.setupSubtitle} />
              <form onSubmit={submitPassword} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">{TEXT.currentPassword}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    className="h-12 rounded-lg"
                  />
                </div>
                <ErrorLine message={error} />
                <Button
                  type="submit"
                  size="lg"
                  className="h-13"
                  disabled={pending}
                >
                  {TEXT.continue}
                </Button>
              </form>
              <form action={signOutAction} className="self-end">
                <button
                  type="submit"
                  className="min-h-11 text-sm text-primary underline-offset-4 hover:underline"
                >
                  {TEXT.signOut}
                </button>
              </form>
            </>
          ) : null}

          {step === 2 && setup ? (
            <>
              <Heading title={TEXT.scanTitle} body={TEXT.scanSubtitle} />
              <div className="flex flex-wrap items-start gap-6">
                <div className="flex-none -rotate-2 rounded-2xl border bg-card p-3.5">
                  <QrCode value={setup.totpUri} label={TEXT.qrLabel} />
                </div>
                <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                  <span className="text-label">{TEXT.manualKey}</span>
                  <p
                    data-testid="two-factor-secret"
                    className="rounded-lg bg-secondary px-3 py-2.5 font-mono text-sm leading-6 font-semibold break-words"
                  >
                    {setup.secretText}
                  </p>
                </div>
              </div>
              <form onSubmit={submitCode} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">{TEXT.scanCodeLabel}</Label>
                  <Input
                    id="code"
                    name="code"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="h-16 rounded-lg text-center text-[32px] font-semibold tracking-[0.3em] tabular-nums"
                  />
                </div>
                <ErrorLine message={error} />
                <Button
                  type="submit"
                  size="lg"
                  className="h-13"
                  disabled={pending}
                >
                  {TEXT.confirm}
                </Button>
              </form>
            </>
          ) : null}

          {step === 3 && setup ? (
            <>
              <Heading title={TEXT.saveTitle} body={TEXT.saveSubtitle} />
              <BackupCodeList codes={setup.backupCodes} />
              <Label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-body font-normal print:hidden">
                <Checkbox
                  checked={saved}
                  onCheckedChange={(value) => setSaved(value === true)}
                  className="size-5"
                />
                {TEXT.saved}
              </Label>
              <Button
                type="button"
                size="lg"
                className="h-13 print:hidden"
                disabled={!saved}
                onClick={() => window.location.replace(doneHref)}
              >
                {TEXT.finish}
              </Button>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
