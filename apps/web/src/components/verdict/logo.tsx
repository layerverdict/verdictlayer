type LogoProps = {
  size?: number;
  className?: string;
};

/**
 * Verdict Layer mark.
 *
 * Chevron-V with three stacked layers beneath, rendered with
 * `currentColor` so the mark follows the surrounding text colour in
 * both themes. Source PNG lives at /public/logo.png and is used for
 * favicon + Open Graph; inline usage prefers this SVG.
 */
export function VerdictLogo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Main V */}
      <path
        d="M22 18 L35 18 L50 55 L65 18 L78 18 L56 68 L44 68 Z"
        strokeLinejoin="round"
      />
      {/* Layer 1 (closest to V) */}
      <path
        d="M34 72 L66 72 L56 82 L44 82 Z"
        strokeLinejoin="round"
      />
      {/* Layer 2 */}
      <path
        d="M32 86 L68 86 L58 94 L42 94 Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
