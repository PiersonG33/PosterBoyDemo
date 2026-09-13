import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // CUSTOM WORD BOMB — BEGIN: remove this build block with the isolated game.
  build: {
    rollupOptions: {
      input: {
        posterBoy: 'index.html',
        customWordBomb: 'CustomWordBomb/index.html',
      },
    },
  },
  // CUSTOM WORD BOMB — END
  test: {
    environment: 'node',
  },
})
