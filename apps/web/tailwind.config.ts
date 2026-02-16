import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        '8fold': {
          green: '#16A34A',
          'green-light': '#22C55E',
          'green-dark': '#15803D',
          navy: '#1E293B',
          'navy-light': '#334155',
        },
      },
    },
  },
  plugins: [],
} satisfies Config