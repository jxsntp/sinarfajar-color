"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { inventoryUnavailable, useCurrentInventory } from "@/lib/use-current-inventory";
import { Button } from "@/components/ui/button";
import { recoverEvents, visibleEvent } from "@/lib/client-events";
import { stylingReason } from "@/domains/recommendations/reason-copy";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { jewelryCategories, jewelryCategory } from "@/domains/recommendations/jewelry-categories";
import type { readResult } from "@/domains/recommendations/discovery";
import type { PaletteSnapshot } from "@/domains/color-analysis/result";
import { PhotoPickCards } from "./photo-pick-cards";

type Result = Awaited<ReturnType<typeof readResult>>;
type Item = Result["items"][number];

export function ProductVisibility({
  token,
  runId,
  item,
  detail = false,
}: {
  token: string;
  runId: string;
  item?: { sku: string; rank: number };
  detail?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const sku = item?.sku;
  const rank = item?.rank;
  useEffect(() => {
    const marker = ref.current;
    if (!marker) return;
    let seen = false,
      inView = false;
    const notify = () => {
      if (
        !seen &&
        inView &&
        document.visibilityState === "visible" &&
        !(document as Document & { prerendering?: boolean }).prerendering
      ) {
        seen = true;
        if (sku && rank)
          void visibleEvent(token, detail ? "product_detail_viewed" : "recommendation_impression", { runId, sku, rank });
        else void visibleEvent(token, "photo_recommendation_impression", { runId });
      }
    };
    const observer = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
      notify();
    });
    observer.observe(marker);
    document.addEventListener("visibilitychange", notify);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", notify);
    };
  }, [token, runId, sku, rank, detail]);
  return <span ref={ref} aria-hidden className="block h-px" />;
}
function Card({
  item,
  token,
  runId,
  locale,
  photoBase,
}: {
  item: Item;
  token: string;
  runId: string;
  locale: string;
  photoBase: string;
}) {
  const text = mobileText(locale);
  return (
    <article className="jewel">
      <ProductVisibility token={token} runId={runId} item={item} />
      {item.photoPath && (
        <Image
          unoptimized
          src={
            photoBase +
            item.photoPath.split("/").map(encodeURIComponent).join("/")
          }
          alt={item.name}
          width={420}
          height={300}
        />
      )}
      <h2>
        <Link
          prefetch={false}
          href={
            "/results/" +
            token +
            "/product/" +
            encodeURIComponent(item.sku) +
            "?run=" +
            runId
          }
          onClick={(event) => {
            if (event.isTrusted)
              void visibleEvent(token, "recommended_product_clicked", {
                sku: item.sku,
                rank: item.rank,
                runId,
              });
          }}
        >
          {item.name}
        </Link>
      </h2>
      <p>
        {item.brand} · {item.goldColor} · {item.purity}
      </p>
      <dl>
        <dt>{text.sku}</dt>
        <dd>{item.sku}</dd>
        {item.weightGrams && (
          <>
            <dt>{text.weight}</dt>
            <dd>{item.weightGrams} g</dd>
          </>
        )}
        {item.gemstones && (
          <>
            <dt>{text.gems}</dt>
            <dd>{item.gemstones}</dd>
          </>
        )}
      </dl>
      <p>
        <strong>
          {new Intl.NumberFormat(locale, {
            style: "currency",
            currency: item.currency,
          }).format(Number(item.price))}
        </strong>{" "}
        · {text.available}
      </p>
      <p>{stylingReason(item.reason, locale)}</p>
    </article>
  );
}
export function DiscoveryForm({
  token,
  initial,
  locale,
  photoBase,
  shades,
  swatchVersion,
  trialRegistered,
}: {
  token: string;
  initial: Result | null;
  locale: string;
  photoBase: string;
  shades: PaletteSnapshot;
  swatchVersion: string | null;
  trialRegistered?: boolean;
}) {
  const text = mobileText(locale);
  const [baseline, setResult] = useState(initial);
  const trial = trialRegistered !== undefined;
  const [registered, setRegistered] = useState(trialRegistered ?? true);
  const result = useCurrentInventory(token, baseline);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const attempt = useRef<{ preferences: string; key: string } | null>(null);
  const previous = initial?.status === "complete" ? initial.preferences : {};
  const english = locale === "en-US";
  useEffect(() => {
    const recover = () => {
      void recoverEvents(token);
    };
    recover();
    window.addEventListener("online", recover);
    return () => window.removeEventListener("online", recover);
  }, [token]);
  return (
    <>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          const data = new FormData(event.currentTarget);
          const selected = data.getAll("selectedSwatchIds").map(String);
          if (selected.length > 6) {
            setMessage(english ? "Choose up to six colors." : "Pilih hingga enam warna.");
            return;
          }
          const preferences = trial ? {} : {
            ...Object.fromEntries([...data].filter(([name, value]) =>
              value !== "" && name !== "selectedSwatchIds" && name !== "useColorProfile")),
            useColorProfile: data.get("useColorProfile") !== "false",
            ...(selected.length ? { selectedSwatchIds: selected.sort(), selectedSwatchVersion: swatchVersion } : {}),
          };
          const canonical = JSON.stringify(preferences);
          if (attempt.current?.preferences !== canonical)
            attempt.current = {
              preferences: canonical,
              key: crypto.randomUUID(),
            };
          setPending(true);
          setMessage("");
          try {
            if (!registered) {
              const registration = await fetch("/api/mobile/registration", {
                method: "POST",
                headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ name: data.get("name"), email: data.get("email"), phone: data.get("phone") }),
              });
              if (!registration.ok) throw new Error("registration_failed");
              setRegistered(true);
            }
            const response = await fetch("/api/mobile/recommendations", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + token,
                "Idempotency-Key": attempt.current.key,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ preferences }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error.code);
            if (json.data.status === "processing") setMessage(text.retry);
            else {
              setResult(json.data);
              attempt.current = null;
            }
          } catch (error) {
            setMessage(
              error instanceof Error && error.message === "alternatives_limit"
                ? text.limit
                : text.error,
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {trial ? (!registered && <div className="form-grid">
          <label>{text.registrationName}<input name="name" autoComplete="name" maxLength={100} required /></label>
          <label>{text.registrationEmail}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>{text.registrationPhone}<input name="phone" type="tel" autoComplete="tel" maxLength={30} required /></label>
        </div>) : <>
        <div className="form-grid">
          {Object.entries({
            category: text.category,
            minBudget: text.minimum,
            maxBudget: text.maximum,
            requiredBrand: text.brand,
            requiredGold: text.gold,
            requiredPurity: text.purity,
            style: text.style,
            occasion: text.occasion,
            preferredGold: text.preferred,
          }).map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                defaultValue={String(previous[name as keyof typeof previous] ?? "")}
                maxLength={name === "requiredBrand" ? 90 : 40}
                inputMode={name.endsWith("Budget") ? "decimal" : "text"}
              />
            </label>
          ))}
          <label>
            {text.profile}
            <select name="useColorProfile" defaultValue={String(previous.useColorProfile ?? previous.colorPreference !== "skip")}>
              <option value="true">{text.fromReport}</option>
              <option value="false">{text.skipColor}</option>
            </select>
          </label>
        </div>
        {!!shades.length && <details className="palette-overrides">
          <summary>{english ? "Choose accent colors" : "Pilih warna aksen"}</summary>
          <p>{english ? "Choose up to six preferred shades." : "Pilih hingga enam warna favorit."}</p>
          <div className="form-grid">{shades.map((swatch) => <label key={swatch.id} className="inline-option">
            <input type="checkbox" name="selectedSwatchIds" value={swatch.id}
              defaultChecked={previous.selectedSwatchVersion === swatchVersion && previous.selectedSwatchIds?.includes(swatch.id)} />
            <span className="accent-sample" aria-hidden style={{ backgroundColor: swatch.display }} />
            {swatch.label[english ? "en" : "id"]}
          </label>)}</div>
        </details>}
        </>}
        <Button type="submit" disabled={pending}>
          {pending
            ? text.loading
            : !registered ? text.registerAndDiscover
            : result?.status === "complete"
              ? (trial ? text.refresh : text.edit)
              : text.submit}
        </Button>
      </form>
      <p role="status">{message || (baseline && !result ? inventoryUnavailable(locale) : "")}</p>
      {result?.status === "complete" && (
        <section>
          <h2>{text.selection}</h2>
          {result.fallback && <p>{text.fallback}</p>}
          {result.photoItems ? <>
            {!!result.photoItems.length && <ProductVisibility token={token} runId={result.runId} />}
            <PhotoPickCards items={result.photoItems} locale={locale} token={token} />
          </> : (trial ? jewelryCategories.map((category) => ({
            category, items: result.items.filter((item) => jewelryCategory(item.category) === category),
          })) : [{ category: null, items: result.items }]).map(({ category, items }) => (
            <section key={category ?? "all"}>
              {category && <h3>{text.jewelryCategories[category]}</h3>}
              {items.length ? items.map((item) => (
                <Card
                  item={item}
                  key={result.runId + item.sku}
                  runId={result.runId}
                  token={token}
                  locale={locale}
                  photoBase={photoBase}
                />
              )) : <p>{category ? text.categoryEmpty : text.empty}</p>}
            </section>
          ))}
        </section>
      )}
    </>
  );
}
