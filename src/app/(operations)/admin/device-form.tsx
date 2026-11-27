"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function DeviceForm({
  stores,
}: {
  stores: { id: string; name: string }[];
}) {
  const [result, setResult] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(e.currentTarget));
        try {
          const response = await fetch("/api/devices", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          const json = await response.json();
          setResult(response.ok ? json.data.credential : "Registration failed");
        } catch {
          setResult("Connection failed");
        }
      }}
    >
      <h2>Register a kiosk</h2>
      <label>
        Store
        <select name="storeId">
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Device name
        <input name="label" maxLength={80} required />
      </label>
      <Button type="submit">Register device</Button>
      {result && (
        <p role="status" className="break-all">
          {result}
        </p>
      )}
    </form>
  );
}
