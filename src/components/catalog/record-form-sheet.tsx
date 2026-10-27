"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { callApi } from "@/lib/api-client";

import { FormError } from "./form-error";
import { useCatalogAction } from "./use-catalog-action";

export type FieldValue = string | number | null | undefined;

export interface FormField {
  name: string;
  label: string;
  kind?: "text" | "number" | "select" | "textarea" | "tel";
  options?: { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  /** Shown but not sent (e.g. the customer of a site, fixed). */
  readOnly?: boolean;
  inputMode?: "numeric" | "text";
}

interface RecordFormSheetProps {
  title: string;
  description?: string;
  trigger: ReactNode;
  fields: FormField[];
  values?: Record<string, FieldValue>;
  /** Fetched when the sheet opens (the supplier edit form's full CCCD). */
  loadValues?: string;
  /** Sent with the form, e.g. a fixed customerId. */
  extra?: Record<string, unknown>;
  path: string;
  method: "POST" | "PATCH";
  submitLabel: string;
}

function readValue(field: FormField, raw: FormDataEntryValue | null): unknown {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (field.kind === "number") return text === "" ? undefined : Number(text);
  return text === "" ? null : text;
}

/**
 * A Sheet form built from a field list, for the simple D16 records. The
 * server checks every rule and its message is shown as is.
 */
export function RecordFormSheet({
  title,
  description,
  trigger,
  fields,
  values = {},
  loadValues,
  extra = {},
  path,
  method,
  submitLabel,
}: RecordFormSheetProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<Record<string, FieldValue> | null>(null);
  const action = useCatalogAction();
  const current = loaded ?? values;
  const waiting = loadValues !== undefined && loaded === null;

  async function onOpenChange(next: boolean) {
    setOpen(next);
    action.setError(null);
    if (!next) {
      setLoaded(null);
      return;
    }
    if (loadValues) {
      const result = await callApi<Record<string, FieldValue>>(loadValues);
      if (result.ok) setLoaded(result.data);
      else action.setError(result.error);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { ...extra };
    for (const field of fields) {
      if (field.readOnly) continue;
      const value = readValue(field, form.get(field.name));
      if (value !== undefined) body[field.name] = value;
    }
    const saved = await action.run(path, { method, body });
    if (saved) setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        {waiting ? (
          <p className="px-4 text-sm text-muted-foreground">Đang tải…</p>
        ) : (
          <form
            onSubmit={submit}
            className="flex flex-col gap-4 px-4 pb-6"
            noValidate
          >
            {fields.map((field) => {
              const id = `field-${field.name}`;
              const value = current[field.name];
              const common = {
                id,
                name: field.name,
                defaultValue:
                  value === null || value === undefined ? "" : String(value),
                disabled: field.readOnly,
                "aria-describedby": field.hint ? `${id}-hint` : undefined,
              };
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.kind === "select" ? (
                    <select
                      {...common}
                      className="h-11 rounded-md border border-input bg-card px-3 text-base"
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.kind === "textarea" ? (
                    <textarea
                      {...common}
                      rows={3}
                      className="rounded-md border border-input bg-card px-3 py-2 text-base"
                    />
                  ) : (
                    <Input
                      {...common}
                      type={field.kind === "tel" ? "tel" : "text"}
                      inputMode={
                        field.kind === "number" ? "numeric" : field.inputMode
                      }
                      required={field.required}
                    />
                  )}
                  {field.hint ? (
                    <span
                      id={`${id}-hint`}
                      className="text-sm text-muted-foreground"
                    >
                      {field.hint}
                    </span>
                  ) : null}
                </div>
              );
            })}
            <FormError message={action.error} />
            <Button
              type="submit"
              size="lg"
              className="h-12"
              disabled={action.pending}
            >
              {action.pending ? "Đang lưu…" : submitLabel}
            </Button>
          </form>
        )}
        {waiting ? <FormError message={action.error} /> : null}
      </SheetContent>
    </Sheet>
  );
}
