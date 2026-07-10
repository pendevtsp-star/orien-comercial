import type { CSSProperties } from "react";
import { cn } from "../lib/cn";

export interface BrandLogoProps {
  className?: string;
  iconOnly?: boolean;
  tagline?: string;
  theme?: "light" | "dark";
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { icon: 28, wordmark: "text-2xl", tagline: "text-[11px]" },
  md: { icon: 36, wordmark: "text-[2.25rem]", tagline: "text-xs" },
  lg: { icon: 46, wordmark: "text-[3rem]", tagline: "text-sm" }
} as const;

export function BrandLogo({ className, iconOnly = false, tagline, theme = "light", size = "md" }: BrandLogoProps) {
  const palette =
    theme === "dark"
      ? { ink: "#FAFAFA", accent: "#F5C34A", muted: "rgba(250,250,250,0.82)" }
      : { ink: "#0B1D3D", accent: "#F5C34A", muted: "#4A5977" };
  const dimensions = sizeMap[size];

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <BrandCompass iconSize={dimensions.icon} palette={palette} />
      {iconOnly ? null : (
        <div className="flex items-center gap-4">
          <div
            className={cn("leading-none tracking-normal", dimensions.wordmark)}
            style={{ color: palette.ink, fontFamily: "var(--font-display), Georgia, serif", fontWeight: 600 }}
          >
            Orien
          </div>
          {tagline ? (
            <div className="flex items-center gap-3">
              <span className="h-10 w-px" style={{ backgroundColor: palette.accent }} />
              <p
                className={cn("max-w-[11rem] leading-5", dimensions.tagline)}
                style={{ color: palette.muted, fontFamily: "var(--font-sans), Inter, sans-serif" }}
              >
                {tagline}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BrandCompass({
  iconSize,
  palette
}: {
  iconSize: number;
  palette: { ink: string; accent: string };
}) {
  const style = { width: iconSize, height: iconSize } satisfies CSSProperties;

  return (
    <svg viewBox="0 0 80 80" aria-hidden="true" style={style}>
      <circle cx="40" cy="40" r="28" fill="none" stroke={palette.ink} strokeWidth="4" />
      <path d="M40 8v7M40 65v7M8 40h7M65 40h7" stroke={palette.ink} strokeWidth="4" strokeLinecap="round" />
      <path d="M39 20 52 49 37 42Z" fill={palette.accent} />
      <path d="M39 20 28 54 37 42Z" fill="none" stroke={palette.ink} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}
