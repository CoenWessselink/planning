import http from 'http';
import { readFileSync, existsSync, createReadStream } from 'fs';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(process.cwd());
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

const mime = {
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.woff':'font/woff',
  '.woff2':'font/woff2'
};

const server = http.createServer((req,res)=>{
  const url = (req.url || '/').split('?')[0];
  const path = url === '/' ? '/index.html' : url;
  const abs = join(root, path);

  if(!existsSync(abs)){
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const ext = extname(abs).toLowerCase();
  res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  createReadStream(abs).pipe(res);
});

server.listen(port, '127.0.0.1', ()=>{
  console.log('Serving', root, 'at', 'http://127.0.0.1:'+port);
});
