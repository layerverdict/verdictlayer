type LogoProps = {
  size?: number;
  className?: string;
};

export function VerdictLogo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="26"
        height="26"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 9 L12.5 20 L18 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20.5" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}
