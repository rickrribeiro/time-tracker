import { startServer } from './index'
import { getConfig } from './config'

// Standalone entry: `npm run dev:web` (tsx) and `npm start` (built dist-server/main.js).
startServer()
  .then(({ url, close }) => {
    const cfg = getConfig()
    console.log(`[rickOS] servidor em ${url} (dados: ${cfg.dataDir}${cfg.token ? ', com token' : ''})`)
    const shutdown = (): void => {
      close().finally(() => process.exit(0))
    }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
  .catch((e) => {
    console.error('[rickOS] falha ao iniciar o servidor:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
