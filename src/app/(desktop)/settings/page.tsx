import { Building2, ChevronRight, History, Recycle, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PhotoStorage } from "@/components/settings/photo-storage";
import { UnderConstruction } from "@/components/shell/placeholder-page";
import { getDatabase } from "@/db/client";
import { can } from "@/domain/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { photoStorageBytes } from "@/lib/returns/photos";

export const metadata: Metadata = { title: "Cài đặt" };

export default async function Page() {
  const user = await requirePermission("settings.view");
  await connection();
  const photoBytes = can(user.role, "company.manage")
    ? await photoStorageBytes(getDatabase())
    : null;
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1">Cài đặt</h1>
      <Link
        href="/settings/company"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Building2 aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Thông tin công ty</span>
          <span className="text-body text-muted-foreground">
            Tên doanh nghiệp, mã số thuế, địa chỉ, hotline, ngân hàng và logo
            cho phiếu in.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      <Link
        href="/settings/users"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Users aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Người dùng</span>
          <span className="text-body text-muted-foreground">
            Thêm người, đổi vai trò, đặt lại mật khẩu, khóa tài khoản.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      <Link
        href="/settings/scrap-price"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Recycle aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Giá sắt vụn tham khảo</span>
          <span className="text-body text-muted-foreground">
            Định giá phần Phế liệu khi tách lô hàng cũ lúc nhập kho.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      <Link
        href="/settings/activity"
        className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <History aria-hidden className="size-5" />
        </span>
        <span className="flex flex-1 flex-col gap-1">
          <span className="text-label">Nhật ký thao tác</span>
          <span className="text-body text-muted-foreground">
            Ai làm gì, lúc nào, với chứng từ nào. Xem trước, sau và xuất Excel.
          </span>
        </span>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </Link>
      {photoBytes === null ? null : <PhotoStorage bytes={photoBytes} />}
      <UnderConstruction description="Các cài đặt khác của công ty làm ở change sau." />
    </div>
  );
}
