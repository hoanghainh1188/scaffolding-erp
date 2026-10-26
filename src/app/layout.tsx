import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Bricolage_Grotesque } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { brandColors } from "@/lib/brand-colors";

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
  appleWebApp: { capable: true, title: "Kho", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

// viewport-fit=cover lets the phone layout reach under the notch and home
// indicator; AppBar and BottomNav pad themselves with safe-area insets.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: brandColors.primary,
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
