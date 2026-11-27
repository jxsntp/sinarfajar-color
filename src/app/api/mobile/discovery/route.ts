import { z } from "zod";
import { bearer, endpoint } from "@/lib/http";
import { readResult } from "@/domains/recommendations/discovery";
export const GET = (req: Request) =>
  endpoint("discovery.read", () =>
    readResult(
      bearer(req),
      z.uuid().parse(new URL(req.url).searchParams.get("runId")),
    ),
  );
