"use client";

import { Printer, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { FormError } from "@/components/catalog/form-error";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isBusinessDate, type BusinessDate } from "@/domain/business-date";
import {
  CONTRACT_MESSAGES,
  CONTRACT_TYPE_LABELS,
  type ContractType,
} from "@/domain/contract";
import { DEFAULT_VAT_RATE } from "@/domain/contract-lines";
import { guaranteeWarnings } from "@/domain/guarantee";
import { formatMoney, toMoney } from "@/domain/money";
import { daysBetween } from "@/domain/business-date";
import { DEFAULT_MIN_RENTAL_DAYS } from "@/domain/rental";
import { callApi } from "@/lib/api-client";
import type { CheckLine } from "@/lib/contracts/checks";
import type { FormOptions, RevisionView } from "@/lib/contracts/queries";
import { cn } from "@/lib/utils";

import { BatchesEditor, type BatchChoice } from "./batches-editor";
import { CompensationTable } from "./compensation-table";
import { DepositsEditor } from "./deposits-editor";
import {
  catalogCompensation,
  contentBody,
  contentFromRevision,
  EMPTY_STATE,
  kitParts,
  previewContent,
  syncRentRows,
  type ContentState,
  type KitRow,
  type RentRow,
} from "./form-model";
import { RentalLines } from "./rental-lines";
import { SaleLines } from "./sale-lines";
import {
  DateFields,
  emptyTerms,
  TermsFields,
  termsBody,
  type TermsState,
} from "./terms-fields";

export interface SavedDraft {
  id: string;
  code: string;
  type: ContractType;
  customerId: string;
  siteId: string | null;
  updatedAt: string;
  view: RevisionView;
  returnedReason: string | null;
}

interface ContractFormProps {
  options: FormOptions;
  draft?: SavedDraft;
  /** Server checks of the saved draft (stock, overdue debt). */
  checks?: readonly CheckLine[];
  today: string;
}

type Save = "draft" | "submit" | "print";

function termsFrom(view: RevisionView): TermsState {
  const t = view.terms;
  return {
    signedDate: t.signedDate ?? "",
    startDate: t.startDate,
    endDate: t.endDate ?? "",
    minRentalDays: String(t.minRentalDays ?? DEFAULT_MIN_RENTAL_DAYS),
    paymentTermsDays: String(t.paymentTermsDays),
    vatEnabled: t.vatEnabled,
    vatRate: t.vatRate ? String(Number(t.vatRate)) : String(DEFAULT_VAT_RATE),
    companyTruck: t.companyTruck,
    freightPerTrip: t.freightPerTrip === null ? "" : String(t.freightPerTrip),
    note: t.note ?? "",
  };
}

const money = (value: number) => formatMoney(toMoney(value));

