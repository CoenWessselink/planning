import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok:false, service:"cws-planning", storage:"local", version:"local-test" });
});
app.use(express.static(path.join(__dirname, "..")));
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
const server = app.listen(PORT, () => {
  console.log(`CWS running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`ERROR: Port ${PORT} is already in use. Stop the other server or choose a different PORT.`);
    process.exit(2);
  }
  throw err;
});
