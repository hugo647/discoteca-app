import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import middleware from './middleware.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4174);
process.env.DATABASE_URL ||= 'postgres://hugosuarez@localhost:5432/la_previa_dev';
process.env.DATABASE_SSL ||= 'false';
process.env.ACCESS_SECRET ||= randomBytes(32).toString('hex');
process.env.LEGAL_POLICY_VERSION ||= '2026-09-17';

const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function sendResponse(nodeResponse, response) {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => nodeResponse.setHeader(key, value));
  nodeResponse.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (request, nodeResponse) => {
  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    const webRequest = new Request(requestUrl, {method:request.method, headers:request.headers, body:body?.length ? body : undefined, duplex:'half'});
    const gate = await middleware(webRequest);
    if (gate) return sendResponse(nodeResponse, gate);
    const relative = requestUrl.pathname === '/' ? 'index.html' : requestUrl.pathname.replace(/^\//, '');
    const file = path.resolve(root, decodeURIComponent(relative));
    if (!file.startsWith(`${root}${path.sep}`)) { nodeResponse.writeHead(403); return nodeResponse.end('Forbidden'); }
    const contents = await fs.readFile(file);
    nodeResponse.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    nodeResponse.end(contents);
  } catch (error) {
    if (error?.code === 'ENOENT') { nodeResponse.writeHead(404); return nodeResponse.end('Not found'); }
    console.error(error);
    nodeResponse.writeHead(500); nodeResponse.end('Local dev server error');
  }
});

server.listen(port, () => console.log(`La Previa dev escuchando en http://localhost:${port}`));
