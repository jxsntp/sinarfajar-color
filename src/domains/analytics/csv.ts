export function csvRow(values: (string | number | null | undefined)[]) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      const safe =
        typeof value === "string" &&
        /^[\s\u0000-\u001f]*[=+@\-]|^[\t\r\n]/.test(text)
          ? "'" + text
          : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    })
    .join(",");
}
