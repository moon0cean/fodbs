import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const config = loadConfig();
const { app, db } = await buildApp(config);

await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => db.close()).then(() => process.exit(0));
  });
}
