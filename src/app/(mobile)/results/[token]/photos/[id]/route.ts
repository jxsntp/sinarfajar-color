import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { reportScope } from "@/domains/sessions/service";
import { isRegistered } from "@/domains/sessions/registration";
import { photoUrl } from "@/domains/catalog/photo";

const mediaTypes: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const headers = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_req: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params;
  if (!token.startsWith("report_") || !z.uuid().safeParse(id).success) return new Response(null, { status: 404, headers });
  try {
    const session = await reportScope(token);
    if (!(await isRegistered(session))) return new Response(null, { status: 404, headers });
    const item = await db.photoCatalogItem.findFirst({
      where: { id, organizationId: session.organizationId, storeId: session.storeId, state: "PUBLISHED" },
      select: { storagePath: true },
    });
    const mime = item && mediaTypes[item.storagePath.split(".").pop() ?? ""];
    if (!item || !mime) return new Response(null, { status: 404, headers });
    const photo = await fetch(photoUrl(item.storagePath), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!photo.ok || !photo.body) return new Response(null, { status: 502, headers });
    return new Response(photo.body, { headers: { ...headers, "Content-Type": mime } });
  } catch (error) {
    return new Response(null, { status: error instanceof HttpError ? 404 : 503, headers });
  }
}
