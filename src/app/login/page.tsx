import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { homePathFor, safeNextPath } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/current-user";
import { dict } from "@/locales";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

// Waits for the session check, so a signed-in visitor gets a real redirect.
export const instant = false;

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

/** Sign-in (design Login.dc.html): brand panel + form. */
export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <div className="group/login flex min-h-dvh flex-wrap bg-background text-foreground">
      <section
        aria-label="Giới thiệu"
        className="relative flex min-h-60 flex-[1_1_480px] flex-col justify-between gap-12 overflow-hidden bg-primary p-8 text-primary-foreground lg:min-h-dvh lg:p-12"
      >
        <div
          aria-hidden
          className="absolute -right-24 -bottom-24 size-72 rounded-full bg-highlight"
        />
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-lg bg-card font-display text-[22px] font-bold text-primary"
          >
            S
          </span>
          <span className="font-display text-xl font-bold">
            Scaffolding ERP
          </span>
        </div>
        <p className="relative hidden max-w-[520px] font-display text-[34px] leading-[38px] font-bold tracking-tight group-has-[[data-login-step=code]]/login:block lg:text-[48px] lg:leading-[52px]">
          {dict.auth.twoFactor.panelCode}
        </p>
        <div className="relative flex max-w-[520px] flex-col gap-4 group-has-[[data-login-step=code]]/login:hidden">
          <p className="font-display text-[34px] leading-[38px] font-bold tracking-tight lg:text-[48px] lg:leading-[52px]">
            Giàn giáo đang ở đâu, ai đang nợ bao nhiêu.
          </p>
          <p className="max-w-[440px] text-lg leading-7">
            Thu mua, cho thuê, thu hồi và công nợ của công ty trong cùng một
            chỗ.
          </p>
        </div>
      </section>

      <main className="flex flex-[1_1_420px] items-center justify-center px-4 py-12 sm:px-6">
        <SignedInRedirect />
        <LoginFormWithNext searchParams={searchParams} />
      </main>
    </div>
  );
}

/** Someone already signed in has nothing to do here (spec auth). */
async function SignedInRedirect() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user.role));
  return null;
}

async function LoginFormWithNext({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  return (
    <LoginForm next={safeNextPath(typeof next === "string" ? next : null)} />
  );
}
