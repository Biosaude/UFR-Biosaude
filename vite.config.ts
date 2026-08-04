import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

declare const process: { cwd(): string; env: Record<string, string | undefined> };

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };

  console.log(`[build-env] VITE_SUPABASE_URL found: ${Boolean(env.VITE_SUPABASE_URL)}`);
  console.log(`[build-env] VITE_SUPABASE_ANON_KEY found: ${Boolean(env.VITE_SUPABASE_ANON_KEY)}`);

  return {
    envPrefix: 'VITE_',
    plugins: [react()],
  };
});
