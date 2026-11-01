import type { Metadata } from "next";
import Link from "next/link";

import { CompanyProfileForm } from "@/components/settings/company-profile-form";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { getCompanyProfile } from "@/lib/company/service";

export const metadata: Metadata = { title: "Thông tin công ty" };

/** Spec company-settings: company profile settings, director only. */
export default async function CompanySettingsPage() {
  await requirePermission("company.manage");
  const db = getDatabase();
  const profile = await getCompanyProfile(db);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <nav aria-label="Đường dẫn" className="text-sm text-muted-foreground">
        <Link href="/settings" className="hover:underline">
          Cài đặt
        </Link>{" "}
        <span aria-hidden>/</span>{" "}
        <span className="text-foreground">Thông tin công ty</span>
      </nav>

      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Thông tin công ty</h1>
        <p className="text-body text-muted-foreground">
          Cài đặt tên doanh nghiệp, mã số thuế, địa chỉ, số điện thoại, tài
          khoản ngân hàng và logo cho các biểu mẫu in ấn và tiêu đề hệ thống.
        </p>
      </div>

      <CompanyProfileForm initialProfile={profile} />
    </div>
  );
}
