"use client";

import { DateInput } from "@/components/domain/date-input";
import { FieldMessage } from "@/components/purchasing/field-message";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DEFAULT_VAT_RATE } from "@/domain/contract-lines";
import { NumericInput } from "@/components/domain/numeric-input";
import { DEFAULT_MIN_RENTAL_DAYS } from "@/domain/rental";

export interface TermsState {
  signedDate: string;
  startDate: string;
  endDate: string;
  minRentalDays: string;
  paymentTermsDays: string;
  vatEnabled: boolean;
  vatRate: string;
  companyTruck: boolean;
  freightPerTrip: string;
  note: string;
}

export function emptyTerms(paymentTermsDays = 30): TermsState {
  return {
    signedDate: "",
    startDate: "",
    endDate: "",
    minRentalDays: String(DEFAULT_MIN_RENTAL_DAYS),
    paymentTermsDays: String(paymentTermsDays),
    vatEnabled: false,
    vatRate: String(DEFAULT_VAT_RATE),
    companyTruck: false,
    freightPerTrip: "",
    note: "",
  };
}

interface DatesProps {
  type: "RENTAL" | "SALE";
  terms: TermsState;
  errors: Readonly<Record<string, string>>;
  onChange: (patch: Partial<TermsState>) => void;
  /** D5b: the signing and start dates are fixed. */
  fixedStart?: boolean;
  disabled?: boolean;
}

/** Ngày ký, thuê từ / ngày giao, đến ngày (dự kiến). */
export function DateFields({
  type,
  terms,
  errors,
  onChange,
  fixedStart = false,
  disabled = false,
}: DatesProps) {
  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="signed-date">Ngày ký</Label>
        <DateInput
          id="signed-date"
          value={terms.signedDate}
          disabled={disabled || fixedStart}
          onValueChange={(value) => onChange({ signedDate: value })}
        />
        <FieldMessage message={errors.signedDate} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="start-date" required={!disabled && !fixedStart}>
          {type === "RENTAL" ? "Thuê từ ngày" : "Ngày giao"}
        </Label>
        <DateInput
          id="start-date"
          required={!disabled && !fixedStart}
          value={terms.startDate}
          disabled={disabled || fixedStart}
          aria-invalid={errors.startDate ? true : undefined}
          onValueChange={(value) => onChange({ startDate: value })}
        />
        <FieldMessage message={errors.startDate} />
      </div>
      {type === "RENTAL" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="end-date">Đến ngày (dự kiến)</Label>
          <DateInput
            id="end-date"
            value={terms.endDate}
            disabled={disabled}
            onValueChange={(value) => onChange({ endDate: value })}
          />
          <FieldMessage message={errors.endDate} />
        </div>
      ) : null}
    </div>
  );
}

