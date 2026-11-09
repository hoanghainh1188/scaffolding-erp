"use client";

// M10 "Sản xuất tại xưởng" (spec production-mobile;
// docs/design/screens/M10-Production.dc.html): the workshop takes the order,
// records finished pieces, materials and offcuts, reports; the storekeeper
// counts on the same screen. The numbers live in a draft on the phone until
// sent. No price.
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import { PRODUCTION_STATUS_LABELS, normMilli } from "@/domain/production-order";
import {
  QUANTITY_UNIT_LABELS,
  formatQuantity,
  quantityFromDb,
  toQuantity,
} from "@/domain/quantity";
import { useDraft } from "@/hooks/use-draft";
import { callApi } from "@/lib/api-client";
import { outboxFor, postedNotices } from "@/lib/drafts/runtime";
import type { ProductionPhoneOrder } from "@/lib/production/phone-queries";
import type { PhoneSupply } from "@/lib/repairs/phone-queries";

import {
  footerText,
  initialPayload,
  lineOf,
  lineSummary,
  overuseWarning,
  stepBody,
  withAdded,
  withFinished,
  withMaterial,
  withoutMaterial,
  type PhoneLineDraft,
  type ProductionPhonePayload,
} from "./production-phone-model";

const MESSAGES = {
  queued: "Chưa gửi được, sẽ tự gửi khi có mạng",
  signedOut: "Phiên đăng nhập hết hạn. Đăng nhập lại để gửi.",
  reopened: "Lệnh đã đổi, đã mở số mới",
} as const;

interface ProductionPhoneScreenProps {
  order: ProductionPhoneOrder;
  materials: PhoneSupply[];
  userId: string;
  mode: "work" | "count";
}

