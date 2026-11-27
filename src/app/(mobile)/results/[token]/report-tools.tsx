"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { TryOnConfirmation } from "./try-on-confirmation";
import { visibleEvent } from "@/lib/client-events";
import { experience, type Tone } from "@/domains/sessions/palette";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { Button } from "@/components/ui/button";

export async function mobileAction(token: string, data: object) {
  const response = await fetch("/api/mobile/actions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error.code);
  return json.data;
}

function makeCard(
  colors: string[],
  title: string,
  label: string,
  names?: string[],
): Promise<Blob | null> {
  const card = document.createElement("canvas");
  card.width = 960;
  card.height = 540;
  const context = card.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.fillStyle = "#F8F2E8";
  context.fillRect(0, 0, 960, 540);
  context.fillStyle = "#35271D";
  context.font = "62px Georgia";
  context.fillText(title, 62, 120, 820);
  context.font = "26px sans-serif";
  context.fillText(label, 64, 174, 820);
  const width = 824 / colors.length;
  colors.forEach((color, i) => {
    context.fillStyle = color;
    context.fillRect(64 + i * width, 229, width, 207);
    context.fillStyle = "#35271D";
    context.fillText(names?.[i] ?? color.toUpperCase(), 65 + i * width, 478, width - 4);
  });
  return new Promise((resolve) => card.toBlob(resolve, "image/png"));
}

export function ReportTools({
  token,
  locale,
  tone,
  colors,
  brand,
  paletteLabel,
  swatchNames,
  social,
}: {
  token: string;
  locale: string;
  tone: Tone;
  colors: string[];
  brand: string;
  paletteLabel?: string;
  swatchNames?: string[];
  social?: string;
}) {
  const copy = experience(locale);
  const text = mobileText(locale);
  const [status, setStatus] = useState("");
  const [checkout, setCheckout] = useState<{
    code: string;
    expiresAt: string;
    image: string;
  } | null>(null);
  useEffect(() => {
    if (!checkout) return;
    const timer = setTimeout(
      () => setCheckout(null),
      Math.max(0, Date.parse(checkout.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [checkout]);
  async function card(share: boolean) {
    setStatus("");
    try {
      const blob = await makeCard(
        colors,
        brand,
        paletteLabel ?? (tone === "uncertain" ? copy.unsure : copy.own),
        swatchNames,
      );
      if (!blob) throw new Error("card");
      const file = new File([blob], "sinar-fajar-palette.png", {
        type: "image/png",
      });
      if (share) {
        if (!navigator.canShare?.({ files: [file] })) throw new Error("share");
        void visibleEvent(token, "report_share_initiated");
        await navigator.share({ files: [file], title: brand });
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        void visibleEvent(token, "results_saved");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setStatus(copy.sharedError);
    }
  }
  async function act(input: object) {
    setStatus("");
    try {
      const result = await mobileAction(token, input);
      if (result.code) {
        setCheckout({
          code: result.code,
          expiresAt: result.expiresAt,
          image: await QRCode.toDataURL(result.code, { width: 220, margin: 4 }),
        });
      } else setStatus(text.updated);
    } catch {
      setStatus(text.failure);
    }
  }
  return (
    <div className="mobile-tools">
      <div className="controls">
        <button className="choice" onClick={() => void card(false)}>
          {copy.save}
        </button>
        <button className="choice" onClick={() => void card(true)}>
          {copy.share}
        </button>
      </div>
      {social && (
        <p>
          <a
            className="text-button"
            href={social}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void visibleEvent(token, "social_link_clicked")}
          >
            {text.social}
          </a>
        </p>
      )}
      <details>
        <summary>{text.feedback}</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const rating = Number(
              new FormData(event.currentTarget).get("rating"),
            );
            void act({ action: "feedback", rating });
          }}
        >
          <label>
            {text.rating}
            <select name="rating" defaultValue="5">
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Button type="submit">{text.send}</Button>
        </form>
      </details>
      <details>
        <summary>
          {locale === "en-US"
            ? "Rate recommendation relevance"
            : "Nilai relevansi rekomendasi"}
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act({
              action: "relevance",
              rating: Number(new FormData(e.currentTarget).get("rating")),
            });
          }}
        >
          <label>
            {text.rating}
            <select name="rating" defaultValue="5">
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Button type="submit">{text.send}</Button>
        </form>
      </details>
      <details>
        <summary>{text.marketing}</summary>
        <div className="controls">
          <button
            className="choice"
            onClick={() => void act({ action: "marketing", granted: true })}
          >
            {text.optIn}
          </button>
          <button
            className="choice"
            onClick={() => void act({ action: "marketing", granted: false })}
          >
            {text.optOut}
          </button>
        </div>
      </details>
      <TryOnConfirmation token={token} locale={locale} />
      <details>
        <summary>{text.checkout}</summary>
        <Button onClick={() => void act({ action: "checkout" })}>
          {text.checkout}
        </Button>
        {checkout && (
          <p role="status" className="break-all">
            {text.checkoutHint}
            <br />
            <Image
              src={checkout.image}
              alt={
                locale === "en-US"
                  ? "Cashier attribution QR"
                  : "QR atribusi kasir"
              }
              width={220}
              height={220}
              unoptimized
            />
            <code>{checkout.code}</code>
          </p>
        )}
      </details>
      <p role="status">{status}</p>
    </div>
  );
}
