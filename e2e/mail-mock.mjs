// Simulador local do envio de e-mails (API do Resend): guarda as mensagens em memoria e nunca envia nada para fora.
import http from "node:http";

const port = Number(process.env.E2E_MAIL_PORT || 3910);
const mails = [];

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method === "POST") {
        try {
          mails.push(JSON.parse(body));
        } catch {
          mails.push({ raw: body });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"id":"e2e"}');
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/mails")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(mails));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  })
  .listen(port, "127.0.0.1");
