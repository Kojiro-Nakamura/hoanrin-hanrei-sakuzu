import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './', // Change base to relative for local file execution
  plugins: [
    tailwindcss(),
    react(),
    viteSingleFile()
  ],
})
