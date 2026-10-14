import { RiCompass3Line, RiMapPin2Fill, RiStackLine } from "@remixicon/react";

export function WelcomeArt({ step }: { step: 1 | 2 }) {
  return (
    <div aria-hidden="true" className="welcome-art pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-4/5 max-w-xs select-none">
      <div className="welcome-art-back absolute inset-x-3 inset-y-0 rounded-2xl border border-border-button-default bg-background-primary-default/90 shadow-sm" />
      {step === 1 ? (
        <div className="welcome-art-front welcome-art-greeting relative flex h-36 flex-col justify-center gap-3 rounded-2xl border border-border-button-default bg-background-primary-default px-6 pb-5 shadow-lg sm:h-40 sm:px-8">
          <RiCompass3Line className="size-6 text-accent-500 sm:size-7" />
          <p className="text-title-2-semibold tracking-tight text-text-primary sm:text-title-1-semibold">Welcome to<br />Arkamap</p>
        </div>
      ) : (
        <div className="welcome-art-front relative overflow-hidden rounded-2xl border border-border-button-default bg-background-primary-default shadow-lg">
          <div className="flex h-9 items-center justify-between border-b border-separator-border px-3 text-caption-1-semibold text-text-primary">
            <span className="flex items-center gap-1.5"><RiCompass3Line className="size-4 text-accent-500" />Arkamap</span>
            <RiStackLine className="size-4 text-text-secondary" />
          </div>
          <div className="relative h-32 overflow-hidden bg-background-secondary-default sm:h-36">
            <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" className="size-full" fill="none">
              <path d="M0 0H124L108 35L62 55L47 99L0 110Z M169 0H320V59L274 74L245 45L198 40Z M122 160L152 119L193 109L215 134L264 144L287 160Z" fill="var(--color-accent-500)" opacity="0.12" />
              <path d="M-12 151C45 122 77 123 91 77S133 44 152 17S175 -4 196 -12" stroke="var(--color-accent-500)" strokeWidth="14" opacity="0.16" />
              <g stroke="var(--color-background-primary-default)" strokeWidth="8">
                <path d="M-10 67L54 71L126 115L202 86L260 32L330 41" />
                <path d="M39 -10L56 71L21 170 M142 -10L162 64L202 86L233 169 M284 -10L260 32L291 113L330 129" />
              </g>
              <g stroke="var(--color-border-button-default)" strokeWidth="1">
                <path d="M-10 67L54 71L126 115L202 86L260 32L330 41" />
                <path d="M39 -10L56 71L21 170 M142 -10L162 64L202 86L233 169 M284 -10L260 32L291 113L330 129" />
              </g>
              <path d="M112 105L150 77L199 82L236 54" stroke="var(--color-accent-500)" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
            <span className="welcome-art-pin absolute left-1/3 top-1/2 text-accent-700"><RiMapPin2Fill className="size-7" /></span>
            <span className="welcome-art-pin welcome-art-pin-secondary absolute right-1/4 top-1/4 text-accent-700"><RiMapPin2Fill className="size-6" /></span>
            <span className="absolute bottom-6 left-3 rounded-md border border-border-button-default bg-background-primary-default px-2 py-1 text-caption-1 text-text-secondary">Map preview</span>
          </div>
        </div>
      )}
    </div>
  );
}
