"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginPathFor } from "@/lib/auth/paths";
import { NumericInput } from "@/components/domain/numeric-input";
import { dict } from "@/locales";

const TEXT = dict.auth.twoFactor;

interface TwoFactorStepProps {
  action: (form: FormData) => void;
  pending: boolean;
  error: string | null;
  username: string;
  next: string | null;
}

/** The second half of /login (design Login-TwoFactor.dc.html). */
export function TwoFactorStep({
  action,
  pending,
  error,
  username,
  next,
}: TwoFactorStepProps) {
  const [useBackup, setUseBackup] = useState(false);

  return (
    <form
      action={action}
      data-login-step="code"
      className="flex w-full max-w-[400px] flex-col gap-5"
    >
      <input type="hidden" name="step" value="code" />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-2">
        <h1 className="text-h1">
          {useBackup ? TEXT.backupTitle : TEXT.codeTitle}
        </h1>
        <p className="text-body text-muted-foreground">
          {useBackup ? TEXT.backupSubtitle : TEXT.codeSubtitle(username)}
        </p>
      </div>

      {useBackup ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">{TEXT.backupLabel}</Label>
          <Input
            key="backup"
            id="code"
            name="code"
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className="h-12 rounded-lg text-center font-semibold tracking-[0.08em]"
            aria-describedby={error ? "code-error" : undefined}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">{TEXT.codeLabel}</Label>
            <NumericInput
              key="app"
              id="code"
              name="code"
              required
              autoFocus
              kind="integer"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="h-16 rounded-lg text-center text-[32px] font-semibold tracking-[0.3em] tabular-nums"
              aria-describedby={error ? "code-error" : undefined}
            />
          </div>
          <Label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-body font-normal">
            <Checkbox name="trustDevice" className="mt-0.5 size-5" />
            <span className="flex flex-col">
              {TEXT.trustDevice}
              <span className="text-caption text-muted-foreground">
                {TEXT.trustDeviceHint}
              </span>
            </span>
          </Label>
        </>
      )}

      <div role="alert" id="code-error" className="empty:hidden">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="h-13" disabled={pending}>
        {pending ? TEXT.confirming : TEXT.confirm}
      </Button>

      {useBackup ? null : (
        <p className="text-caption text-muted-foreground">{TEXT.clockHint}</p>
      )}

      <div className="flex justify-between gap-4 text-sm">
        <button
          type="button"
          className="min-h-11 text-primary underline-offset-4 hover:underline"
          onClick={() => setUseBackup((value) => !value)}
        >
          {useBackup ? TEXT.useApp : TEXT.useBackup}
        </button>
        <a
          href={loginPathFor(next)}
          className="flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
        >
          {TEXT.backToLogin}
        </a>
      </div>
    </form>
  );
}
