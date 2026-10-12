import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
    // Real Ant Design drawers render full forms/tables; leave room for slower CI machines.
    testTimeout: 15000,
    maxWorkers: 2,
  },
})
