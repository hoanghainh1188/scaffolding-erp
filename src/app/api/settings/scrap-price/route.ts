import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { scrapPriceBody } from "@/lib/receiving/respond";
import {
  currentScrapPrice,
  scrapPriceHistory,
  setScrapPrice,
} from "@/lib/receiving/scrap-price";
import { readJson } from "@/lib/read-json";

// Giá sắt vụn tham khảo (goods-receipt spec scrap-price, design D9).
export const GET = withAuth(
  async () => {
    const db = catalogDb();
    const [current, history] = await Promise.all([
      currentScrapPrice(db),
      scrapPriceHistory(db),
    ]);
    return ok({ current, history });
  },
  { permission: "scrap-price.manage" },
);

export const POST = withAuth(
  async (request, { user }) => {
    const body = await readJson(request, scrapPriceBody);
    if (!body.ok) return body.response;
    return respond(await setScrapPrice(catalogDb(), user, body.data), 201);
  },
  { permission: "scrap-price.manage" },
);
