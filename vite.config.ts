import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 로컬 dev 서버에서 /api/* 를 Vercel 함수와 같은 핸들러로 처리한다 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const { routeApi } = await server.ssrLoadModule('/server/handlers.ts');
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const request = new Request(new URL(req.url, 'http://localhost'), {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          });
          const response: Response | null = await routeApi(request);
          if (!response) return next();
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
});
