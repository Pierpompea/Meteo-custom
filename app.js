const DEFAULT_COORDS = { latitude: 41.9028, longitude: 12.4964, name: "Roma, Italia" };

const WEATHER_CODES = {
  0: "Cielo sereno", 1: "Prevalentemente sereno", 2: "Parzialmente nuvoloso", 3: "Coperto",
  45: "Nebbia", 48: "Nebbia con brina",
  51: "Pioviggine leggera", 53: "Pioviggine moderata", 55: "Pioviggine intensa",
  61: "Pioggia leggera", 63: "Pioggia moderata", 65: "Pioggia intensa",
  71: "Neve leggera", 73: "Neve moderata", 75: "Neve intensa",
  80: "Rovesci leggeri", 81: "Rovesci moderati", 82: "Rovesci violenti",
  95: "Temporale",
};

const WEATHER_THEME_CLASSES = ["weather-sunny", "weather-rainy", "weather-cloudy"];
const API_BASE_URL = (window.METEO_API_BASE_URL || "").replace(/\/$/, "");

// ── HELPERS ───────────────────────────────────────────────────────────────────
const rounded = (v) => Math.round(v * 10) / 10;
const clamp   = (v, min, max) => Math.max(min, Math.min(max, v));
// da capire meglio calcoli e lettura/scrittura su localstorage 
// Legge o scrive da localStorage in formato JSON
// storage("chiave")         → legge
// storage("chiave", valore) → scrive
function storage(key, value) {
  if (value === undefined) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  localStorage.setItem(key, JSON.stringify(value));
}

// ── STATO ─────────────────────────────────────────────────────────────────────
const state = {
  weather:        null,
  coords:         storage("meteo:coords")  || DEFAULT_COORDS,
  profile:        storage("meteo:profile") || { bias: 0, feedbackCount: 0, history: [], bucketBiases: {} },
  recommendation: null,
};

//da capire cosa fa fromentries e cosa cambia rispetto a document.queryselector
// ── ELEMENTI DOM ──────────────────────────────────────────────────────────────
const els = Object.fromEntries(
  ["actualTemp","personalTemp","weatherSummary","personalSummary","windValue","humidityValue",
   "apparentValue","outfitSummary","outfitList","locationName","geoBtn","refreshBtn","feedbackForm",
   "feedbackToast","authStatus","authUsername","authPassword","loginBtn","registerBtn","logoutBtn",
   "learningNote","biasMeter","profileText","historyList","historyTemplate","resetBtn"]
  .map((id) => [id, document.getElementById(id)])
);

// ── SESSIONE ──────────────────────────────────────────────────────────────────
const getSession   = ()             => localStorage.getItem("meteo:session");
const setSession   = (id, username) => { localStorage.setItem("meteo:session", id); localStorage.setItem("meteo:user", username); };
const clearSession = ()             => { localStorage.removeItem("meteo:session"); localStorage.removeItem("meteo:user"); };

// ── AUTH UI ───────────────────────────────────────────────────────────────────
function renderAuthState(message) {
  const isLogged = Boolean(getSession());
  els.authStatus.textContent =
    !API_BASE_URL ? "Backend non configurato: salvo solo su questo dispositivo." :
    message       ? message :
    isLogged      ? `Connesso come ${localStorage.getItem("meteo:user")}.` :
                    "Accedi per sincronizzare il profilo su più dispositivi.";
  els.loginBtn.disabled    = !API_BASE_URL || isLogged;
  els.registerBtn.disabled = !API_BASE_URL || isLogged;
  els.logoutBtn.hidden     = !isLogged;
}

