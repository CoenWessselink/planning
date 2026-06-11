import http from 'http';
import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { extname, join, normalize } from 'path';
import url from 'url';

const root = process.cwd();
const port = process.env.PORT ? Number(process.env.PORT) : 4173;

const mime = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml',
  '.ico':'image/x-icon',
};

function safePath(p){
  const np = normalize(p).replace(/^(\.\.[\/\\])+/, '');
  return join(root, np);
}

const server = http.createServer((req,res)=>{
  const parsed = url.parse(req.url || '/');
  let path = decodeURIComponent(parsed.pathname || '/');
  if(path === '/') path = '/index.html';
  const fp = safePath(path.slice(1));
  if(!existsSync(fp) || (statSync(fp).isDirectory())){
    res.writeHead(404, {'content-type':'text/plain; charset=utf-8'});
    return res.end('404');
  }
  const ext = extname(fp).toLowerCase();
  res.writeHead(200, {'content-type': mime[ext] || 'application/octet-stream'});
  createReadStream(fp).pipe(res);
});

server.listen(port, '127.0.0.1', ()=>{
  console.log(`Static server running: http://127.0.0.1:${port}`);
});