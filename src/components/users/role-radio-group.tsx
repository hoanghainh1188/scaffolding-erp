"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ROLE_LABELS, type Role } from "@/domain/role";
import { cn } from "@/lib/utils";

import { ALL_ROLES, COMMON_NEW_ROLES, ROLE_DESCRIPTIONS } from "./role-info";

interface RoleRadioGroupProps {
  value: Role | null;
  onChange: (role: Role) => void;
  /** Start with the 3 common roles and a "Xem cả 5 vai trò" link. */
  shortList?: boolean;
  idPrefix: string;
}

/** One role per person (requirements 0.5 #6), as cards with a description. */
export function RoleRadioGroup({
  value,
  onChange,
  shortList = false,
  idPrefix,
}: RoleRadioGroupProps) {
  const [showAll, setShowAll] = useState(!shortList);
  const roles =
    showAll || (value !== null && !COMMON_NEW_ROLES.includes(value))
      ? ALL_ROLES
      : COMMON_NEW_ROLES;

  return (
    <div className="flex flex-col gap-2">
      <RadioGroup
        value={value ?? ""}
        onValueChange={(next) => onChange(next as Role)}
        aria-label="Vai trò"
        className="gap-2"
      >
        {roles.map((role) => {
          const id = `${idPrefix}-${role}`;
          return (
            <Label
              key={role}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 font-normal",
                value === role && "border-2 border-primary px-[11px] py-[9px]",
              )}
            >
              <RadioGroupItem
                id={id}
                value={role}
                className="mt-0.5"
                aria-labelledby={`${id}-label`}
                aria-describedby={`${id}-hint`}
              />
              <span className="flex flex-col gap-0.5">
                <span id={`${id}-label`} className="text-label">
                  {ROLE_LABELS[role]}
                </span>
                <span
                  id={`${id}-hint`}
                  className="text-sm text-muted-foreground"
                >
                  {ROLE_DESCRIPTIONS[role]}
                </span>
              </span>
            </Label>
          );
        })}
      </RadioGroup>
      {roles.length < ALL_ROLES.length ? (
        <button
          type="button"
          className="self-start text-sm font-semibold text-primary underline-offset-4 hover:underline"
          onClick={() => setShowAll(true)}
        >
          Xem cả 5 vai trò
        </button>
      ) : null}
    </div>
  );
}