// ── CHIAMATE AL BACKEND ───────────────────────────────────────────────────────
async function apiRequest(path, { method = "GET", body, auth = false } = {}) {
  if (!API_BASE_URL) throw new Error("Backend non configurato");
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${getSession()}`;
  const response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Richiesta non riuscita");
  return data;
}

async function handleAuth(mode) {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;
  if (!username || !password) return renderAuthState("Inserisci username e password.");
  try {
    const data = await apiRequest(`/api/${mode}`, {
      method: "POST",
      body: { username, password, initialData: { profile: state.profile, lastCoords: state.coords } },
    });
    setSession(data.sessionId, data.username);
    if (data.profile) { state.profile = data.profile; storage("meteo:profile", state.profile); }
    els.authPassword.value = "";
    renderAuthState(mode === "register" ? "Account creato." : "Accesso effettuato.");
    renderProfile();
    aggiornaConsiglio();
  } catch (e) { renderAuthState(e.message); }
}

// ── METEO ─────────────────────────────────────────────────────────────────────
async function fetchWeather(coords = state.coords) {
  els.weatherSummary.textContent = "Sto sbirciando fuori per te...";
  try {
    const params = new URLSearchParams({
      latitude: coords.latitude, longitude: coords.longitude,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      timezone: "auto",
    });
    const res  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error("Meteo non disponibile");
    const data = await res.json();
    state.weather = {
      temperature:         data.current.temperature_2m,
      humidity:            data.current.relative_humidity_2m,
      apparentTemperature: data.current.apparent_temperature,
      weatherCode:         data.current.weather_code,
      windSpeed:           data.current.wind_speed_10m,
      time:                data.current.time,
    };
    aggiornaConsiglio();
  } catch (e) {
    els.weatherSummary.textContent = `${e.message}. Per non lasciarti al buio, parto da Roma.`;
    if (coords !== DEFAULT_COORDS) fetchWeather(DEFAULT_COORDS).catch(() => {
      els.weatherSummary.textContent = "Il meteo non mi risponde. Riprova tra poco.";
    });
  }
}

// ── POSIZIONE ─────────────────────────────────────────────────────────────────
function requestGeolocation() {
  if (!navigator.geolocation) {
    els.locationName.textContent = "GPS non disponibile. Uso l'ultima posizione salvata.";
    return fetchWeather(state.coords);
  }
  els.locationName.textContent = "Cerco dove sei...";
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      state.coords = { latitude: position.coords.latitude, longitude: position.coords.longitude, name: "La tua posizione" };
      storage("meteo:coords", state.coords);
      // Prova a ottenere il nome del luogo da Nominatim (best-effort)
      try {
        const params = new URLSearchParams({ format: "jsonv2", lat: state.coords.latitude, lon: state.coords.longitude, zoom: "14", addressdetails: "1", "accept-language": "it" });
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
        const data = await res.json();
        const a    = data.address || {};
        state.coords.name = [a.city || a.town || a.village, a.suburb || a.neighbourhood].filter(Boolean).join(" · ") || state.coords.name;
        storage("meteo:coords", state.coords);
        els.locationName.textContent = state.coords.name;
      } catch { /* le coordinate bastano lo stesso */ }
      fetchWeather(state.coords);
    },
    (e) => {
      els.locationName.textContent = `${e.code === e.PERMISSION_DENIED ? "Permesso GPS negato" : "Posizione non disponibile"}. Uso l'ultima salvata.`;
      fetchWeather(state.coords);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
  );
}

// ── LOGICA PROFILO TERMICO ────────────────────────────────────────────────────
const TEMP_BUCKETS = [
  { id: "freezing", max: 5 }, { id: "cold", max: 12 }, { id: "cool", max: 18 },
  { id: "mild", max: 24 },    { id: "warm", max: 30 }, { id: "hot", max: Infinity },
];
const getTemperatureBucket = (temp) => TEMP_BUCKETS.find((b) => temp <= b.max)?.id || "mild";
const getBucketBias        = (temp) => Number(state.profile.bucketBiases?.[getTemperatureBucket(temp)]) || 0;
const clothingWarmth       = (items) => items.reduce((sum, c) => sum + c.weight, 0);
const calculatePersonalTemp = () => rounded(state.weather.apparentTemperature + state.profile.bias + getBucketBias(state.weather.apparentTemperature) + clothingWarmth(getSelectedClothing()) * 0.35);
const calculateProfileTemp  = () => rounded(state.weather.apparentTemperature + state.profile.bias + getBucketBias(state.weather.apparentTemperature));
//da rivedere la formattazione e la sintassi
function getWeatherTheme(weatherCode) {
  if ([51,53,55,61,63,65,80,81,82,95].includes(weatherCode)) return "weather-rainy";
  if ([2,3,45,48].includes(weatherCode))                      return "weather-cloudy";
  return "weather-sunny";
}

