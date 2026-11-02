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
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!role) {
      setError("Chọn một vai trò");
      return;
    }
    const data = new FormData(form);
    setPending(true);
    setError(null);
    const result = await callApi<WithTempPassword>("/api/users", {
      method: "POST",
      body: {
        name: String(data.get("name") ?? ""),
        username: String(data.get("username") ?? ""),
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
          <Label htmlFor="new-name">Họ tên</Label>
          <Input id="new-name" name="name" required maxLength={100} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-username">Tên đăng nhập</Label>
          <Input
            id="new-username"
            name="username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="new-username-hint"
          />
          <span
            id="new-username-hint"
            className="text-sm text-muted-foreground"
          >
            Chữ thường không dấu, không khoảng trắng.
          </span>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label">Vai trò</legend>
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
