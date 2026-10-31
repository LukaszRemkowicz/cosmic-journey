import type { CSSProperties } from "react";
const paths = {
  orbit: (
    <>
      <ellipse cx="12" cy="12" rx="10" ry="4.6" transform="rotate(-38 12 12)" />
      <circle cx="12" cy="12" r="3" />
      <path d="m18 3 .6 1.4L20 5l-1.4.6L18 7l-.6-1.4L16 5l1.4-.6Z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
    </>
  ),
  play: <path d="m8 4 12 8-12 8Z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  reset: (
    <>
      <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h4m4 0h8M4 12h10m4 0h2M4 18h4m4 0h8" />
      <circle cx="10" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="10" cy="18" r="2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  star: <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  shield: (
    <>
      <path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z" />
      <path d="m8 11 3 3 5-6" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  left: (
    <>
      <path d="M4 10a8 8 0 1 1 2 8M4 4v6h6" />
    </>
  ),
  right: (
    <>
      <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 1v5m0 12v5M1 12h5m12 0h5" />
    </>
  ),
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  check: <path d="m5 12 4 4L19 6" />,
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name]}
    </svg>
  );
}
