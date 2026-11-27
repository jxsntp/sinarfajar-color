import * as React from "react";
import { cn } from "@/lib/utils";
export function Button({
  className,
  type = "button",
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "action inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-offset-4 disabled:cursor-wait disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
