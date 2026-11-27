import { currentStaff } from "@/domains/authentication/staff";
import { uploadPhoto } from "@/domains/catalog/photo";
import { endpoint, requireOrigin, HttpError } from "@/lib/http";
export const POST = (req: Request) =>
  endpoint(
    "catalog.photo",
    async () => {
      requireOrigin(req);
      const scope = await currentStaff("admin");
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) throw new HttpError(400, "photo_required");
      return uploadPhoto(scope.organizationId, file);
    },
    201,
  );
