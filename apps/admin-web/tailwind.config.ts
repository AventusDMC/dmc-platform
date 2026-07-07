import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"

// Scoped Tailwind setup for the Quote Builder V2 only.
//
// - `content` is limited to the builder-v2 route + its V2 components and the
//   shadcn-style `components/ui` primitives. The rest of admin-web keeps its
//   existing bespoke CSS and is intentionally NOT scanned.
//   NOTE: the route folder is literally `[id]`; the brackets are escaped so
//   fast-glob matches them as literal characters instead of a char class.
// - `preflight` is DISABLED so Tailwind's base reset never touches the global
//   app shell / existing pages. Utilities + component classes only.
// - COLOR STRATEGY:
//   * Shared tokens that already exist app-wide (--background, --foreground,
//     --border, --muted, --muted-foreground, --accent) are HEX values, so they
//     map to a raw `var(--token)` (no alpha-channel support; opacity modifiers
//     degrade gracefully to full opacity).
//   * Tokens introduced for builder-v2 (defined in builder-v2.css as space-
//     separated RGB channels) map via `rgb(var(--token) / <alpha-value>)` so
//     opacity modifiers like `bg-warning/15` work correctly.
const config: Config = {
  darkMode: ["class"],
  corePlugins: {
    preflight: false,
  },
  content: [
    "./app/quotes/\\[id\\]/builder-v2/**/*.{ts,tsx}",
    "./components/quote/v2/**/*.{ts,tsx}",
    "./components/ui/**/*.{ts,tsx}",
    // Booking Operations V2 — route-scoped (see app/operations/v2/ops-v2.css).
    "./app/operations/v2/**/*.{ts,tsx}",
    "./components/ops/v2/**/*.{ts,tsx}",
    // Product Catalog V2 — route-scoped (see app/catalog/v2/catalog-v2.css).
    "./app/catalog/v2/**/*.{ts,tsx}",
    "./components/catalog/v2/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      spacing: {
        "4.5": "1.125rem",
      },
      colors: {
        // --- Shared existing tokens (hex → raw var) ---
        border: "var(--border)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        // --- Builder-v2 tokens (rgb channels → alpha-aware) ---
        input: "rgb(var(--input) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--secondary) / <alpha-value>)",
          foreground: "rgb(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        // accent.DEFAULT reuses the shared hex token; its foreground is new.
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--popover) / <alpha-value>)",
          foreground: "rgb(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "rgb(var(--card) / <alpha-value>)",
          foreground: "rgb(var(--card-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--warning) / <alpha-value>)",
          foreground: "rgb(var(--warning-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--success) / <alpha-value>)",
          foreground: "rgb(var(--success-foreground) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "rgb(var(--sidebar) / <alpha-value>)",
          foreground: "rgb(var(--sidebar-foreground) / <alpha-value>)",
          primary: "rgb(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "rgb(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "rgb(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "rgb(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "rgb(var(--sidebar-border) / <alpha-value>)",
          ring: "rgb(var(--sidebar-ring) / <alpha-value>)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
