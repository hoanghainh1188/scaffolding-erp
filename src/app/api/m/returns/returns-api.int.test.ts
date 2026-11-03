// Return and compensation routes (returns-and-compensation tasks 4.1, 4.2;
// returns spec "M4 không hiện giá", "Quyền với phiếu thu hồi", return-photos
// "Xem ảnh cần đăng nhập và quyền", compensations "Quyền với phiếu đền bù").
import { randomUUID } from "node:crypto";

import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { compensationNote } from "@/db/schema";
import {
  appRequest,
  createTestContext,
  createTestUser,
  installTestContext,
  signInAs,
  TEST_BASE_URL,
  TEST_PASSWORD,
} from "@/test/auth";
import {
  returnOf,
  setupReturnFixture,
  type ReturnFixture,
} from "@/test/returns";

import * as approve from "../../compensations/[id]/approve/route";
import * as compensationOne from "../../compensations/[id]/route";
import * as compensations from "../../compensations/route";
import * as photo from "../../returns/photos/[id]/route";
import * as desktopReturn from "../../returns/[code]/route";
import * as contractOne from "./contracts/[id]/route";
import * as contractList from "./contracts/route";
import * as photos from "./photos/route";
import * as returns from "./route";

const ctx = createTestContext();
const uninstall = installTestContext(ctx);
afterAll(async () => {
  uninstall();
  await ctx.close();
});

let fx: ReturnFixture;
const cookies = new Map<string, string>();

beforeEach(async () => {
  fx = await setupReturnFixture(ctx);
  cookies.clear();
  await fx.seller("thuyvy", "SALE");
  await createTestUser(ctx, { role: "WORKSHOP", username: "thoxuong" });
  for (const name of [
    "quocbao",
    "minhanh",
    "thuha",
    "vantung",
    "thuyvy",
    "thoxuong",
  ]) {
    cookies.set(
      name,
      await signInAs(ctx, { username: name, password: TEST_PASSWORD }),
    );
  }
});

type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

