import { ok } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { scrapItemBody } from "@/lib/production/respond";
import { currentScrapItem, setScrapItem } from "@/lib/production/settings";
import { readJson } from "@/lib/read-json";

/** Mã sắt vụn: the scrap-price page reads and changes it (0.2 số 152). */
export const GET = withAuth(
  async () => ok({ scrapItem: await currentScrapItem(catalogDb()) }),
  { permission: "scrap-price.manage" },
);

export const PUT = withAuth(
  async (request, { actor }) => {
    const body = await readJson(request, scrapItemBody);
    if (!body.ok) return body.response;
    return respond(await setScrapItem(catalogDb(), actor, body.data));
  },
  { permission: "scrap-price.manage" },
);
