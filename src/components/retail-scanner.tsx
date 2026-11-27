"use client";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

export function RetailScanner({
  label,
  onScan,
}: {
  label: string;
  onScan: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const preview = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: IScannerControls | undefined;
    let stream: MediaStream | undefined;
    const video = preview.current;
    async function scan() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (stopped || !video) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        controls = await new BrowserMultiFormatReader().decodeFromStream(
          stream,
          video,
          (result, _error, control) => {
            if (!result || stopped) return;
            stopped = true;
            control.stop();
            callback.current(result.getText());
            setOpen(false);
          },
        );
        if (stopped) controls.stop();
      } catch {
        if (!stopped) {
          setError(
            "Camera unavailable. Type the code or use a connected scanner.",
          );
          setOpen(false);
        }
      }
    }
    void scan();
    return () => {
      stopped = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [open]);
  return (
    <div className="retail-scanner">
      <button
        className="choice"
        type="button"
        aria-expanded={open}
        onClick={() => {
          setError("");
          setOpen(!open);
        }}
      >
        {open ? "Close camera" : label}
      </button>
      {open && (
        <video
          ref={preview}
          autoPlay
          muted
          playsInline
          aria-label="Scanner camera preview"
        />
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
