import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const pilot = {
  slug: "sinar-fajar",
  name: "Sinar Fajar",
  locale: "id-ID",
  accent: "#61394c",
};
export async function brandFor(organizationId?: string) {
  const where = organizationId
    ? { id: organizationId }
    : { slug: env().CLIENT_SLUG };
  return db.organization.findUniqueOrThrow({
    where,
    select: { name: true, locale: true, accent: true, slug: true },
  });
}
export const copy = {
  "id-ID": {
    studio: "Studio Warna",
    compare: "Bandingkan palet",
    staff: "Masuk staf",
    result: "Palet pribadi Anda",
    begin: "Mulai sesi",
    warm: "Hangat",
    cool: "Sejuk",
    neutral: "Netral",
    uncertain: "Belum yakin",
    reset: "Akhiri sesi",
    scan: "Pindai untuk membuka laporan",
    select: "Simpan palet",
    enroll: "Hubungkan perangkat",
    key: "Kode perangkat",
    choose: "Pilih nuansa yang Anda sukai.",
    offline: "Permintaan gagal. Silakan coba lagi.",
    waiting: "Memproses…",
    expired: "Sesi berakhir. Mulai sesi baru.",
  },
  "en-US": {
    studio: "Color Studio",
    compare: "Compare palettes",
    staff: "Staff sign in",
    result: "Your personal palette",
    begin: "Start session",
    warm: "Warm",
    cool: "Cool",
    neutral: "Neutral",
    uncertain: "Unsure",
    reset: "End session",
    scan: "Scan to open your report",
    select: "Save palette",
    enroll: "Connect device",
    key: "Device key",
    choose: "Choose the tones you prefer.",
    offline: "Request failed. Please try again.",
    waiting: "Working…",
    expired: "Session ended. Start a new session.",
  },
};
export const messages = (locale: string) =>
  copy[locale === "id-ID" ? "id-ID" : "en-US"];
