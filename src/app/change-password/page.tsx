import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/guard";
import { homePathFor } from "@/lib/auth/paths";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

// Waits for the session check: signed-out visitors get a real redirect.
export const instant = false;

/** Own password change; the only page open before a temporary one is changed. */
export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const home = homePathFor(user.role);

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="flex w-full max-w-[440px] flex-col gap-6 rounded-lg border bg-card p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">Đổi mật khẩu</h1>
          <p className="text-body text-muted-foreground">
            {user.mustChangePassword
              ? `Chào ${user.name}. Bạn đang dùng mật khẩu tạm Giám đốc cấp. Đặt mật khẩu của riêng bạn để tiếp tục.`
              : "Sau khi đổi, các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại."}
          </p>
        </div>
        <ChangePasswordForm doneHref={home} />
        {user.mustChangePassword ? null : (
          <Link
            href={home}
            className="self-start text-sm underline-offset-4 hover:underline"
          >
            Quay lại
          </Link>
        )}
      </section>
    </main>
  );
}
