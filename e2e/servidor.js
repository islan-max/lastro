// Servidor estático mínimo para os testes: serve ../site em /lastro/ (mesma base do GitHub Pages).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("../site", import.meta.url)));
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };
const porta = Number(process.env.PORT ?? 4173);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/lastro/")) {
    res.writeHead(url.pathname === "/" ? 302 : 404, { location: "/lastro/" }).end();
    return;
  }
  let rel = decodeURIComponent(url.pathname.slice("/lastro/".length)) || "index.html";
  const arquivo = normalize(join(RAIZ, rel));
  if (!arquivo.startsWith(RAIZ)) return res.writeHead(403).end();
  try {
    const corpo = await readFile(arquivo);
    res.writeHead(200, { "content-type": TIPOS[extname(arquivo)] ?? "application/octet-stream", "cache-control": "no-store" }).end(corpo);
  } catch {
    const corpo = await readFile(join(RAIZ, "404.html"));
    res.writeHead(404, { "content-type": TIPOS[".html"] }).end(corpo);
  }
}).listen(porta, () => console.log(`http://localhost:${porta}/lastro/`));
