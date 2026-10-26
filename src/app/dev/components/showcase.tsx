"use client";

import { useState, type ReactNode } from "react";

import { ConditionBadge } from "@/components/domain/condition-badge";
import {
  ConditionSplit,
  type SplitParts,
} from "@/components/domain/condition-split";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/domain/data-table";
import { DocumentStatusBadge } from "@/components/domain/document-status-badge";
import { LocationBadge } from "@/components/domain/location-badge";
import { Stepper } from "@/components/domain/stepper";
import { Button } from "@/components/ui/button";
import { CONDITIONS } from "@/domain/condition";
import { DISPLAY_DOCUMENT_STATUSES } from "@/domain/document-status";
import { LOCATION_TYPES } from "@/domain/location-type";
import { formatMoney, toMoney } from "@/domain/money";
import {
  formatQuantity,
  quantityFromNumber,
  type QuantityUnit,
} from "@/domain/quantity";

const pcs = (n: number) => quantityFromNumber(n, "PIECE");
const kg = (n: number) => quantityFromNumber(n, "KG");

interface StockRow {
  code: string;
  name: string;
  group: string;
  unit: QuantityUnit;
  good: number;
  needsRepair: number;
  scrap: number;
  atSite: number;
  avgCost: number;
  note: string;
}

const STOCK: StockRow[] = [
  [
    "KG-170",
    "Khung giàn giáo 1.7m",
    820,
    64,
    12,
    1340,
    410_000,
    "Hàng thu hồi công trình Quốc Bảo",
  ],
  ["KG-153", "Khung giàn giáo 1.53m", 615, 40, 8, 980, 365_000, ""],
  [
    "CH-196",
    "Giằng chéo 1.96m",
    2210,
    130,
    45,
    3120,
    85_000,
    "Kiểm lại sau đợt trả 24/10/2026",
  ],
  ["MA-04", "Mâm thép 0.4 × 1.6m", 455, 22, 6, 610, 320_000, ""],
  ["KD-01", "Kích chân U 0.6m", 1200, 90, 15, 1850, 45_000, ""],
  [
    "CB-01",
    "Cùm bản mạ kẽm",
    3400,
    210,
    0,
    5200,
    12_000,
    "Đơn vị tính theo cái",
  ],
].map(([code, name, good, needsRepair, scrap, atSite, avgCost, note]) => ({
  code: code as string,
  name: name as string,
  group: "Giàn giáo",
  unit: "PIECE" as const,
  good: good as number,
  needsRepair: needsRepair as number,
  scrap: scrap as number,
  atSite: atSite as number,
  avgCost: avgCost as number,
  note: note as string,
}));

const num = (
  key: keyof StockRow,
  header: string,
): DataTableColumn<StockRow> => ({
  accessorKey: key,
  header,
  meta: { align: "right" },
  cell: ({ getValue }) => formatQuantity(pcs(getValue<number>())),
});

const STOCK_COLUMNS: DataTableColumn<StockRow>[] = [
  { accessorKey: "code", header: "Mã hàng" },
  { accessorKey: "name", header: "Tên vật tư" },
  { accessorKey: "group", header: "Nhóm", meta: { hideBelow: "lg" } },
  { id: "unit", header: "ĐVT", enableSorting: false, cell: () => "cái" },
  num("good", "Tốt"),
  num("needsRepair", "Chờ sửa"),
  num("scrap", "Phế liệu"),
  num("atSite", "Tại công trình"),
  {
    accessorKey: "avgCost",
    header: "Giá vốn BQ",
    meta: { align: "right" },
    cell: ({ getValue }) => formatMoney(toMoney(getValue<number>())),
  },
  {
    accessorKey: "note",
    header: "Ghi chú",
    enableSorting: false,
    meta: { hideBelow: "xl" },
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

export function ComponentShowcase() {
  const [pieces, setPieces] = useState(pcs(12));
  const [capped, setCapped] = useState(pcs(100));
  const [weight, setWeight] = useState(kg(250.5));
  const [receipt, setReceipt] = useState<SplitParts>({
    GOOD: pcs(80),
    NEEDS_REPAIR: pcs(15),
    SCRAP: pcs(0),
    LOST: pcs(0),
  });
  const [returned, setReturned] = useState<SplitParts>({
    GOOD: pcs(80),
    NEEDS_REPAIR: pcs(15),
    SCRAP: pcs(3),
    LOST: pcs(2),
  });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 md:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-label text-muted-foreground">Trang dành cho dev</p>
        <h1 className="text-display-xl">
          Phiếu nhập thu hồi – Ước tính đền bù
        </h1>
        <p className="max-w-2xl text-body-lg text-muted-foreground">
          Mọi trạng thái của component nền, dùng để chụp ảnh mốc và kiểm tra khả
          năng truy cập.
        </p>
      </header>

      <Section title="Tình trạng hàng">
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((c) => (
            <ConditionBadge key={c} condition={c} />
          ))}
        </div>
      </Section>

      <Section title="Trạng thái chứng từ">
        <div className="flex flex-wrap gap-2">
          {DISPLAY_DOCUMENT_STATUSES.map((s) => (
            <DocumentStatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Vị trí">
        <div className="flex flex-wrap gap-2">
          {LOCATION_TYPES.map((t) => (
            <LocationBadge key={t} type={t} />
          ))}
        </div>
      </Section>

      <Section title="Nút">
        <div className="flex flex-wrap gap-3">
          <Button>Lưu phiếu</Button>
          <Button variant="secondary">Quay lại</Button>
          <Button variant="outline">Xuất Excel</Button>
          <Button variant="destructive">Từ chối</Button>
          <Button variant="ghost">Bỏ qua</Button>
          <Button disabled>Đang lưu</Button>
        </div>
      </Section>

      <Section title="Stepper">
        <div className="grid max-w-md gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-label">Khung giàn giáo 1.7m (cái)</span>
            <Stepper
              label="Khung giàn giáo 1.7m"
              value={pieces}
              onValueChange={setPieces}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-label">Mâm thép — tối đa 100 cái</span>
            <Stepper
              label="Mâm thép"
              value={capped}
              max={100}
              onValueChange={setCapped}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-label">Phế liệu sắt (kg)</span>
            <Stepper
              label="Phế liệu sắt"
              value={weight}
              onValueChange={setWeight}
            />
          </div>
        </div>
      </Section>

      <Section title="Chia tình trạng">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <p className="text-label">Nhập từ PO — tổng 100 cái</p>
            <ConditionSplit
              total={pcs(100)}
              value={receipt}
              onValueChange={setReceipt}
            />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-5">
            <p className="text-label">Thu hồi từ công trình — tổng 100 cái</p>
            <ConditionSplit
              total={pcs(100)}
              value={returned}
              onValueChange={setReturned}
              withLost
            />
          </div>
        </div>
      </Section>

      <Section title="Bảng dữ liệu">
        <DataTable
          label="Tồn kho mẫu"
          columns={STOCK_COLUMNS}
          data={STOCK}
          emptyState={{ message: "Chưa có vật tư nào" }}
        />
      </Section>

      <Section title="Bảng rỗng">
        <DataTable
          label="Đơn thu mua"
          columns={STOCK_COLUMNS}
          data={[]}
          emptyState={{
            message: "Chưa có đơn thu mua nào",
            action: { label: "Tạo đơn", href: "/purchasing" },
          }}
        />
      </Section>
    </main>
  );
}
