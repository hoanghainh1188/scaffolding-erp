import type { ReactNode } from "react";

interface BrandPanelProps {
  headline: string;
  children?: ReactNode;
}

/** The left half of /two-factor, the same block as the sign-in page. */
export function BrandPanel({ headline, children }: BrandPanelProps) {
  return (
    <section
      aria-label="Giới thiệu"
      className="relative flex flex-[0_1_520px] flex-col justify-between gap-10 overflow-hidden bg-primary p-6 text-primary-foreground max-lg:flex-[1_1_100%] lg:min-h-dvh lg:p-12 print:hidden"
    >
      <div
        aria-hidden
        className="absolute -top-9 -right-9 size-24 rounded-full bg-highlight lg:top-auto lg:-right-24 lg:-bottom-24 lg:size-72"
      />
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-lg bg-card font-display text-[22px] font-bold text-primary"
        >
          S
        </span>
        <span className="font-display text-xl font-bold">Scaffolding ERP</span>
      </div>
      <p className="relative max-w-[420px] font-display text-2xl font-bold tracking-tight lg:text-[44px] lg:leading-[48px]">
        {headline}
      </p>
      {children ? <div className="relative">{children}</div> : <span />}
    </section>
  );
}
