"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContractScope } from "@/domain/permissions";
import type { Role } from "@/domain/role";
import { callApi } from "@/lib/api-client";
import type { WithTempPassword } from "@/lib/users/service";

import { ContractScopeRadioGroup } from "./contract-scope-radio-group";
import { RoleRadioGroup } from "./role-radio-group";

interface AddUserFormProps {
  onCreated: (result: WithTempPassword) => void;
}

/** D17 "Thêm người dùng" panel. */
export function AddUserForm({ onCreated }: AddUserFormProps) {
  const [role, setRole] = useState<Role | null>(null);
  const [scope, setScope] = useState<ContractScope>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const username = String(data.get("username") ?? "").trim();
    const nextFieldErrors: Record<string, string> = {};
    if (!name) nextFieldErrors.name = "Vui lòng nhập họ tên";
    if (!username) nextFieldErrors.username = "Vui lòng nhập tên đăng nhập";
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError(nextFieldErrors.name ?? nextFieldErrors.username ?? null);
      return;
    }
    if (!role) {
      setError("Chọn một vai trò");
      return;
    }
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = await callApi<WithTempPassword>("/api/users", {
      method: "POST",
      body: {
        name,
        username,
        role,
        ...(role === "SALES" ? { contractScope: scope } : {}),
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    setRole(null);
    setScope("ALL");
    setFieldErrors({});
    onCreated(result.data);
  }

  return (
    <section
      aria-labelledby="new-user"
      className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <h2 id="new-user" className="text-h2">
        Thêm người dùng
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-name" required>
            Họ tên
          </Label>
          <Input
            id="new-name"
            name="name"
            required
            maxLength={100}
            aria-invalid={fieldErrors.name ? true : undefined}
            onChange={(event) => {
              if (fieldErrors.name && event.target.value.trim() !== "") {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.name;
                  return next;
                });
              }
            }}
            onBlur={(event) => {
              if (event.target.value.trim() === "") {
                setFieldErrors((prev) => ({
                  ...prev,
                  name: "Vui lòng nhập họ tên",
                }));
              }
            }}
          />
          {fieldErrors.name && error !== fieldErrors.name && (
            <p className="text-caption text-destructive">{fieldErrors.name}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-username" required>
            Tên đăng nhập
          </Label>
          <Input
            id="new-username"
            name="username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={fieldErrors.username ? true : undefined}
            aria-describedby="new-username-hint"
            onChange={(event) => {
              if (fieldErrors.username && event.target.value.trim() !== "") {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.username;
                  return next;
                });
              }
            }}
            onBlur={(event) => {
              if (event.target.value.trim() === "") {
                setFieldErrors((prev) => ({
                  ...prev,
                  username: "Vui lòng nhập tên đăng nhập",
                }));
              }
            }}
          />
          {fieldErrors.username && error !== fieldErrors.username && (
            <p className="text-caption text-destructive">
              {fieldErrors.username}
            </p>
          )}
          <span
            id="new-username-hint"
            className="text-sm text-muted-foreground"
          >
            Chữ thường không dấu, không khoảng trắng.
          </span>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label after:ml-0.5 after:text-destructive after:content-['*']">
            Vai trò
          </legend>
          <RoleRadioGroup
            value={role}
            onChange={setRole}
            shortList
            idPrefix="new-role"
          />
        </fieldset>
        {role === "SALES" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-label">Phạm vi hợp đồng</legend>
            <ContractScopeRadioGroup
              value={scope}
              onChange={setScope}
              idPrefix="new-scope"
            />
          </fieldset>
        ) : null}
        <div role="alert" className="empty:hidden">
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending ? "Đang tạo…" : "Tạo tài khoản"}
        </Button>
      </form>
    </section>
  );
}
