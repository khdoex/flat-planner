import { defineConfig } from 'vite';
import { plannerPlugin } from './server/plugin';

export default defineConfig({
  plugins: [plannerPlugin()],
  server: { watch: { ignored: ['**/snapshots/**'] } },
});