function buildOutfit() {
  const profileTemp = calculateProfileTemp();
  const hasRain = [51,53,55,61,63,65,80,81,82,95].includes(state.weather.weatherCode);
  const isWindy = state.weather.windSpeed >= 22;
  const isHumid = state.weather.humidity >= 75;

  let title, items;
  if      (profileTemp <= 4)  { title = "Copriti bene: oggi fuori fa il serio.";              items = ["cappotto caldo","maglione o pile","sciarpa","scarpe chiuse"]; }
  else if (profileTemp <= 10) { title = "Strati furbi: fuori caldo addosso, dentro libertà."; items = ["giacca pesante","maglione","pantaloni lunghi","calze calde"]; }
  else if (profileTemp <= 16) { title = "Serve una via di mezzo: niente eroismi.";             items = ["giacca leggera","felpa o cardigan","pantaloni lunghi","strato facile da togliere"]; }
  else if (profileTemp <= 22) { title = "Si sta bene, ma portati un piano B leggero.";        items = ["t-shirt o camicia","giacca leggera a portata","pantaloni comodi"]; }
  else if (profileTemp <= 28) { title = "Oggi andrei sul fresco e comodo.";                   items = ["t-shirt","tessuti leggeri","pantaloni leggeri o gonna","occhiali da sole se esci a lungo"]; }
  else                        { title = "Fa caldo davvero: lascia respirare tutto.";           items = ["tessuti traspiranti","pantaloncini o abiti leggeri","cappello se stai al sole","acqua con te"]; }

  if (hasRain)                         items.push("ombrello o impermeabile");
  if (isWindy)                         items.push("strato antivento");
  if (isHumid && profileTemp >= 20)    items.push("qualcosa che asciughi in fretta");
  if (state.profile.bias > 0.6  && profileTemp <= 18) items.push("uno strato extra, per sicurezza");
  if (state.profile.bias < -0.6 && profileTemp >= 14) items.push("strati facili da togliere");

  return { title, items: [...new Set(items)] };
}

const COMFORT_META = {
  veryCold: { label: "molto freddo", score: -1.2, toast: "Ok, la prossima volta ti copro di più." },
  cold:     { label: "freddo",       score: -0.7, toast: "Segno: per te oggi serviva uno strato in più." },
  ok:       { label: "perfetto",     score:  0,   toast: "Perfetto, outfit centrato. Lo tengo come riferimento." },
  hot:      { label: "caldo",        score:  0.7, toast: "Capito: la prossima volta ti alleggerisco." },
  veryHot:  { label: "molto caldo",  score:  1.2, toast: "Ricevuto: oggi eri troppo coperto." },
};

function applyFeedbackLearning(comfort, clothes) {
  const meta   = COMFORT_META[comfort] || COMFORT_META.ok;
  const bucket = getTemperatureBucket(state.weather.apparentTemperature);

  if (meta.score === 0) {
    state.profile.bias = rounded(state.profile.bias * 0.9); //forse inutile da calcolare
    state.profile.bucketBiases[bucket] = rounded((Number(state.profile.bucketBiases[bucket]) || 0) * 0.82);
    return meta;
  }

  const warmth    = clothingWarmth(clothes);
  const envMult   = (meta.score > 0 && state.weather.apparentTemperature <= 6) || (meta.score < 0 && state.weather.apparentTemperature >= 29) ? 0.7 //se cambio poco ne tengo conto poco
                  : (meta.score > 0 && state.weather.apparentTemperature >= 18) || (meta.score < 0 && state.weather.apparentTemperature <= 16) ? 1.15 : 1; //se cambio tanto ne tengo conto tanto ma se non è nessuna delle due faccio via di mezzo
  const clothMult = (meta.score < 0 && warmth >= 3) || (meta.score > 0 && warmth <= -1) ? 1.25
                  : (meta.score < 0 && warmth <= -1) || (meta.score > 0 && warmth >= 3) ? 0.72 : 1;
  const step      = rounded(meta.score * envMult * clothMult);

  state.profile.bias = rounded(clamp(state.profile.bias + step * 0.5, -4, 4)); //moltiplico per 0.5 altrimenti è troppo sensibile
  state.profile.bucketBiases[bucket] = rounded(clamp((Number(state.profile.bucketBiases[bucket]) || 0) + step * 0.5, -3, 3));
  return meta;
}

// ── CONSIGLIO OUTFIT ──────────────────────────────────────────────────────────
function getSelectedClothing() {
  return [...document.querySelectorAll("input[name='clothing']:checked")]
    .map((input) => ({ label: input.parentElement.textContent.trim(), weight: Number(input.dataset.weight) }));
}

function aggiornaConsiglio() {
  if (!state.weather) return;
  state.recommendation = {
    personalTemp: calculatePersonalTemp(),
    theme:        getWeatherTheme(state.weather.weatherCode),
    outfit:       buildOutfit(),
  };
  renderWeather();
}

