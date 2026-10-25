import React from "react";

// Thin line icons on a 24 px grid, drawn like the site's masthead icons
// (web/components/SiteNav.tsx). "car" is the site's own rental icon.
const PATHS: Record<string, React.ReactNode> = {
  car: (
    <>
      <path d="M3 15.5v-3l2.2-4.6A2 2 0 0 1 7 6.8h10a2 2 0 0 1 1.8 1.1l2.2 4.6v3z" />
      <path d="M3 12.5h18" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
  hotel: (
    <>
      <path d="M3 18V7M21 18v-5a3 3 0 0 0-3-3h-7v8" />
      <path d="M3 14h18" />
      <circle cx="7" cy="11" r="1.8" />
    </>
  ),
  apartment: (
    <>
      <path d="M5 21V4h10v17M15 9h4v12" />
      <path d="M8 7.5h1M11 7.5h1M8 11h1M11 11h1M8 14.5h1M11 14.5h1" />
      <path d="M9 21v-3h2v3M3 21h18" />
    </>
  ),
  equipment: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8.5 7.5 10 5h4l1.5 2.5" />
    </>
  ),
  scooter: (
    <>
      <circle cx="5.5" cy="17.5" r="2" />
      <circle cx="18.5" cy="17.5" r="2" />
      <path d="M7.5 17.5h9l-3-12h3" />
    </>
  ),
  gear: (
    <>
      <path d="M7 8V6a5 5 0 0 1 10 0v2" />
      <rect x="4.5" y="8" width="15" height="13" rx="3" />
      <path d="M9 13h6" />
    </>
  ),
  returns: (
    <>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </>
  ),
  claim: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10.5 5h3" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export const Icon: React.FC<{
  name: IconName;
  size: number;
  color: string;
  stroke?: number;
}> = ({ name, size, color, stroke = 1.25 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {PATHS[name]}
  </svg>
);
