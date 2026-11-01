"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callApi } from "@/lib/api-client";

interface ChangePasswordFormProps {
  /** Where to go once the password is changed. */
  doneHref: string;
}

const FIELDS = [
  {
    name: "currentPassword",
    label: "Mật khẩu hiện tại",
    autoComplete: "current-password",
  },
  { name: "newPassword", label: "Mật khẩu mới", autoComplete: "new-password" },
  {
    name: "confirmPassword",
    label: "Nhập lại mật khẩu mới",
    autoComplete: "new-password",
  },
] as const;

export function ChangePasswordForm({ doneHref }: ChangePasswordFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await callApi<null>("/api/me/password", {
      method: "POST",
      body: Object.fromEntries(
        FIELDS.map((field) => [field.name, String(form.get(field.name) ?? "")]),
      ),
    });
    if (result.ok) {
      // Full load: a refresh right after router.replace could cancel the
      // navigation and leave the user here with a stale session view.
      window.location.replace(doneHref);
      return;
    }
    setPending(false);
    setError(result.error);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            name={field.name}
            type="password"
            required
            autoComplete={field.autoComplete}
            className="h-12 rounded-lg"
            aria-describedby={
              field.name === "newPassword" ? "password-hint" : undefined
            }
          />
          {field.name === "newPassword" ? (
            <p id="password-hint" className="text-sm text-muted-foreground">
              Ít nhất 8 ký tự. Một cụm từ dễ nhớ là tốt nhất, ví dụ “bai sau
              kho”.
            </p>
          ) : null}
        </div>
      ))}

      <div role="alert" className="empty:hidden">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}
