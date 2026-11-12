"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { NumericInput } from "@/components/domain/numeric-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatBusinessDate, toBusinessDate } from "@/domain/business-date";
import { needsDataNotice } from "@/domain/personal-data";
import { toSearchText } from "@/domain/search-text";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { callApi } from "@/lib/api-client";

import { DATA_NOTICE_FIELD, DataNoticeBlock } from "./data-notice-block";
import { FormError } from "./form-error";
import { useCatalogAction } from "./use-catalog-action";

export type FieldValue = string | number | null | undefined;

export interface FormField {
  name: string;
  label: string;
  /** "search-select": a select with a filter box, accents ignored. */
  kind?:
    | "text"
    | "number"
    | "select"
    | "search-select"
    | "textarea"
    | "tel"
    | "checkbox";
  options?: { value: string; label: string }[];
  /** First empty option of a select, e.g. "Chọn tỉnh/thành". */
  placeholder?: string;
  /** Shown without calling the server when the field is left empty. */
  requiredMessage?: string;
  /** Label of the filter box of a search-select. */
  searchLabel?: string;
  hint?: string;
  required?: boolean;
  /** Shown but not sent (e.g. the customer of a site, fixed). */
  readOnly?: boolean;
  /** "numeric": digits only (CCCD, last 4 digits of an account). */
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
  /** Seller forms: the notice and its tick (personal-data-protection D6). */
  withDataNotice?: boolean;
  /** The notice on a create form; an edit form loads its own. */
  noticeText?: string;
}

/** Extra fields of the supplier edit data. */
interface LoadedValues extends Record<string, unknown> {
  notice?: { text: string };
  dataNotice?: { at: string; byName: string } | null;
}

function typedValues(form: HTMLFormElement): Record<string, unknown> {
  return Object.fromEntries(new FormData(form).entries());
}

function readValue(field: FormField, raw: FormDataEntryValue | null): unknown {
  if (field.kind === "checkbox") return raw === "on";
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
  withDataNotice = false,
  noticeText,
}: RecordFormSheetProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<LoadedValues | null>(null);
  const [typed, setTyped] = useState<Record<string, unknown> | null>(null);
  const action = useCatalogAction();
  const current: Record<string, unknown> = loaded ?? values;
  const waiting = loadValues !== undefined && loaded === null;
  const noticeRecord = withDataNotice ? (loaded?.dataNotice ?? null) : null;
  const notice = loaded?.notice?.text ?? noticeText ?? "";
  const live = typed ?? current;
  const showNotice =
    withDataNotice &&
    noticeRecord === null &&
    needsDataNotice(String(live.kind ?? ""), live);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    action.setError(null);
    setTyped(null);
    if (!next) {
      setLoaded(null);
      return;
    }
    if (loadValues) {
      const result = await callApi<LoadedValues>(loadValues);
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
      if (field.requiredMessage && (value === null || value === undefined)) {
        action.setError(field.requiredMessage);
        return;
      }
      if (value !== undefined) body[field.name] = value;
    }
    if (showNotice)
      body[DATA_NOTICE_FIELD] = form.get(DATA_NOTICE_FIELD) === "on";
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
            onChange={(event) => setTyped(typedValues(event.currentTarget))}
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
              if (field.kind === "checkbox") {
                return (
                  <div key={field.name} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      name={field.name}
                      defaultChecked={value === true}
                      disabled={field.readOnly}
                    />
                    <Label htmlFor={id}>{field.label}</Label>
                  </div>
                );
              }
              return (
                <div key={field.name} className="flex flex-col gap-1.5">
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.kind === "search-select" ? (
                    <SearchSelect field={field} common={common} />
                  ) : field.kind === "select" ? (
                    <select
                      {...common}
                      className="h-11 rounded-md border border-input bg-card px-3 text-base"
                    >
                      {field.placeholder !== undefined ? (
                        <option value="">{field.placeholder}</option>
                      ) : null}
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
                  ) : field.kind === "number" ||
                    field.inputMode === "numeric" ? (
                    <NumericInput
                      {...common}
                      kind="integer"
                      required={field.required}
                    />
                  ) : (
                    <Input
                      {...common}
                      type={field.kind === "tel" ? "tel" : "text"}
                      inputMode={field.inputMode}
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
            {noticeRecord ? (
              <p className="text-sm text-muted-foreground">
                Đã thông báo ngày{" "}
                {formatBusinessDate(toBusinessDate(new Date(noticeRecord.at)))},{" "}
                {noticeRecord.byName}
              </p>
            ) : null}
            {showNotice ? <DataNoticeBlock text={notice} /> : null}
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

interface SearchSelectProps {
  field: FormField;
  common: {
    id: string;
    name: string;
    defaultValue: string;
    disabled?: boolean;
    "aria-describedby"?: string;
  };
}

/** A select whose options a filter box narrows: "tay ninh" finds Tây Ninh. */
function SearchSelect({ field, common }: SearchSelectProps) {
  const [query, setQuery] = useState("");
  const [value, setValue] = useState(common.defaultValue);
  const term = toSearchText(query);
  const options = (field.options ?? []).filter(
    (option) =>
      option.value === value ||
      term === "" ||
      toSearchText(option.label).includes(term),
  );
  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        aria-label={field.searchLabel ?? field.label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={field.searchLabel}
        disabled={common.disabled}
      />
      <select
        id={common.id}
        name={common.name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={common.disabled}
        aria-describedby={common["aria-describedby"]}
        className="h-11 rounded-md border border-input bg-card px-3 text-base"
      >
        <option value="">{field.placeholder ?? ""}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
