"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { DateInput } from "@/components/domain/date-input";
import { FormError } from "@/components/catalog/form-error";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  addDays,
  formatBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";
import { DEFAULT_VAT_RATE } from "@/domain/contract-lines";
import { formatMoney, toMoney } from "@/domain/money";
import { quantityFromDb } from "@/domain/quantity";
import { DEFAULT_MIN_RENTAL_DAYS } from "@/domain/rental";
import { callApi } from "@/lib/api-client";
import type { AmendmentDetail, FormOptions } from "@/lib/contracts/queries";

import { BatchesEditor, type BatchChoice } from "./batches-editor";
import { CompensationTable } from "./compensation-table";
import { DepositsEditor } from "./deposits-editor";
import {
  catalogCompensation,
  contentBody,
  contentFromRevision,
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
  TermsFields,
  termsBody,
  type TermsState,
} from "./terms-fields";

interface AmendmentFormProps {
  detail: AmendmentDetail;
  options: FormOptions;
}

const money = (value: number | null) =>
  value === null ? "–" : formatMoney(toMoney(value));

/** D5b: change an approved contract; the director approves again (0.2 #16). */
export function AmendmentForm({ detail, options }: AmendmentFormProps) {
  const router = useRouter();
  const { head, amendment, base, impact, changes, can } = detail;
  const type = head.type;
  const editable = can.edit;
  const itemOf = useMemo(
    () => new Map(options.items.map((entry) => [entry.id, entry])),
    [options.items],
  );
  const kitOf = useMemo(
    () => new Map(options.kits.map((entry) => [entry.id, entry])),
    [options.kits],
  );
  const t = amendment.terms;
  const [effectiveFrom, setEffectiveFrom] = useState(amendment.effectiveFrom);
  const [reason, setReason] = useState(amendment.reason ?? "");
  const [terms, setTerms] = useState<TermsState>({
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
  });
  const [content, setContent] = useState<ContentState>(() =>
    contentFromRevision(amendment),
  );
  const [updatedAt, setUpdatedAt] = useState(amendment.updatedAt);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"draft" | "submit" | "cancel" | null>(
    null,
  );

  const figures = previewContent(type, content, itemOf, kitOf);
  const baseline = new Map(
    base.lines.map((line) => [
      line.itemId,
      {
        quantityMilli: quantityFromDb(line.quantity, "KG").milli,
        price: line.price,
      },
    ]),
  );
  const compensationBaseline = new Map(
    base.compensations.map((entry) => [
      entry.itemId,
      { lost: entry.lostPrice, damage: entry.damagePrice },
    ]),
  );
  const fixedItems = new Set(base.lines.map((line) => line.itemId));

  function withCompensation(
    rows: readonly RentRow[],
    next: ContentState,
  ): ContentState {
    const compensations = { ...next.compensations };
    for (const row of rows)
      compensations[row.itemId] ??= catalogCompensation(itemOf.get(row.itemId));
    return { ...next, compensations };
  }
  const setKits = (kits: KitRow[]) =>
    setContent((all) => {
      const rent = syncRentRows(all.rent, kitParts(kits, kitOf), itemOf);
      return withCompensation(rent, { ...all, kits, rent });
    });
  const setRent = (rent: RentRow[]) =>
    setContent((all) => withCompensation(rent, { ...all, rent }));

  const choices: BatchChoice[] = [
    ...content.kits.map((row) => ({
      ref: `kit:${row.kitId}`,
      label: `Bộ ${kitOf.get(row.kitId)?.name ?? ""}`,
    })),
    ...(type === "RENTAL" ? content.rent : content.sale).map((row) => ({
      ref: `item:${row.itemId}`,
      label: `${itemOf.get(row.itemId)?.code ?? ""} · ${itemOf.get(row.itemId)?.name ?? ""}`,
    })),
  ].filter(
    (choice, index, all) =>
      all.findIndex((entry) => entry.ref === choice.ref) === index,
  );

  const path = `/api/contracts/${head.id}/amendments/${amendment.number}`;

  async function save(mode: "draft" | "submit") {
    setErrors({});
    setError(null);
    const built = contentBody(type, content, itemOf, false);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setPending(mode);
    const result = await callApi<{ updatedAt: string }>(path, {
      method: "PUT",
      body: {
        effectiveFrom,
        reason: reason || null,
        updatedAt,
        ...termsBody(type, terms),
        ...built.body,
      },
    });
    if (!result.ok) {
      setPending(null);
      if (result.field) setErrors({ [result.field]: result.error });
      setError(result.error);
      return;
    }
    setUpdatedAt(result.data.updatedAt);
    if (mode === "submit") {
      const sent = await callApi(`${path}/submit`, { method: "POST" });
      if (!sent.ok)
        setError(`Đã lưu nháp, nhưng chưa gửi duyệt được: ${sent.error}`);
    }
    setPending(null);
    router.refresh();
  }

  async function cancel() {
    setPending("cancel");
    const result = await callApi(`${path}/cancel`, {
      method: "POST",
      body: { reason: "Hủy phụ lục" },
    });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/sales/contracts/${head.id}`);
    router.refresh();
  }

  const beforeTotal = type === "RENTAL" ? base.dayRent : base.value;
  const afterTotal = type === "RENTAL" ? figures.dayRent : figures.saleTotal;

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void save("draft");
      }}
      noValidate
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">
          Hợp đồng đã duyệt không sửa thẳng. Phụ lục cần Giám đốc duyệt lại mới
          có hiệu lực.
        </p>
        {amendment.returnedReason && amendment.status === "DRAFT" ? (
          <p
            role="status"
            className="rounded-lg border border-warning bg-card px-4 py-3 text-sm"
          >
            <strong>Giám đốc trả lại:</strong> {amendment.returnedReason}
          </p>
        ) : null}
        <FormError message={error} />

        <section
          aria-labelledby="amend-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="amend-title" className="text-h2">
            Nội dung phụ lục
          </h2>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effective-from">Hiệu lực từ ngày</Label>
              <DateInput
                id="effective-from"
                value={effectiveFrom}
                disabled={!editable}
                onValueChange={setEffectiveFrom}
                aria-describedby="effective-hint"
              />
              <span
                id="effective-hint"
                className="text-caption text-muted-foreground"
              >
                {impact.lastClosedEnd
                  ? `Không trước ngày chốt kỳ gần nhất (${formatBusinessDate(impact.lastClosedEnd)})`
                  : "Chưa có kỳ nào được chốt"}
              </span>
              <FieldMessage message={errors.effectiveFrom} />
            </div>
            <div className="flex min-w-64 flex-1 flex-col gap-1.5">
              <Label htmlFor="amend-reason">Lý do</Label>
              <textarea
                id="amend-reason"
                value={reason}
                maxLength={500}
                disabled={!editable}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-16 rounded-md border border-input bg-card px-3 py-2 text-base"
              />
            </div>
          </div>
          <DateFields
            type={type}
            terms={terms}
            errors={errors}
            fixedStart
            disabled={!editable}
            onChange={(patch) => setTerms((all) => ({ ...all, ...patch }))}
          />
        </section>

        <section
          aria-labelledby="lines-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="lines-title" className="text-h2">
            Hàng và giá
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
              baseline={baseline}
              fixedItems={fixedItems}
              disabled={!editable}
            />
          ) : (
            <SaleLines
              rows={content.sale}
              items={options.items}
              total={figures.saleTotal}
              errors={errors}
              disabled={!editable}
              onRows={(sale) => setContent((all) => ({ ...all, sale }))}
            />
          )}
          <p className="text-sm text-muted-foreground">
            Ô viền cam là chỗ đổi. Dòng không đổi vẫn hiện để đối chiếu.
          </p>
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
            disabled={!editable}
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
              baseline={compensationBaseline}
              disabled={!editable}
              onChange={(itemId, value) =>
                setContent((all) => ({
                  ...all,
                  compensations: { ...all.compensations, [itemId]: value },
                }))
              }
            />
          </section>
        ) : null}

        <section
          aria-labelledby="deposit-title"
          className="flex flex-col gap-4 rounded-lg border bg-card p-5"
        >
          <h2 id="deposit-title" className="text-h2">
            Cọc và bảo lãnh
          </h2>
          <DepositsEditor
            rows={content.deposits}
            errors={errors}
            disabled={!editable}
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
            disabled={!editable}
            onRows={(batches) => setContent((all) => ({ ...all, batches }))}
          />
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <section
          aria-labelledby="after-title"
          className="flex flex-col gap-1 rounded-lg border bg-card p-5"
        >
          <h2 id="after-title" className="text-label text-muted-foreground">
            {type === "RENTAL"
              ? "Tiền thuê 1 ngày sau phụ lục"
              : "Tổng tiền sau phụ lục"}
          </h2>
          <p className="text-h1 tabular-nums">{money(afterTotal)}</p>
          {beforeTotal !== null && afterTotal !== null ? (
            <p className="text-sm text-muted-foreground">
              Trước đó {money(beforeTotal)} ·{" "}
              {afterTotal >= beforeTotal ? "tăng" : "giảm"}{" "}
              {money(Math.abs(afterTotal - beforeTotal))}
            </p>
          ) : null}
        </section>
        <section
          aria-labelledby="impact-title"
          className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
        >
          <h2 id="impact-title" className="text-label">
            Ảnh hưởng tới tiền thuê
          </h2>
          <ul className="flex flex-col gap-1.5">
            {impact.lastClosedEnd ? (
              <li>
                Kỳ đến {formatBusinessDate(impact.lastClosedEnd)} · Đã chốt ·
                không đổi
              </li>
            ) : null}
            {impact.oldPriceFrom && impact.oldPriceTo ? (
              <li>
                {formatBusinessDate(impact.oldPriceFrom)} –{" "}
                {formatBusinessDate(impact.oldPriceTo)} · Giá cũ
              </li>
            ) : null}
            <li>
              Từ {formatBusinessDate(effectiveFrom || impact.newPriceFrom)} ·
              Giá mới
            </li>
          </ul>
          <p className="text-muted-foreground">
            Hàng thêm chỉ tính tiền từ ngày thực giao, không từ ngày hiệu lực.
          </p>
        </section>
        {changes.length > 0 ? (
          <section
            aria-labelledby="changes-title"
            className="flex flex-col gap-2 rounded-lg border bg-card p-5 text-sm"
          >
            <h2 id="changes-title" className="text-label">
              Thay đổi đã lưu
            </h2>
            <ul className="flex flex-col gap-1">
              {changes.map((change) => (
                <li key={change.field}>
                  {change.label}: {change.before ?? "–"} →{" "}
                  <strong>{change.after ?? "–"}</strong>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {editable ? (
          <div className="flex flex-col gap-2">
            <Button type="submit" variant="outline" disabled={pending !== null}>
              {pending === "draft" ? "Đang lưu…" : "Lưu nháp"}
            </Button>
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => void save("submit")}
            >
              <Send aria-hidden />{" "}
              {pending === "submit" ? "Đang gửi…" : "Gửi Giám đốc duyệt"}
            </Button>
          </div>
        ) : null}
        {can.cancel ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => void cancel()}
          >
            Hủy phụ lục
          </Button>
        ) : null}
        <p className="text-caption text-muted-foreground">
          Đổi được: thời hạn, hàng và giá, bảng giá đền bù, cọc và bảo lãnh, hạn
          thanh toán, VAT. Không đổi nhà thầu hay công trình (1 hợp đồng = 1
          công trình). Giá mới áp từ{" "}
          {formatBusinessDate(
            effectiveFrom || addDays(impact.newPriceFrom as BusinessDate, 0),
          )}
          .
        </p>
      </aside>
    </form>
  );
}
