import { notFound } from "next/navigation";
import { HttpError } from "@/lib/http";
import { reportScope } from "./service";
export async function mobileSession(token: string) {
  try {
    return await reportScope(token);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) notFound();
    throw error;
  }
}
