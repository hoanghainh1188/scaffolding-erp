"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CONTRACT_SCOPE_LABELS,
  CONTRACT_SCOPES,
  type ContractScope,
} from "@/domain/permissions";
import { cn } from "@/lib/utils";

const SCOPE_HINTS: Readonly<Record<ContractScope, string>> = {
  ALL: "Xem và lập cả hợp đồng cho thuê lẫn hợp đồng bán",
  RENTAL: "Chỉ thấy và lập hợp đồng cho thuê",
  SALE: "Chỉ thấy và lập hợp đồng bán",
};

interface ContractScopeRadioGroupProps {
  value: ContractScope;
  onChange: (scope: ContractScope) => void;
  idPrefix: string;
}

/** Contract scope of a SALES account (0.2 #51), as cards like the roles. */
export function ContractScopeRadioGroup({
  value,
  onChange,
  idPrefix,
}: ContractScopeRadioGroupProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as ContractScope)}
      aria-label="Phạm vi hợp đồng"
      className="gap-2"
    >
      {CONTRACT_SCOPES.map((scope) => {
        const id = `${idPrefix}-${scope}`;
        return (
          <Label
            key={scope}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 font-normal",
              value === scope && "border-2 border-primary px-[11px] py-[9px]",
            )}
          >
            <RadioGroupItem
              id={id}
              value={scope}
              className="mt-0.5"
              aria-labelledby={`${id}-label`}
              aria-describedby={`${id}-hint`}
            />
            <span className="flex flex-col gap-0.5">
              <span id={`${id}-label`} className="text-label">
                {CONTRACT_SCOPE_LABELS[scope]}
              </span>
              <span id={`${id}-hint`} className="text-sm text-muted-foreground">
                {SCOPE_HINTS[scope]}
              </span>
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

/** "Kinh doanh · Chỉ cho thuê" on D17; other roles show the role alone. */
export function roleWithScope(
  roleLabel: string,
  role: string,
  scope: ContractScope,
): string {
  return role === "SALES"
    ? `${roleLabel} · ${CONTRACT_SCOPE_LABELS[scope]}`
    : roleLabel;
}
