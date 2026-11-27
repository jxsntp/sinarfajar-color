"use client";

import { clearReportEvents } from "@/lib/client-events";
import { useState } from "react";

export function PrivacyControls({ token, locale }: { token: string; locale: string }) {
  const id = locale.startsWith("id");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(action: "marketing" | "local_camera" | "erase") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/mobile/privacy", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(action === "erase" ? { action, confirm: "delete" } : { action: "withdraw", purpose: action }),
      });
      if (!response.ok) throw new Error();
      if (action === "erase") {
        await clearReportEvents(token).catch(() => {});
        window.location.replace("/report-deleted");
      }
      else setMessage(id ? "Persetujuan telah ditarik." : "Consent withdrawn.");
    } catch {
      setMessage(id ? "Permintaan belum berhasil. Coba lagi." : "We could not update your privacy settings. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>{id ? "Privasi dan data" : "Privacy and data"}</summary>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="text-button" disabled={busy} onClick={() => void update("marketing")}>{id ? "Tarik persetujuan pemasaran" : "Withdraw marketing consent"}</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => void update("local_camera")}>{id ? "Tarik persetujuan kamera" : "Withdraw camera consent"}</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => setConfirm(!confirm)}>{id ? "Hapus laporan dan data sesi" : "Delete report and session data"}</button>
      </div>
      {confirm && (
        <div>
          <p>{id ? "Tindakan ini menonaktifkan tautan laporan dan tidak dapat dibatalkan." : "This permanently removes the report and disables its link."}</p>
          <button type="button" className="text-button" disabled={busy} onClick={() => void update("erase")}>{id ? "Konfirmasi penghapusan" : "Confirm deletion"}</button>
        </div>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
