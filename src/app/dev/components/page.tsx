import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { ComponentShowcase } from "./showcase";

export const metadata: Metadata = { title: "Component" };

export const instant = false;

/** Every component state, for screenshots and a11y checks. Dev only. */
export default async function DevComponentsPage() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.E2E !== "1") {
    notFound();
  }
  return <ComponentShowcase />;
}
