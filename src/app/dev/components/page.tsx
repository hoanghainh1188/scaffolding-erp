import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComponentShowcase } from "./showcase";

export const metadata: Metadata = { title: "Component" };

/** Every component state, for screenshots and a11y checks. Dev only. */
export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production" && process.env.E2E !== "1") {
    notFound();
  }
  return <ComponentShowcase />;
}
