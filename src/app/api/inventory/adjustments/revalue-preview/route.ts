import { fail, ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { NOT_FOUND, catalogDb } from "@/lib/catalog/respond";
import { revaluePreviewFrom } from "@/lib/inventory/respond";
import { revaluePreview } from "@/lib/inventory/revaluations";

/** Stock · average · value → new average of one line, at the numbers of now. */
export const GET = withAuth(
  async (request) => {
    const input = revaluePreviewFrom(new URL(request.url).searchParams);
    if (!input) return fail("Dữ liệu gửi lên không hợp lệ", 400);
    const preview = await revaluePreview(catalogDb(), input);
    return preview ? ok(preview) : NOT_FOUND();
  },
  { permission: "inventory.adjust" },
);
