import Image from "next/image";

type LogoProps = {
  size?: number;
  className?: string;
};

/**
 * Verdict Layer mark.
 *
 * Ships as /public/logo.png — a rounded black plate with the white
 * chevron-V + stacked-layers glyph. Rendered through next/image so the
 * asset is optimised at build time and served as avif/webp where the
 * browser supports it.
 */
export function VerdictLogo({ size = 28, className }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="Verdict Layer"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}
