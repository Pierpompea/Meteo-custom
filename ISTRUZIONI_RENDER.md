# Setup Me!teo con frontend GitHub Pages e backend Render

## Struttura creata

```text
meteo/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── config.js
│   ├── manifest.json
│   ├── service-worker.js
│   └── icone
│
└── backend/
    ├── server.js
    ├── utenti.json
    └── package.json
```

## Come funziona

Il frontend resta una PWA pubblica su GitHub Pages.

Il backend va su Render e gestisce:

- registrazione account
- login
- password hashata
- token firmato
- salvataggio profilo e ultima posizione

Il file `utenti.json` viene creato automaticamente se manca.

## Endpoint backend

```text
GET  /health
POST /api/register
POST /api/login
GET  /api/profile
PUT  /api/profile
```

## Variabili ambiente Render

Nel servizio Render imposta:

```text
TOKEN_SECRET=una-stringa-lunga-casuale
FRONTEND_ORIGIN=https://TUO-UTENTE.github.io
```

Se usi un disco persistente Render, imposta anche:

```text
DATA_DIR=/var/data
```

Senza disco persistente, Render puo perdere `utenti.json` quando il servizio viene riavviato o ridistribuito.

## Setup backend su Render

1. Carica la cartella `backend/` su GitHub.
2. Vai su Render.
3. Crea un nuovo `Web Service`.
4. Collega il repository GitHub.
5. Se il repository contiene anche il frontend, imposta `Root Directory` su:

```text
backend
```

6. Imposta:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

7. Aggiungi le variabili ambiente:

```text
TOKEN_SECRET
FRONTEND_ORIGIN
```

8. Fai deploy.
9. Alla fine Render ti dara un URL tipo:

```text
https://meteo-backend.onrender.com
```

10. Testa:

```text
https://meteo-backend.onrender.com/health
```

Se risponde:

```json
{"ok":true}
```

il backend e attivo.

## Collegare frontend e backend

Apri:

```text
frontend/config.js
```

e inserisci l'URL Render:

```js
window.METEO_API_BASE_URL = "https://meteo-backend.onrender.com";
```

Poi ricarica `frontend/config.js` su GitHub Pages.

## Setup frontend su GitHub Pages

Metodo piu semplice:

1. Apri il repository pubblico usato per GitHub Pages.
2. Carica il contenuto della cartella `frontend/` nella root del repository.
3. Vai su `Settings > Pages`.
4. Scegli `Deploy from branch`.
5. Branch: `main`.
6. Cartella: `/ root`.
7. Salva.

Il sito sara disponibile su:

```text
https://TUO-UTENTE.github.io/NOME-REPO/
```

## Flusso utente

```text
Utente apre Me!teo
  ↓
Inserisce username/password
  ↓
Frontend chiama Render
  ↓
Render verifica password hashata
  ↓
Render restituisce token
  ↓
Frontend salva token
  ↓
Feedback e profilo vengono salvati anche sul backend
```

## Nota importante su sicurezza

Questa e una soluzione didattica e semplice.

Va bene per prototipo, demo e progetto scolastico/universitario, ma non e equivalente a un sistema professionale con database, refresh token, recupero password, rate limit e gestione avanzata sessioni.

## Nota importante su Render e utenti.json

Render usa filesystem effimero se non configuri un disco persistente.

Questo significa che `utenti.json` puo essere perso a ogni redeploy o restart.

Per una demo va bene.

Per usarlo davvero, scegli una di queste opzioni:

1. Render Persistent Disk con `DATA_DIR=/var/data`.
2. Database vero, per esempio PostgreSQL, Supabase o Firebase.

