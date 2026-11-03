import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { readReturnPhoto } from "@/lib/returns/photos";

type Params = { id: string };

/**
 * The bytes of one photo: private, never cached, 404 alike for a missing
 * photo and one the user may not see (design D4).
 */
export const GET = withAuth<Params>(
  async (_request, { user, actor, params }) => {
    const result = await readReturnPhoto(
      catalogDb(),
      contractActor(user, actor),
      params.id,
    );
    if (!result.ok) return fail(result.error, result.status);
    return new Response(new Uint8Array(result.data.content), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);

/** Photos of a posted note are kept (spec return-photos). */
export const DELETE = withAuth<Params>(async () =>
  fail("Ảnh của phiếu thu hồi không xóa được.", 405),
);
