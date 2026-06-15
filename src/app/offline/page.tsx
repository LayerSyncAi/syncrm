import { brand } from "@/config/brand";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center"
         style={{ background: "var(--bg, #f1f5ff)", color: "var(--text, #1f2a44)" }}>
      <div className="flex flex-col items-center gap-4 max-w-sm">
        {/* Wifi-off icon drawn inline so no external resource is needed */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--primary, #eca400)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>

        <h1 className="text-2xl font-semibold">You are offline</h1>
        <p style={{ color: "var(--text-muted, #5b647f)" }}>
          {brand.name} needs a connection to load your pipeline and leads. Please check
          your internet connection and try again.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{
            background: "var(--primary, #eca400)",
            color: "#fff",
            border: "none",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
