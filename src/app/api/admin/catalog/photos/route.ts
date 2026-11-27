import { z } from "zod";
import { currentStaff } from "@/domains/authentication/staff";
import { addCatalogPhoto, analyzeCatalogPhoto, reviewCatalogPhoto } from "@/domains/catalog/photo-catalog";
import { photoUploadLimit } from "@/domains/catalog/photo";
import { photoCatalogCommand } from "@/domains/catalog/photo-tags";
import { endpoint, HttpError, requireOrigin } from "@/lib/http";
import { boundedJson, consumeQuota } from "@/lib/security";

export const POST = (req: Request) =>
  endpoint("catalog.photos.upload", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    await consumeQuota("catalog-photo-upload", scope.userId, 36, 60);
    const maxBytes = photoUploadLimit + 16_384;
    if (Number(req.headers.get("content-length")) > maxBytes)
      throw new HttpError(413, "body_too_large");
    const type = req.headers.get("content-type");
    if (!type?.startsWith("multipart/form-data;") || !req.body)
      throw new HttpError(400, "photo_required");
    let size = 0;
    const body = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > maxBytes) throw new HttpError(413, "body_too_large");
        controller.enqueue(chunk);
      },
    }));
    const data = await new Response(body, { headers: { "content-type": type } }).formData().catch(() => {
      throw size > maxBytes ? new HttpError(413, "body_too_large") : new HttpError(400, "invalid_photo_upload");
    });
    const file = data.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "photo_required");
    return addCatalogPhoto(scope, z.uuid().parse(data.get("storeId")), file);
  }, 201);

export const PATCH = (req: Request) =>
  endpoint("catalog.photos.review", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    const command = photoCatalogCommand.parse(await boundedJson(req, 4096));
    if (command.action === "analyze") return analyzeCatalogPhoto(scope, command.id);
    return reviewCatalogPhoto(scope, command.id, command.action === "publish" ? command : null);
  });
