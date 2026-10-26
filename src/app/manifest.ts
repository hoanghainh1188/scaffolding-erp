import type { MetadataRoute } from "next";

import { brandColors } from "@/lib/brand-colors";

/** Installs the phone area (/m) on the home screen. No service worker yet. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scaffolding ERP",
    short_name: "Kho",
    description: "Nhập, xuất, thu hồi giàn giáo cho thủ kho và xưởng.",
    lang: "vi",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: brandColors.primary,
    background_color: brandColors.background,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
