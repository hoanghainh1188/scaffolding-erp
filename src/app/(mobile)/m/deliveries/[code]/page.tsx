import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PickingScreen } from "@/components/delivery-picking/picking-screen";
import { MobilePage } from "@/components/shell/mobile/mobile-page";
import { getDatabase } from "@/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { mobileNote } from "@/lib/deliveries/queries";

export const metadata: Metadata = { title: "Nhặt hàng xuất kho" };

const NOTE_CODE = /^PX-\d{4}-\d{3,}$/;

/** M5 (spec delivery-picking). No price, freight or money on this page. */
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const user = await requirePermission("deliveries.pick");
  const { code } = await params;
  await connection();
  const note = NOTE_CODE.test(code)
    ? await mobileNote(getDatabase(), code)
    : null;
  if (!note) notFound();
  return (
    <MobilePage title="Nhặt hàng xuất kho" backHref="/m">
      <PickingScreen note={note} userId={user.id} />
    </MobilePage>
  );
}
