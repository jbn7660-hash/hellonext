// Use require() to resolve plugins from this file's location (apps/web/)
// instead of relying on PostCSS string-based resolution from within Next.js internals
module.exports = {
  plugins: [
    require('tailwindcss'),
    require('autoprefixer'),
  ],
};