// ── FEEDBACK ──────────────────────────────────────────────────────────────────
function handleFeedback(event) {
  event.preventDefault();
  if (!state.weather) return;

  const comfort = new FormData(els.feedbackForm).get("comfort");
  const clothes = getSelectedClothing();
  const meta    = applyFeedbackLearning(comfort, clothes);

  state.profile.feedbackCount += 1;
  state.profile.history.unshift({
    actual:       rounded(state.weather.temperature),
    personal:     calculatePersonalTemp(),
    comfortLabel: meta.label,
    clothes:      clothes.map((c) => c.label).join(", "),
    date:         new Date().toISOString(),
  });
  state.profile.history = state.profile.history.slice(0, 12);
  storage("meteo:profile", state.profile);

  // Se loggato, salva anche sul backend (best-effort: non blocca se fallisce)
  if (API_BASE_URL && getSession()) {
    apiRequest("/api/profile", { method: "PUT", auth: true, body: { profile: state.profile, lastCoords: state.coords } }).catch(() => {});
  }

  els.feedbackToast.textContent = meta.toast;
  els.feedbackToast.classList.add("is-visible");
  aggiornaConsiglio();
  renderProfile();
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderWeather() {
  if (!state.weather || !state.recommendation) return;
  const diff = rounded(state.recommendation.personalTemp - state.weather.temperature);
  els.actualTemp.textContent     = rounded(state.weather.temperature);
  els.personalTemp.textContent   = state.recommendation.personalTemp;
  els.windValue.textContent      = `${rounded(state.weather.windSpeed)} km/h`;
  els.humidityValue.textContent  = `${state.weather.humidity}%`;
  els.apparentValue.textContent  = `${rounded(state.weather.apparentTemperature)} °C`;
  els.locationName.textContent   = state.coords.name;
  els.weatherSummary.textContent = `${WEATHER_CODES[state.weather.weatherCode] || "Meteo ballerino"} adesso, aggiornato alle ${new Date(state.weather.time).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.`;
  els.personalSummary.textContent =
    diff > 1  ? `Secondo il tuo corpo, oggi sembra circa ${diff} °C più caldo.` :
    diff < -1 ? `Secondo il tuo corpo, oggi sembra circa ${Math.abs(diff)} °C più freddo.` :
                "Oggi numero e sensazione si parlano abbastanza bene.";
  document.body.classList.remove(...WEATHER_THEME_CLASSES);
  document.body.classList.add(state.recommendation.theme || "weather-sunny");
  els.outfitSummary.textContent = state.recommendation.outfit.title;
  els.outfitList.innerHTML = "";
  state.recommendation.outfit.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.outfitList.append(li);
  });
}

function renderProfile() {
  const bias = rounded(state.profile.bias);
  els.biasMeter.style.left = `${clamp(50 + bias * 8, 5, 95)}%`;
  if (state.profile.feedbackCount === 0) {
    els.profileText.textContent  = "Ti conosco ancora poco: raccontami due uscite e divento più sveglio.";
    els.learningNote.textContent = "Non ti conosco ancora: parto neutro.";
  } else {
    const tendency = bias > 0.4 ? "senti più caldo degli altri" : bias < -0.4 ? "senti più freddo degli altri" : "sei allineato al meteo";
    els.profileText.textContent  = `Dopo ${state.profile.feedbackCount} feedback, ${tendency}. Correggo di ${bias > 0 ? "+" : ""}${bias} °C.`;
    els.learningNote.textContent = `La prossima volta ragiono con ${bias > 0 ? "+" : ""}${bias} °C in più.`;
  }
  els.historyList.innerHTML = "";
  const recent = state.profile.history.slice(0, 5);
  if (recent.length === 0) {
    els.historyList.innerHTML = '<li><span class="history-temp">--</span><span class="history-detail">Raccontami la prima uscita</span></li>';
    return;
  }
  recent.forEach((item) => {
    const row = els.historyTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".history-temp").textContent   = `${item.actual} °C`;
    row.querySelector(".history-detail").textContent = `${item.comfortLabel}, ${item.clothes || "senza dettagli"}`;
    els.historyList.append(row);
  });
}

// ── EVENTI ────────────────────────────────────────────────────────────────────
els.geoBtn.addEventListener("click", requestGeolocation);
els.refreshBtn.addEventListener("click", () => fetchWeather());
els.feedbackForm.addEventListener("change", aggiornaConsiglio);
els.feedbackForm.addEventListener("submit", handleFeedback);
els.loginBtn.addEventListener("click", () => handleAuth("login"));
els.registerBtn.addEventListener("click", () => handleAuth("register"));
els.logoutBtn.addEventListener("click", () => { clearSession(); renderAuthState("Sei uscito."); });
els.resetBtn.addEventListener("click", () => {
  state.profile = { bias: 0, feedbackCount: 0, history: [], bucketBiases: {} };
  storage("meteo:profile", state.profile);
  renderProfile();
  aggiornaConsiglio();
});

// ── AVVIO ─────────────────────────────────────────────────────────────────────
renderProfile();
renderAuthState();
fetchWeather(state.coords);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
}
