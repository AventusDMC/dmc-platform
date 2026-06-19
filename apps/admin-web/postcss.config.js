// PostCSS config for admin-web.
//
// Tailwind only injects styles into files that contain `@tailwind` directives
// (currently just the route-scoped builder-v2 stylesheet). All other existing
// CSS passes through untouched except for autoprefixer vendor-prefixing.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
