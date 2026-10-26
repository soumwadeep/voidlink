import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  };
}

export function BrandGlyph({ size = 34, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M24 3.5 41.8 13.7v20.6L24 44.5 6.2 34.3V13.7L24 3.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.65"
      />
      <path
        d="M14 33V17.5L24 12l10 5.5V33L24 38.5 14 33Z"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.4"
      />
      <circle cx="24" cy="24" r="4.4" fill="currentColor" />
      <circle cx="14" cy="17" r="2" fill="#52f6ff" />
      <circle cx="34" cy="31" r="2" fill="#ff4fd1" />
      <path d="M14 17 24 24M34 31 24 24" stroke="currentColor" strokeWidth="1.1" opacity="0.8" />
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ArrowLeft(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="1.4" />
      <path d="M15 9V5.8c0-.7-.6-1.3-1.3-1.3H5.8c-.7 0-1.3.6-1.3 1.3v7.9c0 .7.6 1.3 1.3 1.3H9" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="5.5" r="2.4" />
      <circle cx="18" cy="18.5" r="2.4" />
      <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
    </svg>
  );
}

export function SoundOnIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" />
    </svg>
  );
}

export function SoundOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="m16 9.5 5 5M21 9.5l-5 5" />
    </svg>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5c3-.8 5.7-.3 8 1.5v13c-2.3-1.8-5-2.3-8-1.5z" />
      <path d="M20 5.5c-3-.8-5.7-.3-8 1.5v13c2.3-1.8 5-2.3 8-1.5z" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M20 5v6h-6M4 19v-6h6" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.4-3.3 2.5-5 5.5-5s5.1 1.7 5.5 5" />
      <path d="M15.5 6.2a3 3 0 0 1 0 5.8M17 14.4c2.1.4 3.3 2 3.5 4.6" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 14a4.2 4.2 0 0 1 0-6l2.2-2.2a4.2 4.2 0 0 1 6 6L16 14" />
      <path d="M14 10a4.2 4.2 0 0 1 0 6l-2.2 2.2a4.2 4.2 0 0 1-6-6L8 10" />
    </svg>
  );
}

export function WifiIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9.2 16a4.5 4.5 0 0 1 5.6 0" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" />
    </svg>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 9a14 14 0 0 1 4.2-2.4M11 6.1A14 14 0 0 1 21 9" />
      <path d="M6 12.5a9.5 9.5 0 0 1 3.6-1.3M14.8 11.5a9.5 9.5 0 0 1 3.2 1M9.2 16a4.5 4.5 0 0 1 5.6 0" />
      <circle cx="12" cy="19" r="0.8" fill="currentColor" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function SignalIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 20V8" />
      <path d="M8 12l4-4 4 4" />
      <path d="M5 5h14" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10" width="14" height="10" rx="1.6" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M3 12h18M6 6l12 12M18 6 6 18" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 2 5 13h6l-1 9 8-11h-6z" />
    </svg>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" />
      <path d="M12 8.2 16 10.5v4.3L12 17l-4-2.2v-4.3L12 8.2Z" />
    </svg>
  );
}

export function CrownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8l4.5 3L12 5l3.5 6L20 8l-1.5 10h-13L4 8Z" />
    </svg>
  );
}

export function SignalGlyph({ kind }: { kind: string }): ReactNode {
  const glyphs: Record<string, ReactNode> = {
    gg: (
      <svg {...base({ size: 16 })}>
        <path d="M4 12a8 8 0 1 1 3 6.2L3 20l1.3-4.2A8 8 0 0 1 4 12Z" />
        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth="2.4" />
      </svg>
    ),
    nice: (
      <svg {...base({ size: 16 })}>
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    ),
    focus: (
      <svg {...base({ size: 16 })}>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    ),
    gl: (
      <svg {...base({ size: 16 })}>
        <path d="M4 16c2-6 5-9 8-9s6 3 8 9" />
        <path d="M4 8c2 6 5 9 8 9s6-3 8-9" />
      </svg>
    ),
  };
  return glyphs[kind] ?? glyphs.nice;
}
