"use client";
import { useEffect } from "react";
import { recoverEvents, visibleEvent } from "@/lib/client-events";

export function ReportOpen({ token }: { token: string }) {
  useEffect(() => {
    let notified = false;
    const recover = () => {
      void recoverEvents(token);
    };
    const notify = () => {
      const page = document as Document & { prerendering?: boolean };
      if (
        !notified &&
        page.visibilityState === "visible" &&
        !page.prerendering &&
        document.hasFocus()
      ) {
        notified = true;
        void visibleEvent(token, "mobile_report_opened");
      }
    };
    document.addEventListener("visibilitychange", notify);
    document.addEventListener("prerenderingchange", notify);
    window.addEventListener("focus", notify);
    window.addEventListener("online", recover);
    recover();
    notify();
    return () => {
      document.removeEventListener("visibilitychange", notify);
      document.removeEventListener("prerenderingchange", notify);
      window.removeEventListener("focus", notify);
      window.removeEventListener("online", recover);
    };
  }, [token]);
  return null;
}