/** D5a: draft a contract or quote (contracts spec). */
export function ContractForm({
  options,
  draft,
  checks = [],
  today,
}: ContractFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const itemOf = useMemo(
    () => new Map(options.items.map((entry) => [entry.id, entry])),
    [options.items],
  );
  const kitOf = useMemo(
    () => new Map(options.kits.map((entry) => [entry.id, entry])),
    [options.kits],
  );
  const [type, setType] = useState<ContractType>(
    draft?.type ?? options.types[0] ?? "RENTAL",
  );
  const [customerId, setCustomerId] = useState(draft?.customerId ?? "");
  const [siteId, setSiteId] = useState(draft?.siteId ?? "");
  const [customerToken, setCustomerToken] = useState("");
  const [preview, setPreview] = useState<string | null>(draft?.code ?? null);
  const [terms, setTerms] = useState<TermsState>(() =>
    draft ? termsFrom(draft.view) : emptyTerms(),
  );
  const [content, setContent] = useState<ContentState>(() =>
    draft ? contentFromRevision(draft.view) : EMPTY_STATE,
  );
  const [refresh, setRefresh] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(draft?.updatedAt ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState<Save | null>(null);

  const customer = options.customers.find((entry) => entry.id === customerId);
  const sites = options.sites.filter(
    (entry) => entry.customerId === customerId,
  );
  const figures = previewContent(type, content, itemOf, kitOf);

  // D5a shows the number the first save would issue.
  useEffect(() => {
    if (draft || !customerId || !isBusinessDate(terms.startDate)) return;
    const query = new URLSearchParams({
      customerId,
      startDate: terms.startDate,
      customerToken,
    });
    let gone = false;
    void callApi<{ code: string; customerToken: string }>(
      `/api/contracts/code-preview?${query}`,
    ).then((result) => {
      if (gone) return;
      setPreview(result.ok ? result.data.code : null);
      if (!result.ok && result.field)
        setErrors((all) => ({ ...all, customerToken: result.error }));
    });
    return () => {
      gone = true;
    };
  }, [draft, customerId, terms.startDate, customerToken]);

  function pickCustomer(id: string) {
    setCustomerId(id);
    setSiteId("");
    const found = options.customers.find((entry) => entry.id === id);
    if (found)
      setTerms((all) => ({
        ...all,
        paymentTermsDays: String(found.paymentTermsDays),
      }));
  }

  function withCompensation(
    rows: readonly RentRow[],
    next: ContentState,
  ): ContentState {
    const compensations = { ...next.compensations };
    for (const row of rows) {
      compensations[row.itemId] ??= catalogCompensation(itemOf.get(row.itemId));
    }
    return { ...next, compensations };
  }

  function setKits(kits: KitRow[]) {
    setContent((all) => {
      const rent = syncRentRows(all.rent, kitParts(kits, kitOf), itemOf);
      return withCompensation(rent, { ...all, kits, rent });
    });
  }

  function setRent(rent: RentRow[]) {
    setContent((all) => withCompensation(rent, { ...all, rent }));
  }

  const choices: BatchChoice[] = [
    ...content.kits.map((row) => ({
      ref: `kit:${row.kitId}`,
      label: `Bộ ${kitOf.get(row.kitId)?.name ?? row.kitId}`,
    })),
    ...(type === "RENTAL" ? content.rent : content.sale).map((row) => ({
      ref: `item:${row.itemId}`,
      label: `${itemOf.get(row.itemId)?.code ?? ""} · ${itemOf.get(row.itemId)?.name ?? ""}`,
    })),
  ].filter(
    (choice, index, all) =>
      all.findIndex((entry) => entry.ref === choice.ref) === index,
  );

  const plannedDays =
    isBusinessDate(terms.startDate) && isBusinessDate(terms.endDate)
      ? daysBetween(
          terms.startDate as BusinessDate,
          terms.endDate as BusinessDate,
        )
      : null;
  const minDays = Number(terms.minRentalDays) || DEFAULT_MIN_RENTAL_DAYS;
  const expectedDays =
    plannedDays !== null && plannedDays > 0
      ? Math.max(plannedDays, minDays)
      : null;
  const guaranteeLines = content.deposits.flatMap((row) =>
    row.kind === "GUARANTEE" && isBusinessDate(row.expiryDate)
      ? guaranteeWarnings({
          guaranteeNumber: row.guaranteeNumber || "chưa có số",
          expiryDate: row.expiryDate as BusinessDate,
          today: today as BusinessDate,
          contractEndDate:
            type === "RENTAL" && isBusinessDate(terms.endDate)
              ? (terms.endDate as BusinessDate)
              : null,
        }).map((warning) => warning.message)
      : [],
  );

  async function save(mode: Save) {
    setErrors({});
    setError(null);
    const built = contentBody(type, content, itemOf, refresh);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setPending(mode);
    const body = {
      type,
      customerId,
      siteId: siteId || null,
      ...(draft ? { updatedAt } : { customerToken: customerToken || null }),
      ...termsBody(type, terms),
      ...built.body,
    };
    const result = draft
      ? await callApi<{ id: string; code: string; updatedAt: string }>(
          `/api/contracts/${draft.id}`,
          {
            method: "PUT",
            body,
          },
        )
      : await callApi<{ id: string; code: string; updatedAt: string }>(
          "/api/contracts",
          {
            method: "POST",
            body,
          },
        );
    if (!result.ok) {
      setPending(null);
      if (result.field) setErrors({ [result.field]: result.error });
      if (result.error === CONTRACT_MESSAGES.stale) setStale(true);
      setError(result.error);
      formRef.current
        ?.querySelector<HTMLElement>("[role=alert]")
        ?.scrollIntoView?.({ block: "center" });
      return;
    }
    setRefresh(false);
    setUpdatedAt(result.data.updatedAt);
    const id = result.data.id;
    if (mode === "submit") {
      const sent = await callApi(`/api/contracts/${id}/submit`, {
        method: "POST",
      });
      setPending(null);
      if (!sent.ok) {
        setError(`Đã lưu nháp, nhưng chưa gửi duyệt được: ${sent.error}`);
        if (!draft) router.push(`/sales/contracts/${id}/edit`);
        router.refresh();
        return;
      }
      router.push(`/sales/contracts/${id}`);
      router.refresh();
      return;
    }
    setPending(null);
    if (mode === "print") {
      window.open(`/sales/contracts/${id}/print`, "_blank", "noopener");
    }
    if (!draft) router.push(`/sales/contracts/${id}/edit?saved=1`);
    router.refresh();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save("draft");
  }

  const checkLines = [
    ...checks.filter(
      (line) =>
        !line.message.includes("khác danh mục") &&
        !line.message.startsWith("Bảo lãnh"),
    ),
    ...guaranteeLines.map((message) => ({ ok: false, message })),
    figures.offCatalog.rent + figures.offCatalog.compensation > 0
      ? {
          ok: false,
          message: `${figures.offCatalog.rent} giá thuê và ${figures.offCatalog.compensation} giá đền bù khác danh mục`,
        }
      : null,
  ].filter((line): line is CheckLine => line !== null);

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {draft?.returnedReason ? (
          <p
            role="status"
            className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
          >
            <strong>Giám đốc trả lại:</strong> {draft.returnedReason}
          </p>
        ) : null}
        <FormError message={error} />
        {stale ? (
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => window.location.reload()}
          >
            Tải lại hợp đồng
          </Button>
        ) : null}

        <section
          aria-labelledby="party-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="party-title" className="text-h2">
            Bên thuê và công trình
          </h2>
          <div
            role="radiogroup"
            aria-label="Loại hợp đồng"
            className="flex gap-1 self-start rounded-md bg-muted p-1"
          >
            {(["RENTAL", "SALE"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                disabled={Boolean(draft) || !options.types.includes(value)}
                onClick={() => setType(value)}
                className={cn(
                  "inline-flex h-9 items-center rounded-sm px-4 text-sm font-medium disabled:opacity-50",
                  type === value
                    ? "bg-card font-semibold shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {CONTRACT_TYPE_LABELS[value]}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer" required={!draft}>
                Nhà thầu
              </Label>
              <select
                id="customer"
                value={customerId}
                disabled={Boolean(draft)}
                aria-invalid={errors.customerId ? true : undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  pickCustomer(next);
                  if (errors.customerId && next !== "") {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.customerId;
                      return copy;
                    });
                  }
                }}
                onBlur={(event) => {
                  if (!draft && event.target.value === "") {
                    setErrors((prev) => ({
                      ...prev,
                      customerId: "Vui lòng chọn nhà thầu",
                    }));
                  }
                }}
                className="h-11 rounded-md border border-input bg-card px-3 text-base aria-invalid:border-destructive"
              >
                <option value="">Chọn nhà thầu</option>
                {options.customers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.code}
                  </option>
                ))}
              </select>
              {customer ? (
                <span className="text-caption text-muted-foreground">
                  Phụ trách: {customer.salesUserName ?? "chưa có"} · được nợ{" "}
                  {customer.paymentTermsDays} ngày
                </span>
              ) : null}
              <FieldMessage message={errors.customerId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site" required={type === "RENTAL"}>
                Công trình
              </Label>
              <select
                id="site"
                value={siteId}
                aria-invalid={errors.siteId ? true : undefined}
                onChange={(event) => {
                  const next = event.target.value;
                  setSiteId(next);
                  if (errors.siteId && next !== "") {
                    setErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.siteId;
                      return copy;
                    });
                  }
                }}
                onBlur={(event) => {
                  if (type === "RENTAL" && event.target.value === "") {
                    setErrors((prev) => ({
                      ...prev,
                      siteId: "Vui lòng chọn công trình",
                    }));
                  }
                }}
                className="h-11 rounded-md border border-input bg-card px-3 text-base aria-invalid:border-destructive"
              >
                <option value="">
                  {type === "SALE" ? "Nhận hàng tại bãi" : "Chọn công trình"}
                </option>
                {sites.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name} · {entry.code}
                  </option>
                ))}
              </select>
              <FieldMessage message={errors.siteId} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customer-token">Số hợp đồng</Label>
              {draft ? (
                <span className="flex h-11 items-center font-semibold">
                  {draft.code}
                </span>
              ) : (
                <>
                  <Input
                    id="customer-token"
                    value={customerToken}
                    onChange={(event) => setCustomerToken(event.target.value)}
                    placeholder="Phần tên khách, VD MINHPHAT"
                    aria-describedby="code-hint"
                  />
                  <span
                    id="code-hint"
                    className="text-caption text-muted-foreground"
                  >
                    {preview ? `Sẽ là ${preview} · ` : ""}Tự sinh: tháng năm /
                    viết tắt công ty - tên khách. Sửa được phần tên khách
                  </span>
                </>
              )}
              <FieldMessage message={errors.customerToken} />
            </div>
          </div>
          <DateFields
            type={type}
            terms={terms}
            errors={errors}
            onChange={(patch) => setTerms((all) => ({ ...all, ...patch }))}
          />
        </section>

        <section
          aria-labelledby="lines-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="lines-title" className="text-h2">
            {type === "RENTAL" ? "Hàng cho thuê" : "Hàng bán"}
          </h2>
          {type === "RENTAL" ? (
            <RentalLines
              kits={content.kits}
              rows={content.rent}
              items={options.items}
              kitOptions={options.kits}
              totals={figures.totals}
              dayRent={figures.dayRent}
              months={figures.months}
              errors={errors}
              onKits={setKits}
              onRows={setRent}
            />
          ) : (
            <SaleLines
              rows={content.sale}
              items={options.items}
              total={figures.saleTotal}
              errors={errors}
              onRows={(sale) => setContent((all) => ({ ...all, sale }))}
            />
          )}
          <FieldMessage message={errors.lines ?? errors.kits} />
        </section>

        <section
          aria-labelledby="terms-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="terms-title" className="text-h2">
            Điều khoản
          </h2>
          <TermsFields
            type={type}
            terms={terms}
            errors={errors}
            onChange={(patch) => setTerms((all) => ({ ...all, ...patch }))}
          />
        </section>

        {type === "RENTAL" ? (
          <section
            aria-labelledby="compensation-title"
            className="flex flex-col gap-4 rounded-lg border bg-card p-5"
          >
            <h2 id="compensation-title" className="text-h2">
              Bảng giá đền bù
            </h2>
            <CompensationTable
              rows={content.rent}
              items={options.items}
              values={content.compensations}
              errors={errors}
              onChange={(itemId, value) =>
                setContent((all) => ({
                  ...all,
                  compensations: { ...all.compensations, [itemId]: value },
                }))
              }
              onRefresh={() => {
                setRefresh(true);
                setContent((all) => ({
                  ...all,
                  compensations: Object.fromEntries(
                    all.rent.map((row) => [
                      row.itemId,
                      catalogCompensation(itemOf.get(row.itemId)),
                    ]),
                  ),
                }));
              }}
            />
          </section>
        ) : null}

        <section
          aria-labelledby="deposit-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="deposit-title" className="text-h2">
            Tiền cọc
          </h2>
          <DepositsEditor
            rows={content.deposits}
            errors={errors}
            onRows={(deposits) => setContent((all) => ({ ...all, deposits }))}
          />
        </section>

        <section
          aria-labelledby="batch-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="batch-title" className="text-h2">
            Kế hoạch giao hàng
          </h2>
          <BatchesEditor
            rows={content.batches}
            choices={choices}
            errors={errors}
            onRows={(batches) => setContent((all) => ({ ...all, batches }))}
          />
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section
          aria-labelledby="value-title"
          className="flex flex-col gap-1 rounded-lg border bg-card p-5"
        >
          <h2 id="value-title" className="text-label text-muted-foreground">
            Giá trị dự kiến
          </h2>
          <p className="text-h1 tabular-nums">
            {type === "RENTAL"
              ? expectedDays !== null
                ? money(figures.dayRent * expectedDays)
                : "–"
              : figures.saleTotal === null
                ? "–"
                : money(figures.saleTotal)}
          </p>
          <p className="text-sm text-muted-foreground">
            {type === "RENTAL" && expectedDays !== null
              ? `${expectedDays} ngày${plannedDays !== null && plannedDays < minDays ? " (tối thiểu)" : ""} × ${money(figures.dayRent)}, `
              : ""}
            chưa gồm VAT và vận chuyển
          </p>
        </section>
        <section
          aria-labelledby="check-title"
          className="flex flex-col gap-2 rounded-lg border bg-card p-5"
        >
          <h2 id="check-title" className="text-label">
            Kiểm tra trước khi gửi duyệt
          </h2>
          {checkLines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Lưu nháp để kiểm tra tồn kho cho đợt giao đầu.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {checkLines.map((line) => (
                <li
                  key={line.message}
                  className={line.ok ? "text-success" : "text-warning"}
                >
                  {line.ok ? "✓ " : "! "}
                  {line.message}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-col gap-2">
          <Button type="submit" variant="outline" disabled={pending !== null}>
            {pending === "draft" ? "Đang lưu…" : "Lưu nháp"}
          </Button>
          {draft ? (
            <Button asChild variant="outline">
              <Link href={`/sales/contracts/${draft.id}/print`} target="_blank">
                <Printer aria-hidden /> In báo giá
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void save("print")}
            >
              <Printer aria-hidden /> In báo giá
            </Button>
          )}
          <Button
            type="button"
            disabled={pending !== null}
            onClick={() => void save("submit")}
          >
            <Send aria-hidden />{" "}
            {pending === "submit" ? "Đang gửi…" : "Gửi Giám đốc duyệt"}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          Hợp đồng chỉ có hiệu lực sau khi Giám đốc duyệt. Báo giá in ra là bản
          nháp này.
        </p>
      </aside>
    </form>
  );
}
