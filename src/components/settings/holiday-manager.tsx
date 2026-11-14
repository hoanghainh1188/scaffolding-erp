"use client";

// The holiday list of /settings/holidays (spec rental-holidays): by year,
// add, edit, delete with a confirmation; rows of a closed period are locked.
import { LockIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/catalog/form-error";
import { DateInput } from "@/components/domain/date-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBusinessDate } from "@/domain/business-date";
import { callApi } from "@/lib/api-client";

export interface HolidayItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  days: number;
  updatedAt: string;
  locked: boolean;
}

interface HolidayManagerProps {
  year: number;
  rows: readonly HolidayItem[];
  lockReason: string | null;
}

const rangeText = (row: Pick<HolidayItem, "startDate" | "endDate">) =>
  row.startDate === row.endDate
    ? formatBusinessDate(row.startDate)
    : `${formatBusinessDate(row.startDate)} – ${formatBusinessDate(row.endDate)}`;

export function HolidayManager({
  year,
  rows,
  lockReason,
}: HolidayManagerProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<HolidayItem | "new" | null>(null);
  // Kept while the dialog closes, so its title does not flip.
  const [adding, setAdding] = useState(true);
  const [removing, setRemoving] = useState<HolidayItem | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(row: HolidayItem | "new") {
    setError(null);
    setNameError(null);
    setEditing(row);
    setAdding(row === "new");
    setName(row === "new" ? "" : row.name);
    setStartDate(row === "new" ? "" : row.startDate);
    setEndDate(row === "new" ? "" : row.endDate);
  }

  async function save() {
    if (editing === null) return;
    setBusy(true);
    setError(null);
    const body = {
      name,
      startDate,
      endDate,
      updatedAt: editing === "new" ? undefined : editing.updatedAt,
    };
    const result =
      editing === "new"
        ? await callApi("/api/holidays", { method: "POST", body })
        : await callApi(`/api/holidays/${editing.id}`, { method: "PUT", body });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/holidays/${removing.id}`, {
      method: "DELETE",
      body: { updatedAt: removing.updatedAt },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRemoving(null);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Chọn năm" className="flex items-center gap-2 text-sm">
          <Link
            href={`/settings/holidays?year=${year - 1}`}
            className="text-primary hover:underline"
          >
            ← {year - 1}
          </Link>
          <span className="text-h2">Năm {year}</span>
          <Link
            href={`/settings/holidays?year=${year + 1}`}
            className="text-primary hover:underline"
          >
            {year + 1} →
          </Link>
        </nav>
        <Button onClick={() => open("new")}>
          <PlusIcon aria-hidden /> Thêm ngày nghỉ
        </Button>
      </div>
      {lockReason ? (
        <p className="text-sm text-muted-foreground">{lockReason}</p>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th scope="col" className="px-3 py-2">
              Tên
            </th>
            <th scope="col" className="px-3 py-2">
              Ngày
            </th>
            <th scope="col" className="px-3 py-2 text-right">
              Số ngày
            </th>
            <th scope="col" className="w-28 px-3 py-2">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-3 text-muted-foreground">
                Năm {year} chưa có ngày nghỉ nào.
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 tabular-nums">{rangeText(row)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.days}</td>
              <td className="px-3 py-2">
                {row.locked ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <LockIcon aria-hidden className="size-4" /> Đã khóa
                  </span>
                ) : (
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Sửa ${row.name}`}
                      onClick={() => open(row)}
                    >
                      <PencilIcon aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Xóa ${row.name}`}
                      onClick={() => {
                        setError(null);
                        setRemoving(row);
                      }}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adding ? "Thêm ngày nghỉ" : "Sửa ngày nghỉ"}
            </DialogTitle>
            <DialogDescription>
              Gồm cả ngày bắt đầu và ngày kết thúc, tối đa 31 ngày một dòng.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            <Label htmlFor="holiday-name" required>
              Tên
            </Label>
            <Input
              id="holiday-name"
              value={name}
              required
              maxLength={100}
              aria-invalid={nameError ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                if (nameError && event.target.value.trim() !== "") {
                  setNameError(null);
                }
              }}
              onBlur={(event) => {
                if (event.target.value.trim() === "") {
                  setNameError("Vui lòng nhập tên ngày nghỉ");
                }
              }}
              placeholder="VD: Tết Nguyên đán"
            />
            {nameError && !error && (
              <p className="text-caption text-destructive">{nameError}</p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="holiday-start" required>
                Từ ngày
              </Label>
              <DateInput
                id="holiday-start"
                required
                value={startDate}
                onValueChange={setStartDate}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="holiday-end" required>
                Đến ngày
              </Label>
              <DateInput
                id="holiday-end"
                required
                value={endDate}
                onValueChange={setEndDate}
              />
            </div>
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Thôi
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(value) => !value && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa ngày nghỉ?</DialogTitle>
            <DialogDescription>
              {removing
                ? `Xóa ngày nghỉ "${removing.name}" (${rangeText(removing)})? Tiền thuê kỳ chưa chốt sẽ tính lại ngày đó.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Thôi
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
