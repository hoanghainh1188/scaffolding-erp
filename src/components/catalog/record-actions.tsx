"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { CatalogStatus } from "@/lib/catalog/common";

import { ConfirmAction } from "./confirm-action";
import { useCatalogAction } from "./use-catalog-action";

interface RecordActionsProps {
  /** e.g. "/api/catalog/customers/<id>". */
  path: string;
  status: CatalogStatus;
  /** "nhà thầu NT-0001". */
  label: string;
  /** Where to go after a delete (the list without the gone record). */
  afterDelete: string;
}

/** Archive / bring back / delete one record, with the server's reason. */
export function RecordActions({
  path,
  status,
  label,
  afterDelete,
}: RecordActionsProps) {
  const router = useRouter();
  const action = useCatalogAction();
  const active = status === "ACTIVE";
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction
        trigger={
          <Button variant="outline">
            {active ? "Ngừng dùng" : "Dùng lại"}
          </Button>
        }
        title={active ? `Ngừng dùng ${label}?` : `Dùng lại ${label}?`}
        description={
          active
            ? "Không chọn được ở chứng từ mới. Chứng từ cũ vẫn giữ nguyên."
            : "Chọn được lại ở chứng từ mới."
        }
        confirmLabel={active ? "Ngừng dùng" : "Dùng lại"}
        error={action.error}
        onConfirm={async () =>
          (await action.run(path, {
            method: "PATCH",
            body: { status: active ? "ARCHIVED" : "ACTIVE" },
          })) !== null
        }
      />
      <ConfirmAction
        trigger={
          <Button variant="ghost" className="text-destructive">
            Xóa
          </Button>
        }
        title={`Xóa ${label}?`}
        description="Chỉ xóa được bản ghi tạo nhầm, chưa dùng ở đâu. Đã dùng thì ngừng dùng."
        confirmLabel="Xóa"
        destructive
        error={action.error}
        onConfirm={async () => {
          const done = (await action.run(path, { method: "DELETE" })) !== null;
          if (done) router.replace(afterDelete);
          return done;
        }}
      />
    </div>
  );
}