/** D5a "Điều khoản": minimum, billing, payment terms, VAT, transport. */
export function TermsFields({
  type,
  terms,
  errors,
  onChange,
  disabled = false,
}: DatesProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {type === "RENTAL" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="min-days" required={!disabled}>
              Thuê tối thiểu (ngày)
            </Label>
            <NumericInput
              id="min-days"
              kind="integer"
              required={!disabled}
              value={terms.minRentalDays}
              disabled={disabled}
              aria-invalid={errors.minRentalDays ? true : undefined}
              onChange={(event) =>
                onChange({ minRentalDays: event.target.value })
              }
              aria-describedby="min-days-hint"
              className="w-32 text-right tabular-nums"
            />
            <span
              id="min-days-hint"
              className="text-caption text-muted-foreground"
            >
              Trả trước {terms.minRentalDays || DEFAULT_MIN_RENTAL_DAYS} ngày
              vẫn tính đủ {terms.minRentalDays || DEFAULT_MIN_RENTAL_DAYS} ngày
            </span>
            <FieldMessage message={errors.minRentalDays} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-label">Chốt tiền thuê</span>
            <span className="flex h-11 items-center">
              Hàng tháng · ngày cuối tháng
            </span>
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-terms" required={!disabled}>
          Hạn thanh toán (ngày)
        </Label>
        <NumericInput
          id="payment-terms"
          kind="integer"
          required={!disabled}
          value={terms.paymentTermsDays}
          disabled={disabled}
          aria-invalid={errors.paymentTermsDays ? true : undefined}
          onChange={(event) =>
            onChange({ paymentTermsDays: event.target.value })
          }
          aria-describedby="payment-terms-hint"
          className="w-32 text-right tabular-nums"
        />
        <span
          id="payment-terms-hint"
          className="text-caption text-muted-foreground"
        >
          Lấy từ nhà thầu, sửa được
        </span>
        <FieldMessage message={errors.paymentTermsDays} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <Checkbox
            id="vat-enabled"
            checked={terms.vatEnabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ vatEnabled: checked === true })
            }
          />
          <Label htmlFor="vat-enabled">Khách lấy hóa đơn VAT</Label>
        </span>
        {terms.vatEnabled ? (
          <span className="flex items-center gap-2">
            <Label htmlFor="vat-rate" required={!disabled}>
              Thuế suất
            </Label>
            <NumericInput
              id="vat-rate"
              kind="decimal"
              required={!disabled}
              value={terms.vatRate}
              disabled={disabled}
              aria-invalid={errors.vatRate ? true : undefined}
              onChange={(event) => onChange({ vatRate: event.target.value })}
              className="h-9 w-20 text-right tabular-nums"
            />
            %
          </span>
        ) : null}
        <span className="text-caption text-muted-foreground">
          Tiền VAT cộng vào công nợ khi chốt kỳ.
        </span>
        <FieldMessage message={errors.vatRate} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <Checkbox
            id="company-truck"
            checked={terms.companyTruck}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ companyTruck: checked === true })
            }
          />
          <Label htmlFor="company-truck">Công ty gọi xe</Label>
        </span>
        {terms.companyTruck ? (
          <span className="flex items-center gap-2">
            <Label htmlFor="freight" required={!disabled}>
              Cước một chiều
            </Label>
            <NumericInput
              id="freight"
              kind="money"
              required={!disabled}
              value={terms.freightPerTrip}
              disabled={disabled}
              aria-invalid={errors.freightPerTrip ? true : undefined}
              onChange={(event) =>
                onChange({ freightPerTrip: event.target.value })
              }
              className="h-9 w-32 text-right tabular-nums"
            />
            ₫/chuyến
          </span>
        ) : null}
        <span className="text-caption text-muted-foreground">
          Cộng vào công nợ nhà thầu.
        </span>
        <FieldMessage message={errors.freightPerTrip} />
      </div>
      <p className="text-sm text-muted-foreground sm:col-span-2">
        <strong className="text-foreground">Chậm thanh toán:</strong> chưa tính
        lãi hay phạt; quá hạn chỉ cảnh báo trên Công nợ và khi duyệt hợp đồng
        mới.
      </p>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="contract-note">Ghi chú</Label>
        <textarea
          id="contract-note"
          value={terms.note}
          maxLength={1000}
          disabled={disabled}
          onChange={(event) => onChange({ note: event.target.value })}
          className="min-h-20 rounded-md border border-input bg-card px-3 py-2 text-base"
        />
      </div>
    </div>
  );
}

const intOrNull = (text: string) => (text.trim() === "" ? null : Number(text));
const moneyOrNull = (text: string) => {
  const plain = text.replace(/[\s.₫đ]/g, "");
  return plain === "" ? null : Number(plain);
};

/** The terms part of the API body. */
export function termsBody(type: "RENTAL" | "SALE", terms: TermsState) {
  return {
    signedDate: terms.signedDate || null,
    startDate: terms.startDate,
    endDate: type === "RENTAL" ? terms.endDate || null : null,
    minRentalDays: type === "RENTAL" ? intOrNull(terms.minRentalDays) : null,
    paymentTermsDays: intOrNull(terms.paymentTermsDays) ?? undefined,
    vatEnabled: terms.vatEnabled,
    vatRate: terms.vatEnabled ? terms.vatRate : null,
    companyTruck: terms.companyTruck,
    freightPerTrip: terms.companyTruck
      ? moneyOrNull(terms.freightPerTrip)
      : null,
    note: terms.note || null,
  };
}
