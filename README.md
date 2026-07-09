# Me!teo

Una piccola app meteo personalizzata in italiano.

## Avvio

Apri `index.html` nel browser oppure, per usare `localhost`, avvia:

```bash
npm start
```

Poi visita:

```text
http://127.0.0.1:4173
```

## Come funziona

- Mostra temperatura effettiva, umidita, vento e temperatura percepita base.
- Salva l'ultima posizione usata e prova a mostrarla come citta e zona.
- Chiede cosa stai indossando.
- Registra se hai avuto freddo, caldo o se stavi bene.
- Consiglia cosa indossare in base alla temperatura percepita dal tuo profilo.
- Usa un logo personalizzato per l'installazione sulla schermata Home.
- Salva un profilo termico nel browser con `localStorage`.
- Se configuri il backend Render, puo sincronizzare account, profilo e ultima posizione.
- Corregge la temperatura personale in base ai feedback successivi.

I dati meteo arrivano da Open-Meteo e non richiedono una chiave API.

## Regolare l'algoritmo

La logica del feedback e in `app.js`.

- Pesi dei vestiti: modifica i `data-weight` dentro `index.html`.
- Intensita di freddo/caldo: modifica `getComfortMeta()` in `app.js`.
- Quanto impara dal meteo reale: modifica `getEnvironmentMultiplier()` in `app.js`.
- Quanto pesa l'abbigliamento nel feedback: modifica `getClothingMultiplier()` in `app.js`.
- Fasce di temperatura: modifica `TEMP_BUCKETS` in `app.js`.
- Limiti massimi della correzione: modifica i valori `-4`, `4`, `-3`, `3` dentro `applyFeedbackLearning()`.

## Installazione sul telefono

Questa app e pronta come PWA installabile.

1. Pubblica la cartella su Netlify, Vercel o GitHub Pages.
2. Apri il link dal telefono.
3. Su Android, usa Chrome e scegli `Installa app` o `Aggiungi a schermata Home`.
4. Su iPhone, usa Safari, apri il menu di condivisione e scegli `Aggiungi alla schermata Home`.

Le preferenze personali e l'ultima posizione restano salvate sul telefono finche non cancelli i dati del sito o del browser.

Quando usi `Sono qui`, le coordinate vengono inviate ai servizi meteo e, se disponibile, a un servizio di geocodifica inversa per mostrare citta e zona in modo leggibile.
