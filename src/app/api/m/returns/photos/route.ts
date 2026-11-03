import { PHOTO_MAX_UPLOAD_BYTES, PHOTO_MESSAGES } from "@/domain/return-photo";
import { fail } from "@/lib/api-response";
import { withAuth } from "@/lib/auth/guard";
import { catalogDb, respond } from "@/lib/catalog/respond";
import { contractActor } from "@/lib/contracts/respond";
import { uploadReturnPhoto } from "@/lib/returns/photos";

/** Room for the form fields around the photo. */
const FORM_OVERHEAD = 16 * 1024;

/**
 * One photo of a return draft (multipart: draftId, clientPhotoId, caption,
 * file). The file name and Content-Type are ignored (design D4).
 */
export const POST = withAuth(
  async (request, { user, actor }) => {
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > PHOTO_MAX_UPLOAD_BYTES + FORM_OVERHEAD) {
      return fail(PHOTO_MESSAGES.tooLarge, 413);
    }
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(PHOTO_MESSAGES.notImage, 400);
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) return fail(PHOTO_MESSAGES.notImage, 400);
    if (file.size > PHOTO_MAX_UPLOAD_BYTES) {
      return fail(PHOTO_MESSAGES.tooLarge, 413);
    }
    const field = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value : undefined;
    };
    const result = await uploadReturnPhoto(
      catalogDb(),
      contractActor(user, actor),
      {
        draftId: field("draftId"),
        clientPhotoId: field("clientPhotoId"),
        caption: field("caption") ?? null,
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    return respond(result, 201);
  },
  { permission: "returns.receive" },
);
