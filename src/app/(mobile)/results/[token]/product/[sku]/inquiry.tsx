"use client";
import { useState } from "react";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { Button } from "@/components/ui/button";
import { mobileAction } from "../../report-tools";

export function Inquiry({
  token,
  sku,
  runId,
  locale,
}: {
  token: string;
  sku: string;
  runId: string;
  locale: string;
}) {
  const text = mobileText(locale);
  const [choice, setChoice] = useState("inquiry");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="inquiry-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setStatus("");
        try {
          await mobileAction(token, {
            action: choice === "tryon" ? "tryon" : "inquiry",
            sku,
            runId,
            mode: choice === "later" ? "later" : "in_store",
            email: choice === "later" ? form.get("email") : undefined,
          });
          setStatus(text.success);
        } catch (error) {
          setStatus(
            error instanceof Error && error.message === "use_later_contact"
              ? text.laterOnly
              : text.failure,
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <label>
        {text.inquiry}
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="inquiry">
            {locale === "id-ID" ? "Tanya staf di toko" : "Ask staff in store"}
          </option>
          <option value="tryon">{text.tryon}</option>
          <option value="later">{text.later}</option>
        </select>
      </label>
      {choice === "later" && (
        <label>
          {text.email}
          <input
            required
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
          />
        </label>
      )}
      <Button type="submit" disabled={pending}>
        {text.send}
      </Button>
      <p role="status">{status}</p>
    </form>
  );
}
