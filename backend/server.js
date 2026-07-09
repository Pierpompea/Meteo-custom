const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;
const TOKEN_SECRET = process.env.TOKEN_SECRET || "dev-secret-change-me";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const DATA_DIR = process.env.DATA_DIR || __dirname;
const USERS_FILE = path.join(DATA_DIR, "utenti.json");
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

function normalizeOrigin(value) {
  if (!value || value === "*") return "*";
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/$/, "");
  }
}

const ALLOWED_ORIGINS = FRONTEND_ORIGIN.split(",").map((origin) => normalizeOrigin(origin.trim())).filter(Boolean);

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function readUsers() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function normalizeUsername(username) {
  return String(username || "").trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(value).digest("base64url");
}

function createToken(username) {
  const header = base64url({ alg: "HS256", typ: "JWT-lite" });
  const payload = base64url({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;

  const unsigned = `${parts[0]}.${parts[1]}`;
  if (sign(unsigned) !== parts[2]) return null;

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload.sub;
}

function getCorsOrigin(req) {
  const requestOrigin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes("*")) return "*";
  if (requestOrigin && ALLOWED_ORIGINS.includes(normalizeOrigin(requestOrigin))) return requestOrigin;
  return ALLOWED_ORIGINS[0] || "*";
}

function corsHeaders(req) {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(req),
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function send(req, res, status, body) {
  res.writeHead(status, corsHeaders(req));
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error("Body troppo grande"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("JSON non valido"));
      }
    });
  });
}

function findUser(data, username) {
  return data.users.find((user) => user.username === username);
}

function getAuthUsername(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return verifyToken(token);
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (username.length < 3 || password.length < 6) {
    send(req, res, 400, { error: "Username minimo 3 caratteri, password minimo 6." });
    return;
  }

  const data = readUsers();
  if (findUser(data, username)) {
    send(req, res, 409, { error: "Username gia registrato." });
    return;
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    username,
    salt,
    passwordHash: hash,
    profile: body.initialData?.profile || null,
    lastCoords: body.initialData?.lastCoords || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.users.push(user);
  writeUsers(data);

  send(req, res, 201, {
    token: createToken(username),
    username,
    profile: user.profile,
    lastCoords: user.lastCoords,
  });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  const data = readUsers();
  const user = findUser(data, username);

  if (!user || !verifyPassword(password, user)) {
    send(req, res, 401, { error: "Credenziali non valide." });
    return;
  }

  send(req, res, 200, {
    token: createToken(username),
    username,
    profile: user.profile,
    lastCoords: user.lastCoords,
  });
}

function handleGetProfile(req, res) {
  const username = getAuthUsername(req);
  if (!username) {
    send(req, res, 401, { error: "Token mancante o non valido." });
    return;
  }

  const data = readUsers();
  const user = findUser(data, username);
  if (!user) {
    send(req, res, 404, { error: "Utente non trovato." });
    return;
  }

  send(req, res, 200, {
    username,
    profile: user.profile,
    lastCoords: user.lastCoords,
  });
}

async function handlePutProfile(req, res) {
  const username = getAuthUsername(req);
  if (!username) {
    send(req, res, 401, { error: "Token mancante o non valido." });
    return;
  }

  const body = await readJson(req);
  const data = readUsers();
  const user = findUser(data, username);
  if (!user) {
    send(req, res, 404, { error: "Utente non trovato." });
    return;
  }

  user.profile = body.profile || user.profile || null;
  user.lastCoords = body.lastCoords || user.lastCoords || null;
  user.updatedAt = new Date().toISOString();
  writeUsers(data);
  send(req, res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(req, res, 204, {});
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      send(req, res, 200, { ok: true });
    } else if (req.method === "POST" && req.url === "/api/register") {
      await handleRegister(req, res);
    } else if (req.method === "POST" && req.url === "/api/login") {
      await handleLogin(req, res);
    } else if (req.method === "GET" && req.url === "/api/profile") {
      handleGetProfile(req, res);
    } else if (req.method === "PUT" && req.url === "/api/profile") {
      await handlePutProfile(req, res);
    } else {
      send(req, res, 404, { error: "Endpoint non trovato." });
    }
  } catch (error) {
    send(req, res, 500, { error: error.message || "Errore server." });
  }
});

ensureDataFile();
server.listen(PORT, () => {
  console.log(`Me!teo backend attivo sulla porta ${PORT}`);
  console.log(`Dati utenti: ${USERS_FILE}`);
});
