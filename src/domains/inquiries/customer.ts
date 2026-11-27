import { verifiedInventory } from "../inventory/freshness";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { digest, issue } from "@/lib/credentials";
import { reportScope } from "../sessions/service";
import { posStore } from "../integrations/pos";
import { writeEvent } from "../analytics/events";
import { raiseAlert } from "../operations/alerts";

export const customerAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["inquiry", "tryon"]),
      sku: z.string().min(1).max(64),
      runId: z.uuid(),
      mode: z.enum(["in_store", "later"]),
      email: z.email().max(254).optional(),
    })
    .strict(),
  z
    .object({
      action: z.enum(["feedback", "relevance"]),
      rating: z.number().int().min(1).max(5),
    })
    .strict(),
  z.object({ action: z.literal("marketing"), granted: z.boolean() }).strict(),
  z.object({ action: z.literal("checkout") }).strict(),
]);

export async function submitCustomerAction(
  token: string,
  input: z.output<typeof customerAction>,
) {
  return db.$transaction(async (tx) => {
    const session = await reportScope(token, tx);
    await tx.$queryRaw`SELECT id FROM "CustomerSession" WHERE id = ${session.id}::uuid FOR UPDATE`;
    const scope = {
      sessionId: session.id,
      organizationId: session.organizationId,
    };
    const track = (
      name: string,
      reference?: { productId: string; runId: string; rank: number },
    ) =>
      writeEvent(tx, session, "MOBILE", {
        id: randomUUID(),
        name,
        occurredAt: new Date(),
        ...reference,
      });
    if (input.action === "checkout") {
      const code = issue("checkout");
      const expiresAt = new Date(Date.now() + 900000);
      await tx.customerSession.update({
        where: { id: session.id },
        data: {
          checkoutHash: digest(code, "checkout"),
          checkoutExpiresAt: expiresAt,
        },
      });
      return { code, expiresAt };
    }
    if ("rating" in input) {
      const subject = input.action === "relevance" ? "relevance" : "discovery";
      if (
        subject === "relevance" &&
        !(await tx.interactionEvent.findFirst({
          where: { ...scope, name: "recommendation_impression" },
          select: { id: true },
        }))
      )
        throw new HttpError(409, "recommendation_required");
      const previous = await tx.feedback.findFirst({
        where: { ...scope, subject },
      });
      if (previous)
        await tx.feedback.update({
          where: { id: previous.id },
          data: { rating: input.rating },
        });
      else {
        await tx.feedback.create({
          data: { ...scope, subject, rating: input.rating },
        });
        await track(
          subject === "relevance"
            ? "relevance_submitted"
            : "feedback_submitted",
        );
      }
      return { saved: true };
    }
    if (input.action === "marketing") {
      if (!input.granted) await tx.productInquiry.updateMany({ where: { ...scope, contactEmail: { not: null } }, data: { contactEmail: null } });
      const consent = await tx.consent.findFirst({
        where: { ...scope, purpose: "marketing" },
        orderBy: { createdAt: "desc" },
      });
      if (consent?.granted !== input.granted) {
        await tx.consent.create({
          data: {
            ...scope,
            purpose: "marketing",
            version: "mobile-v1",
            granted: input.granted,
          },
        });
        await tx.privacyAudit.create({ data: { organizationId: session.organizationId, storeId: session.storeId, action: input.granted ? "marketing_opt_in" : "marketing_withdrawal" } });
        await track(input.granted ? "marketing_opt_in" : "marketing_opt_out");
      }
      return { saved: true };
    }
    const item = await tx.recommendationItem.findFirst({
      where: {
        organizationId: scope.organizationId,
        runId: input.runId,
        run: { sessionId: session.id, status: "COMPLETE" },
        product: {
          sku: input.sku,
          archived: false,
          stock: {
            some: {
              organizationId: scope.organizationId,
              storeId: session.storeId,
              onHand: { gt: 0 },
              ...verifiedInventory(),
            },
          },
        },
      },
    });
    if (!item) throw new HttpError(409, "product_unavailable");
    const origin = await tx.customerSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    if (
      input.mode === "in_store" &&
      Date.now() - origin.createdAt.getTime() > 2 * 3600000
    )
      throw new HttpError(409, "use_later_contact");
    if (input.mode === "later" && !input.email)
      throw new HttpError(400, "contact_required");
    const where = { ...scope, productId: item.productId };
    const reference = {
      productId: item.productId,
      runId: input.runId,
      rank: item.rank,
    };
    if (input.action === "tryon" && input.mode === "in_store") {
      if (
        !(await tx.tryOn.findFirst({
          where: {
            ...where,
            source: "customer",
            fulfillmentState: { notIn: ["COMPLETED", "CANCELLED"] },
          },
          select: { id: true },
        }))
      ) {
        const created = await tx.tryOn.create({ data: where });
        await raiseAlert(
          tx,
          session,
          "NEW_REQUEST",
          created.id,
          "New in-store try-on request.",
        );
        await track("tryon_requested", reference);
      }
    } else {
      const previous = await tx.productInquiry.findFirst({
        where: {
          ...where,
          channel: input.mode,
          fulfillmentState: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      });
      if (!previous) {
        const created = await tx.productInquiry.create({
          data: {
            ...where,
            channel: input.mode,
            status: input.mode === "later" ? "contact_later" : "requested",
            contactEmail: input.mode === "later" ? input.email : null,
          },
        });
        if (input.mode === "in_store")
          await raiseAlert(
            tx,
            session,
            "NEW_REQUEST",
            created.id,
            "New in-store product inquiry.",
          );
        await track("product_inquiry_requested", reference);
      }
    }
    return { saved: true };
  });
}

export async function resolveCheckout(posCredential: string, code: string) {
  return db.$transaction(async (tx) => {
    const scope = await posStore(tx, posCredential);
    const session = await tx.customerSession.findFirst({
      where: {
        ...scope,
        checkoutHash: digest(code, "checkout"),
        checkoutExpiresAt: { gt: new Date() },
      },
    });
    if (!session) throw new HttpError(404, "checkout_unavailable");
    return { sessionId: session.id };
  });
}
