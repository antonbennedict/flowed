import { useId } from "react";

/**
 * The Flowed mark (keep in sync with resources/brand/flowed-mark.svg).
 * One stroke rises and flows into a wave to form an "F"; the middle arm
 * sheds droplets in the direction of the flow.
 */
export function FlowedMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 120" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F46E5" /><stop offset="0.55" stopColor="#7C3AED" /><stop offset="1" stopColor="#C026D3" />
        </linearGradient>
        <radialGradient id={`${id}hl`} cx="0.25" cy="0.15" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}ink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#EDE9FE" />
        </linearGradient>
        <clipPath id={`${id}clip`}><rect width="120" height="120" rx="30" /></clipPath>
      </defs>
      <rect width="120" height="120" rx="30" fill={`url(#${id}bg)`} />
      <g clipPath={`url(#${id}clip)`}>
      <path d="M-4 84 C 22 70, 44 98, 72 86 S 112 70, 126 78 L126 126 L-4 126Z" fill="#fff" opacity="0.07" />
      <path d="M-4 98 C 26 86, 50 112, 80 100 S 116 88, 126 94 L126 126 L-4 126Z" fill="#fff" opacity="0.07" />
      <rect width="120" height="120" rx="30" fill={`url(#${id}hl)`} />
      </g>
      <g fill="none" stroke={`url(#${id}ink)`} strokeLinecap="round" strokeLinejoin="round">
        <path d="M42 93 C40 72 38 52 45 40 C52 27 66 25 75 31 C83 36 89 33 93 25" strokeWidth="12.5" pathLength={1} />
        <path d="M41.5 63 C50 55 58 67 70 59" strokeWidth="10.5" pathLength={1} />
      </g>
      <g fill="#fff">
        <circle cx="82.5" cy="55" r="4.2" opacity="0.92" /><circle cx="91.5" cy="52" r="3" opacity="0.7" /><circle cx="98.5" cy="50" r="1.9" opacity="0.5" />
      </g>
    </svg>
  );
}
