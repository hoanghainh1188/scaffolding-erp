import type { Metadata } from "next";
import { Be_Vietnam_Pro, Bricolage_Grotesque } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Two families only (docs/design-system/README.md). tokens.css reads these
// variables as --next-font-display / --next-font-body.
const display = Bricolage_Grotesque({
  variable: "--next-font-display",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["700"],
  display: "swap",
});

const body = Be_Vietnam_Pro({
  variable: "--next-font-body",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Scaffolding ERP", template: "%s · Scaffolding ERP" },
  description: "Quản lý thu mua, kho, sửa chữa, bán và cho thuê giàn giáo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
