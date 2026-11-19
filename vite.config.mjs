import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      strict: true,
      // Keep server-side post storage and account code out of Vite's file server.
      deny: ['**/server/**', '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**'],
    },
  },
});
