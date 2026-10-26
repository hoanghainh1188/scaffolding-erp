import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/shell/placeholder-page";

export const metadata: Metadata = { title: "Cài đặt" };

export default function Page() {
  return (
    <PlaceholderPage
      title="Cài đặt"
      description="D17: người dùng và vai trò."
    />
  );
}
