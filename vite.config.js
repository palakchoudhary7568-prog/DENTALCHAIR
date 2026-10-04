import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Phones only allow camera / WebXR on HTTPS, and need the LAN address to reach the dev server.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true },
});
