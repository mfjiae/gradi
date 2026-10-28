import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Will be hosted at https://mfjiae.github.io/gradi/ (M2 adds the PWA install and the deploy).
export default defineConfig({
  base: '/gradi/',
  plugins: [react()],
  test: { environment: 'node' },
});
