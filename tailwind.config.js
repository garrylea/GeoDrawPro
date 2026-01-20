
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",        // 匹配根目录下的 App.tsx, index.tsx 等
    "./components/**/*.{js,ts,jsx,tsx}", // 匹配 components 目录
    "./utils/**/*.{js,ts,jsx,tsx}"       // 匹配 utils 目录
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        }
      }
    }
  },
  plugins: [],
}
