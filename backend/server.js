const http   = require("http");
const fs     = require("fs");
const crypto = require("crypto");

const PORT            = process.env.PORT || 10000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const USERS_FILE      = "utenti.json";

// ── DATABASE ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
const leggiUtenti  = ()       => JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
const salvaUtenti  = (data)   => { fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2)); console.log("UTENTI_DB:", JSON.stringify(data)); };
const trovaUtente  = (data, username) => data.users.find((u) => u.username === username);

// ── PASSWORD ──────────────────────────────────────────────────────────────────
// salt è un valore casuale che permette di avere hash unici 
const hashPassword    = (pw, salt = crypto.randomBytes(16).toString("hex")) =>
  ({ salt, hash: crypto.pbkdf2Sync(pw, salt, 100000, 32, "sha256").toString("hex") });
const verificaPassword = (pw, utente) =>
  crypto.timingSafeEqual(Buffer.from(hashPassword(pw, utente.salt).hash, "hex"), Buffer.from(utente.passwordHash, "hex"));

// ── SESSIONI ──────────────────────────────────────────────────────────────────
// sessionId → username si cancella se il server si riavvia (piano gratuito di render)
const sessioni        = new Map();
const creaSessione    = (username) => { const id = crypto.randomBytes(32).toString("hex"); sessioni.set(id, username); return id; };
const utenteFromReq   = (req)      => sessioni.get((req.headers.authorization || "").replace("Bearer ", ""));

// ── HTTP ──────────────────────────────────────────────────────────────────────
const leggiBody  = (req) => new Promise((ok, ko) => { let r = ""; req.on("data", (c) => r += c); req.on("end", () => { try { ok(r ? JSON.parse(r) : {}); } catch { ko(new Error("JSON non valido")); } }); });
const rispondi   = (req, res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": FRONTEND_ORIGIN, "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" });
  res.end(JSON.stringify(body));
};

// ── ROUTES ────────────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { rispondi(req, res, 204, {}); return; }

  try {
    if (req.method === "GET"  && req.url === "/health")        { rispondi(req, res, 200, { ok: true }); }

    else if (req.method === "POST" && req.url === "/api/register") {
      const { username, password, initialData } = await leggiBody(req);
      const user = String(username || "").trim().toLowerCase();
      if (user.length < 3 || String(password).length < 6) { rispondi(req, res, 400, { error: "Username minimo 3 caratteri, password minimo 6." }); return; }
      const data = leggiUtenti();
      if (trovaUtente(data, user)) { rispondi(req, res, 409, { error: "Username già registrato." }); return; }
      const { salt, hash } = hashPassword(String(password));
      data.users.push({ username: user, salt, passwordHash: hash, profile: initialData?.profile || null, lastCoords: initialData?.lastCoords || null });
      salvaUtenti(data);
      rispondi(req, res, 201, { sessionId: creaSessione(user), username: user });
    }

    else if (req.method === "POST" && req.url === "/api/login") {
      const { username, password } = await leggiBody(req);
      const data = leggiUtenti();
      const utente = trovaUtente(data, String(username || "").trim().toLowerCase());
      if (!utente || !verificaPassword(String(password), utente)) { rispondi(req, res, 401, { error: "Credenziali non valide." }); return; }
      rispondi(req, res, 200, { sessionId: creaSessione(utente.username), username: utente.username, profile: utente.profile, lastCoords: utente.lastCoords });
    }

    else if (req.method === "GET"  && req.url === "/api/profile") {
      const username = utenteFromReq(req);
      if (!username) { rispondi(req, res, 401, { error: "Sessione non valida." }); return; }
      const utente = trovaUtente(leggiUtenti(), username);
      rispondi(req, res, utente ? 200 : 404, utente ? { username, profile: utente.profile, lastCoords: utente.lastCoords } : { error: "Utente non trovato." });
    }

    else if (req.method === "PUT"  && req.url === "/api/profile") {
      const username = utenteFromReq(req);
      if (!username) { rispondi(req, res, 401, { error: "Sessione non valida." }); return; }
      const { profile, lastCoords } = await leggiBody(req);
      const data = leggiUtenti();
      const utente = trovaUtente(data, username);
      if (!utente) { rispondi(req, res, 404, { error: "Utente non trovato." }); return; }
      utente.profile = profile || utente.profile || null;
      utente.lastCoords = lastCoords || utente.lastCoords || null;
      salvaUtenti(data);
      rispondi(req, res, 200, { ok: true });
    }

    else { rispondi(req, res, 404, { error: "Endpoint non trovato." }); }

  } catch (e) { rispondi(req, res, 500, { error: e.message }); }

}).listen(PORT, () => console.log(`Me!teo backend sulla porta ${PORT}`));
