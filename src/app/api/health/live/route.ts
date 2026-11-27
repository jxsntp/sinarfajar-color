export const GET = () => Response.json({ status: "available" }, { headers: { "Cache-Control": "no-store" } });
