import type { Config } from 'tailwindcss';

// Full token port (oklch palette, Newsreader/Geist/JetBrains, spacing/radius/shadow)
// lands in ticket 0.3. Keeping a minimal config so the app compiles today.
const config: Config = {
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