function ReceiveCard({ order }: { order: ProductionPhoneOrder }) {
  const router = useRouter();
  // One draft id per order on this screen, so a second press resends it.
  const [draftId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function receive() {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/m/production/${order.code}/receive`, {
      method: "POST",
      body: { draftId, updatedAt: order.updatedAt },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p className="text-label">
        Làm ở {order.workshopCode}, thành phẩm nhập về {order.toCode}.
      </p>
      <Button className="h-12" disabled={busy} onClick={() => void receive()}>
        Nhận lệnh
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function MaterialRow({
  material,
  finishedMilli,
  onChange,
  onRemove,
}: {
  material: PhoneLineDraft["materials"][number];
  finishedMilli: number;
  onChange: (milli: number) => void;
  onRemove: () => void;
}) {
  const unit = QUANTITY_UNIT_LABELS[material.unit];
  const warning = overuseWarning(material, finishedMilli);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-label">{material.name}</span>
          <span className="text-caption text-muted-foreground">
            {material.code}
            {material.normPerUnitMilli === null
              ? " · ngoài định mức"
              : ` · định mức ${formatNorm(material, finishedMilli)} ${unit}`}
          </span>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Bỏ ${material.code}`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Stepper
        label={`${material.name} thực dùng (${unit})`}
        value={toQuantity(material.milli, material.unit)}
        min={0}
        onValueChange={(next) => onChange(next.milli)}
      />
      {warning ? (
        <p role="status" className="text-sm font-semibold text-warning">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

function formatNorm(
  material: PhoneLineDraft["materials"][number],
  finishedMilli: number,
): string {
  return formatQuantity(
    toQuantity(
      normMilli(material.normPerUnitMilli ?? 0, finishedMilli, material.unit),
      material.unit,
    ),
  );
}

function LineCard({
  line,
  draft,
  open,
  onOpen,
  onChange,
  materials,
}: {
  line: ProductionPhoneOrder["lines"][number];
  draft: PhoneLineDraft;
  open: boolean;
  onOpen: () => void;
  onChange: (next: PhoneLineDraft) => void;
  materials: PhoneSupply[];
}) {
  const [adding, setAdding] = useState(false);
  if (!open) {
    return (
      <section
        aria-label={line.name}
        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-label">{line.name}</span>
          <span className="text-caption text-muted-foreground">
            {line.code} · {lineSummary(line, draft)}
          </span>
        </span>
        <Button type="button" variant="outline" onClick={onOpen}>
          Mở
        </Button>
      </section>
    );
  }
  const unused = materials.filter(
    (material) => !draft.materials.some((m) => m.itemId === material.itemId),
  );
  return (
    <section
      aria-label={line.name}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <p className="flex flex-col">
        <span className="text-label">{line.name}</span>
        <span className="text-caption text-muted-foreground">
          {line.code} · kế hoạch{" "}
          {formatQuantity(quantityFromDb(line.planned, line.unit))}{" "}
          {QUANTITY_UNIT_LABELS[line.unit]}
        </span>
      </p>
      <div className="flex flex-col gap-1">
        <span className="text-label">Làm xong</span>
        <Stepper
          label={`Làm xong ${line.code}`}
          value={toQuantity(draft.finishedMilli, line.unit)}
          min={0}
          onValueChange={(next) => onChange(withFinished(draft, next.milli))}
        />
      </div>
      <span className="text-label">Nguyên liệu thực dùng</span>
      {draft.materials.map((material) => (
        <MaterialRow
          key={material.itemId}
          material={material}
          finishedMilli={draft.finishedMilli}
          onChange={(milli) =>
            onChange(withMaterial(draft, material.itemId, milli))
          }
          onRemove={() => onChange(withoutMaterial(draft, material.itemId))}
        />
      ))}
      {adding ? (
        <select
          aria-label={`Chọn nguyên liệu cho ${line.code}`}
          className="h-12 rounded-md border bg-card px-3 text-base"
          defaultValue=""
          onChange={(event) => {
            const found = materials.find(
              (material) => material.itemId === event.target.value,
            );
            if (!found) return;
            onChange(withAdded(draft, found));
            setAdding(false);
          }}
        >
          <option value="">Chọn nguyên liệu</option>
          {unused.map((material) => (
            <option key={material.itemId} value={material.itemId}>
              {material.name} · {material.code}
            </option>
          ))}
        </select>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={unused.length === 0}
          onClick={() => setAdding(true)}
        >
          <Plus aria-hidden /> Thêm nguyên liệu
        </Button>
      )}
      <div className="flex flex-col gap-1">
        <span className="flex flex-col">
          <span className="text-label">Đầu thừa (kg)</span>
          <span className="text-caption text-muted-foreground">
            thành Phế liệu
          </span>
        </span>
        <Stepper
          label={`Đầu thừa kg ${line.code}`}
          value={toQuantity(draft.offcutMilli, "KG")}
          min={0}
          onValueChange={(next) =>
            onChange({ ...draft, offcutMilli: next.milli })
          }
        />
      </div>
    </section>
  );
}

export function ProductionPhoneScreen({
  order,
  materials,
  userId,
  mode,
}: ProductionPhoneScreenProps) {
  const router = useRouter();
  const draft = useDraft<ProductionPhonePayload>({
    kind: "PRODUCTION",
    userId,
    documentRef: order.code,
    version: order.updatedAt,
    title: `${mode === "count" ? "Đếm" : "Làm"} ${order.code}`,
    initial: () => initialPayload(order),
    progressOf: (payload) => footerText(order, payload),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openLine, setOpenLine] = useState(order.lines[0]?.itemId ?? "");

  const header = (
    <section className="flex flex-col gap-1">
      <h2 className="font-display text-h2">{order.code}</h2>
      <p className="text-body text-muted-foreground">
        {PRODUCTION_STATUS_LABELS[order.status]}
        {order.team ? ` · ${order.team}` : ""} · {order.workshopCode}
      </p>
    </section>
  );

  if (order.status === "ASSIGNED") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {mode === "work" ? (
          <ReceiveCard order={order} />
        ) : (
          <p className="text-body text-muted-foreground">
            Chờ xưởng nhận lệnh.
          </p>
        )}
      </div>
    );
  }
  const workable =
    (mode === "work" && order.status === "IN_PROGRESS") ||
    (mode === "count" && order.status === "AWAITING_CHECK");
  if (!workable) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-body text-muted-foreground">
          {mode === "work"
            ? "Lệnh đã báo làm xong, chờ Thủ kho đếm."
            : "Lệnh chưa chờ đếm."}
        </p>
      </div>
    );
  }
  if (!draft.ready) {
    return <p className="text-body text-muted-foreground">Đang mở lệnh…</p>;
  }
  const payload = draft.payload;
  const queued =
    draft.record?.state === "QUEUED" || draft.record?.state === "SENDING";
  const rejected =
    draft.record?.state === "REJECTED" ? draft.record.error : null;
  const locked = !draft.editable || busy;

  async function send() {
    setMessage(null);
    setBusy(true);
    const step = mode === "count" ? "count" : "report";
    const version = draft.record?.version ?? order.updatedAt;
    const saved = await draft.saveNow({
      payload: { ...payload, step, body: stepBody(order, payload, version) },
      state: "QUEUED",
    });
    const outcome = await outboxFor(userId).submit(saved.draftId);
    setBusy(false);
    if (outcome.kind === "POSTED") {
      postedNotices.clear();
      router.push("/m/production");
      router.refresh();
    } else if (outcome.kind === "REJECTED") {
      router.refresh();
    } else if (outcome.kind === "SIGNED_OUT") {
      setMessage(MESSAGES.signedOut);
    } else if (outcome.kind === "RETRY") {
      setMessage(MESSAGES.queued);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-40">
      {header}
      <p className="rounded-lg border bg-card p-4 text-body">
        {mode === "count"
          ? "Số xưởng đã báo điền sẵn. Sửa thành số đếm được."
          : "Số nguyên liệu điền sẵn theo định mức. Sửa thành số thực dùng. Đầu thừa cân theo kg."}
      </p>
      {order.returnNote ? (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          Văn phòng trả lại: {order.returnNote}
        </p>
      ) : null}
      {(queued || message || rejected || draft.reopened) && (
        <p
          role="status"
          className="rounded-lg border-2 border-warning bg-card p-4 text-label"
        >
          {message ??
            rejected ??
            (queued ? MESSAGES.queued : MESSAGES.reopened)}
        </p>
      )}
      <fieldset
        disabled={locked}
        aria-label="Thành phẩm"
        className="flex min-w-0 flex-col gap-4"
      >
        {order.lines.map((line) => (
          <LineCard
            key={line.itemId}
            line={line}
            draft={lineOf(payload, line.itemId)}
            open={openLine === line.itemId}
            onOpen={() => setOpenLine(line.itemId)}
            materials={materials}
            onChange={(next) =>
              draft.update({
                ...payload,
                lines: { ...payload.lines, [line.itemId]: next },
              })
            }
          />
        ))}
      </fieldset>
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-card">
        <div className="mx-auto flex max-w-[640px] flex-col gap-2 px-4 py-3">
          <span className="text-caption text-muted-foreground">
            {footerText(order, payload)} · nháp đã lưu trên máy
          </span>
          <Button
            type="button"
            className="h-12"
            disabled={locked}
            onClick={() => void send()}
          >
            {mode === "count" ? "Đếm xong" : "Báo làm xong"}
          </Button>
        </div>
      </div>
    </div>
  );
}