function call(
  handler: unknown,
  path: string,
  options: {
    method?: string;
    as?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
) {
  return (handler as Handler)(
    appRequest(path, {
      method: options.method ?? "GET",
      cookie: options.as ? cookies.get(options.as) : undefined,
      body: options.body,
    }),
    { params: Promise.resolve(options.params ?? {}) },
  );
}

function upload(as: string, form: FormData) {
  const headers = new Headers({ origin: TEST_BASE_URL });
  const cookie = cookies.get(as);
  if (cookie) headers.set("cookie", cookie);
  return (photos.POST as Handler)(
    new Request(`${TEST_BASE_URL}/api/m/returns/photos`, {
      method: "POST",
      headers,
      body: form,
    }),
    { params: Promise.resolve({}) },
  );
}

/** Every key of a JSON value, nested. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  }
  return [];
}

const MONEY_KEYS = [
  "price",
  "unitPrice",
  "amount",
  "amountDue",
  "dayRent",
  "unitCost",
  "values",
  "total",
];

describe("phone routes", () => {
  it("answers M4 without any price or money", async () => {
    const list = await call(
      contractList.GET,
      "/api/m/returns/contracts?q=Dương",
      { as: "vantung" },
    );
    const one = await call(
      contractOne.GET,
      `/api/m/returns/contracts/${fx.deal.id}`,
      {
        as: "vantung",
        params: { id: fx.deal.id },
      },
    );
    expect(list.status).toBe(200);
    expect(one.status).toBe(200);
    for (const response of [list, one]) {
      const keys = keysOf(await response.json());
      for (const key of MONEY_KEYS) expect(keys).not.toContain(key);
    }
  });

  it("posts with 201 and answers a resent draft with 200 and the same note", async () => {
    const body = {
      clientDraftId: randomUUID(),
      contractId: fx.deal.id,
      yardLocationId: fx.yard,
      lines: [{ itemId: fx.item("GG-CH"), good: "5" }],
    };
    const first = await call(returns.POST, "/api/m/returns", {
      method: "POST",
      as: "vantung",
      body,
    });
    const again = await call(returns.POST, "/api/m/returns", {
      method: "POST",
      as: "vantung",
      body,
    });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect((await again.json()).data.code).toBe("PTH-2026-001");
  });

  it("refuses sales and the workshop", async () => {
    const body = {
      clientDraftId: randomUUID(),
      contractId: fx.deal.id,
      yardLocationId: fx.yard,
      lines: [{ itemId: fx.item("GG-CH"), good: "5" }],
    };
    for (const as of ["quocbao", "thoxuong"]) {
      const response = await call(returns.POST, "/api/m/returns", {
        method: "POST",
        as,
        body,
      });
      expect(response.status).toBe(403);
    }
  });

  it("answers 422 PHOTOS_EXPIRED with the photo ids", async () => {
    const gone = randomUUID();
    const response = await call(returns.POST, "/api/m/returns", {
      method: "POST",
      as: "vantung",
      body: {
        clientDraftId: randomUUID(),
        contractId: fx.deal.id,
        yardLocationId: fx.yard,
        lines: [{ itemId: fx.item("GG-CH"), good: "5" }],
        photoIds: [gone],
      },
    });
    expect(response.status).toBe(422);
    expect((await response.json()).data).toEqual({
      code: "PHOTOS_EXPIRED",
      expiredPhotoIds: [gone],
    });
  });

  it("takes a photo by its bytes and refuses a PDF named .jpg", async () => {
    const draftId = randomUUID();
    const form = new FormData();
    form.set("draftId", draftId);
    form.set("clientPhotoId", randomUUID());
    form.set(
      "file",
      new Blob([
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#123456" },
        })
          .jpeg()
          .toBuffer(),
      ]),
      "khung.jpg",
    );
    const sent = await upload("vantung", form);
    expect(sent.status).toBe(201);

    const fake = new FormData();
    fake.set("draftId", draftId);
    fake.set("clientPhotoId", randomUUID());
    fake.set(
      "file",
      new Blob(["%PDF-1.7"], { type: "image/jpeg" }),
      "bao-cao.jpg",
    );
    const refused = await upload("vantung", fake);
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toBe(
      "File này không phải ảnh JPEG, PNG hoặc WebP.",
    );
  });
});

describe("office routes", () => {
  async function postedWithPhoto() {
    const draftId = randomUUID();
    const form = new FormData();
    form.set("draftId", draftId);
    form.set("clientPhotoId", randomUUID());
    form.set(
      "file",
      new Blob([
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#123456" },
        })
          .jpeg()
          .toBuffer(),
      ]),
      "x.jpg",
    );
    const sent = await (await upload("vantung", form)).json();
    await returnOf(
      ctx,
      fx,
      { "GG-CH": [0, 5, 0, 0] },
      { draftId, body: { photoIds: [sent.data.id] } },
    );
    return sent.data.id as string;
  }

  it("lets the accountant read D8 but not approve; the storekeeper reads none", async () => {
    await postedWithPhoto();
    const [note] = await ctx.db.select().from(compensationNote);
    const id = note?.id ?? "";
    const read = await call(compensationOne.GET, `/api/compensations/${id}`, {
      as: "thuha",
      params: { id },
    });
    expect(read.status).toBe(200);
    const approved = await call(
      approve.POST,
      `/api/compensations/${id}/approve`,
      {
        method: "POST",
        as: "thuha",
        body: { updatedAt: note?.updatedAt.toISOString() },
        params: { id },
      },
    );
    expect(approved.status).toBe(403);
    const list = await call(compensations.GET, "/api/compensations", {
      as: "vantung",
    });
    expect(list.status).toBe(403);
  });

  it("guards the return detail and its photo", async () => {
    const photoId = await postedWithPhoto();
    const detail = await call(desktopReturn.GET, "/api/returns/PTH-2026-001", {
      as: "thuyvy",
      params: { code: "PTH-2026-001" },
    });
    expect(detail.status).toBe(403);
    const hidden = await call(photo.GET, `/api/returns/photos/${photoId}`, {
      as: "thuyvy",
      params: { id: photoId },
    });
    expect(hidden.status).toBe(404);
    const anonymous = await call(photo.GET, `/api/returns/photos/${photoId}`, {
      params: { id: photoId },
    });
    expect(anonymous.status).toBe(401);
    const shown = await call(photo.GET, `/api/returns/photos/${photoId}`, {
      as: "thuha",
      params: { id: photoId },
    });
    expect(shown.status).toBe(200);
    expect(shown.headers.get("content-type")).toBe("image/webp");
    expect(shown.headers.get("cache-control")).toBe("private, no-store");
    expect(shown.headers.get("x-content-type-options")).toBe("nosniff");
    const removed = await call(photo.DELETE, `/api/returns/photos/${photoId}`, {
      method: "DELETE",
      as: "minhanh",
      params: { id: photoId },
    });
    expect(removed.status).toBe(405);
  });
});
