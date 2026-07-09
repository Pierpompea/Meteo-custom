const DEFAULT_COORDS = {
  latitude: 41.9028,
  longitude: 12.4964,
  name: "Roma, Italia",
};

const WEATHER_CODES = {
  0: "Cielo sereno",
  1: "Prevalentemente sereno",
  2: "Parzialmente nuvoloso",
  3: "Coperto",
  45: "Nebbia",
  48: "Nebbia con brina",
  51: "Pioviggine leggera",
  53: "Pioviggine moderata",
  55: "Pioviggine intensa",
  61: "Pioggia leggera",
  63: "Pioggia moderata",
  65: "Pioggia intensa",
  71: "Neve leggera",
  73: "Neve moderata",
  75: "Neve intensa",
  80: "Rovesci leggeri",
  81: "Rovesci moderati",
  82: "Rovesci violenti",
  95: "Temporale",
};

const WEATHER_THEME_CLASSES = ["weather-sunny", "weather-rainy", "weather-cloudy"];
const PROFILE_DEFAULTS = { bias: 0, feedbackCount: 0, history: [], bucketBiases: {} };
const TEMP_BUCKETS = [
  { id: "freezing", max: 5 },
  { id: "cold", max: 12 },
  { id: "cool", max: 18 },
  { id: "mild", max: 24 },
  { id: "warm", max: 30 },
  { id: "hot", max: Infinity },
];
const API_BASE_URL = (window.METEO_API_BASE_URL || localStorage.getItem("meteoApiBaseUrl") || "").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "meteoAuthToken";
const AUTH_USER_KEY = "meteoAuthUser";

const state = {
  weather: null,
  coords: loadSavedCoords(),
  profile: loadProfile(),
};

const els = {
  actualTemp: document.querySelector("#actualTemp"),
  personalTemp: document.querySelector("#personalTemp"),
  weatherSummary: document.querySelector("#weatherSummary"),
  personalSummary: document.querySelector("#personalSummary"),
  windValue: document.querySelector("#windValue"),
  humidityValue: document.querySelector("#humidityValue"),
  apparentValue: document.querySelector("#apparentValue"),
  outfitSummary: document.querySelector("#outfitSummary"),
  outfitList: document.querySelector("#outfitList"),
  locationName: document.querySelector("#locationName"),
  geoBtn: document.querySelector("#geoBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackToast: document.querySelector("#feedbackToast"),
  authStatus: document.querySelector("#authStatus"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  loginBtn: document.querySelector("#loginBtn"),
  registerBtn: document.querySelector("#registerBtn"),
  logoutBtn: document.querySelector("#logoutBtn"),
  learningNote: document.querySelector("#learningNote"),
  biasMeter: document.querySelector("#biasMeter"),
  profileText: document.querySelector("#profileText"),
  historyList: document.querySelector("#historyList"),
  historyTemplate: document.querySelector("#historyTemplate"),
  resetBtn: document.querySelector("#resetBtn"),
};

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem("personalWeatherProfile"));
    return normalizeProfile(saved);
  } catch {
    return normalizeProfile();
  }
}

function normalizeProfile(profile = {}) {
  return {
    ...PROFILE_DEFAULTS,
    ...profile,
    bias: Number.isFinite(profile.bias) ? profile.bias : PROFILE_DEFAULTS.bias,
    feedbackCount: Number.isFinite(profile.feedbackCount) ? profile.feedbackCount : PROFILE_DEFAULTS.feedbackCount,
    history: Array.isArray(profile.history) ? profile.history : [],
    bucketBiases: profile.bucketBiases && typeof profile.bucketBiases === "object" ? profile.bucketBiases : {},
  };
}

function saveProfile() {
  state.profile = normalizeProfile(state.profile);
  localStorage.setItem("personalWeatherProfile", JSON.stringify(state.profile));
  syncProfileToBackend();
}

function loadSavedCoords() {
  try {
    const saved = JSON.parse(localStorage.getItem("personalWeatherLastCoords"));
    if (Number.isFinite(saved?.latitude) && Number.isFinite(saved?.longitude)) {
      return {
        latitude: saved.latitude,
        longitude: saved.longitude,
        name: saved.name || "Ultima posizione salvata",
        accuracy: saved.accuracy,
        savedAt: saved.savedAt,
      };
    }
  } catch {
    return DEFAULT_COORDS;
  }

  return DEFAULT_COORDS;
}

function saveCoords(coords) {
  localStorage.setItem(
    "personalWeatherLastCoords",
    JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: coords.name,
      accuracy: coords.accuracy,
      savedAt: new Date().toISOString(),
    }),
  );
  syncProfileToBackend();
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthSession({ token, username }) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, username);
  renderAuthState();
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  renderAuthState();
}

function renderAuthState(message) {
  const username = localStorage.getItem(AUTH_USER_KEY);
  const hasBackend = Boolean(API_BASE_URL);
  const isLogged = Boolean(getAuthToken());

  if (!hasBackend) {
    els.authStatus.textContent = "Backend non configurato: sto usando solo il salvataggio locale.";
  } else if (message) {
    els.authStatus.textContent = message;
  } else if (isLogged) {
    els.authStatus.textContent = `Connesso come ${username}. Profilo sincronizzato.`;
  } else {
    els.authStatus.textContent = "Accedi per sincronizzare profilo e posizione.";
  }

  els.loginBtn.disabled = !hasBackend || isLogged;
  els.registerBtn.disabled = !hasBackend || isLogged;
  els.logoutBtn.hidden = !isLogged;
}

async function apiRequest(path, { method = "GET", body, auth = false } = {}) {
  if (!API_BASE_URL) throw new Error("Backend non configurato");

  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAuthToken();
    if (!token) throw new Error("Non sei loggato");
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Richiesta non riuscita");
  return data;
}

function getProfilePayload() {
  return {
    profile: normalizeProfile(state.profile),
    lastCoords: state.coords,
  };
}

function applyRemoteProfile(data) {
  if (data.profile) {
    state.profile = normalizeProfile(data.profile);
    localStorage.setItem("personalWeatherProfile", JSON.stringify(state.profile));
  }

  if (data.lastCoords?.latitude && data.lastCoords?.longitude) {
    state.coords = data.lastCoords;
    saveCoords(state.coords);
  }

  renderProfile();
  renderWeather();
}

async function syncProfileToBackend() {
  if (!API_BASE_URL || !getAuthToken()) return;
  try {
    await apiRequest("/api/profile", {
      method: "PUT",
      auth: true,
      body: getProfilePayload(),
    });
    renderAuthState("Profilo salvato anche sul backend.");
  } catch (error) {
    renderAuthState(`Sync non riuscita: ${error.message}`);
  }
}

async function loadProfileFromBackend() {
  if (!API_BASE_URL || !getAuthToken()) return;
  try {
    const data = await apiRequest("/api/profile", { auth: true });
    applyRemoteProfile(data);
    renderAuthState("Profilo caricato dal backend.");
  } catch (error) {
    renderAuthState(`Non riesco a caricare il profilo remoto: ${error.message}`);
  }
}

async function handleAuth(mode) {
  const username = els.authUsername.value.trim();
  const password = els.authPassword.value;

  if (!username || !password) {
    renderAuthState("Inserisci username e password.");
    return;
  }

  try {
    const data = await apiRequest(`/api/${mode}`, {
      method: "POST",
      body: { username, password, initialData: getProfilePayload() },
    });
    setAuthSession({ token: data.token, username: data.username });
    if (data.profile || data.lastCoords) applyRemoteProfile(data);
    await syncProfileToBackend();
    els.authPassword.value = "";
    renderAuthState(mode === "register" ? "Account creato e profilo sincronizzato." : "Accesso effettuato.");
  } catch (error) {
    renderAuthState(error.message);
  }
}

function rounded(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTemperatureBucket(temperature) {
  return TEMP_BUCKETS.find((bucket) => temperature <= bucket.max)?.id || "mild";
}

function getBucketBias(temperature) {
  const bucket = getTemperatureBucket(temperature);
  return Number(state.profile.bucketBiases?.[bucket]) || 0;
}

function uniqueParts(parts) {
  return [...new Set(parts.filter(Boolean).map((part) => part.trim()).filter(Boolean))];
}

function formatNominatimLocation(data, fallbackName) {
  const address = data.address || {};
  const city = address.city || address.town || address.village || address.municipality || address.county;
  const zone =
    address.neighbourhood ||
    address.suburb ||
    address.quarter ||
    address.city_district ||
    address.borough ||
    address.hamlet;
  const specific = address.pedestrian || address.road || address.square || address.place;
  const parts = uniqueParts([city, zone, specific]);

  return parts.length > 0 ? parts.join(" · ") : fallbackName;
}

function formatBigDataCloudLocation(data, fallbackName) {
  const localityInfo = data.localityInfo || {};
  const localities = Array.isArray(localityInfo.informative) ? localityInfo.informative : [];
  const zone = localities.find((item) => ["neighbourhood", "suburb", "quarter"].includes(item.description))?.name;
  const city = data.city || data.locality || data.principalSubdivision;
  const parts = uniqueParts([city, zone]);

  return parts.length > 0 ? parts.join(" · ") : fallbackName;
}

function formatAccuracy(accuracy) {
  if (!Number.isFinite(accuracy)) return "";
  if (accuracy >= 1000) return `precisione circa ${rounded(accuracy / 1000)} km`;
  return `precisione circa ${Math.round(accuracy)} m`;
}

async function enrichLocationName(coords, { save = false } = {}) {
  if (!navigator.onLine) return;

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: coords.latitude,
      lon: coords.longitude,
      zoom: "18",
      addressdetails: "1",
      "accept-language": "it",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!response.ok) throw new Error("Reverse geocoding unavailable");

    const data = await response.json();
    const accuracy = formatAccuracy(coords.accuracy);
    state.coords = {
      ...state.coords,
      name: [formatNominatimLocation(data, coords.name), accuracy].filter(Boolean).join(" · "),
    };
    els.locationName.textContent = state.coords.name;
    if (save) saveCoords(state.coords);
    return;
  } catch {
    // Try a lighter fallback below.
  }

  try {
    const params = new URLSearchParams({
      latitude: coords.latitude,
      longitude: coords.longitude,
      localityLanguage: "it",
    });
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`);
    if (!response.ok) return;

    const data = await response.json();
    const accuracy = formatAccuracy(coords.accuracy);
    state.coords = {
      ...state.coords,
      name: [formatBigDataCloudLocation(data, coords.name), accuracy].filter(Boolean).join(" · "),
    };
    els.locationName.textContent = state.coords.name;
    if (save) saveCoords(state.coords);
  } catch {
    // If reverse geocoding is unavailable, coordinates still drive the weather.
  }
}

function getSelectedClothing() {
  return [...document.querySelectorAll("input[name='clothing']:checked")].map((input) => ({
    label: input.parentElement.textContent.trim(),
    weight: Number(input.dataset.weight),
  }));
}

function clothingAdjustment(items) {
  return items.reduce((sum, item) => sum + item.weight, 0) * 0.35; //funzione probabilmente inutile
}

function clothingWarmth(items) {
  return items.reduce((sum, item) => sum + item.weight, 0); //utilizzo reduce che fa un for di tutti gli elementi dell'array e li somma. restituisce un unico oggetto
}

function calculatePersonalTemp() {
  if (!state.weather) return null;
  const clothes = getSelectedClothing();
  const adjusted = state.weather.apparentTemperature + state.profile.bias + getBucketBias(state.weather.apparentTemperature) + clothingAdjustment(clothes); //da sostituire prob con clothingwarmth
  return rounded(adjusted);
}

function calculateProfileTemp() {
  if (!state.weather) return null;
  return rounded(state.weather.apparentTemperature + state.profile.bias + getBucketBias(state.weather.apparentTemperature));
}

function getWeatherTheme(weatherCode) {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(weatherCode)) return "weather-rainy";
  if ([2, 3, 45, 48].includes(weatherCode)) return "weather-cloudy";
  return "weather-sunny";
}

function applyWeatherTheme() {
  if (!state.weather) return;
  document.body.classList.remove(...WEATHER_THEME_CLASSES);
  document.body.classList.add(getWeatherTheme(state.weather.weatherCode));
}

function buildOutfitRecommendation() {
  if (!state.weather) {
    return {
      title: "Appena capisco che aria tira, ti dico cosa metterei.",
      items: [],
    };
  }

  const profileTemp = calculateProfileTemp();
  const hasRain = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95].includes(state.weather.weatherCode);
  const isWindy = state.weather.windSpeed >= 22;
  const isHumid = state.weather.humidity >= 75;
  const feelsColder = state.profile.bias > 0.6;
  const feelsWarmer = state.profile.bias < -0.6;

  let title;
  let items;

  if (profileTemp <= 4) {
    title = "Copriti bene: oggi fuori fa il serio.";
    items = ["cappotto caldo", "maglione o pile", "sciarpa", "scarpe chiuse"];
  } else if (profileTemp <= 10) {
    title = "Strati furbi: fuori caldo addosso, dentro libertà.";
    items = ["giacca pesante", "maglione", "pantaloni lunghi", "calze calde"];
  } else if (profileTemp <= 16) {
    title = "Serve una via di mezzo: niente eroismi.";
    items = ["giacca leggera", "felpa o cardigan", "pantaloni lunghi", "strato facile da togliere"];
  } else if (profileTemp <= 22) {
    title = "Si sta bene, ma portati un piano B leggero.";
    items = ["t-shirt o camicia", "giacca leggera a portata", "pantaloni comodi"];
  } else if (profileTemp <= 28) {
    title = "Oggi andrei sul fresco e comodo.";
    items = ["t-shirt", "tessuti leggeri", "pantaloni leggeri o gonna", "occhiali da sole se esci a lungo"];
  } else {
    title = "Fa caldo davvero: lascia respirare tutto.";
    items = ["tessuti traspiranti", "pantaloncini o abiti leggeri", "cappello se stai al sole", "acqua con te"];
  }

  if (hasRain) items.push("ombrello o impermeabile");
  if (isWindy) items.push("strato antivento");
  if (isHumid && profileTemp >= 20) items.push("qualcosa che asciughi in fretta");
  if (feelsColder && profileTemp <= 18) items.push("uno strato extra, per sicurezza");
  if (feelsWarmer && profileTemp >= 14) items.push("strati facili da togliere");

  return { title, items: [...new Set(items)] };
}

function renderOutfitRecommendation() {
  const recommendation = buildOutfitRecommendation();
  els.outfitSummary.textContent = recommendation.title;
  els.outfitList.innerHTML = "";

  recommendation.items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    els.outfitList.append(li);
  });
}

function getComfortMeta(comfort) {
  const comfortMap = {
    veryCold: { label: "molto freddo", score: -1.2, toast: "Ok, messaggio ricevuto: la prossima volta ti copro un po' di piu." },
    cold: { label: "freddo", score: -0.7, toast: "Me lo segno: per te oggi serviva uno strato in piu." },
    ok: { label: "perfetto", score: 0, toast: "Perfetto, questo outfit era centrato. Lo tengo come riferimento." },
    hot: { label: "caldo", score: 0.7, toast: "Capito: la prossima volta ti alleggerisco un po' il consiglio." },
    veryHot: { label: "molto caldo", score: 1.2, toast: "Ricevuto forte e chiaro: oggi eri troppo coperto." },
  };

  return comfortMap[comfort] || comfortMap.ok;
}

function getEnvironmentMultiplier(score, apparentTemperature) { 
  if (score > 0 && apparentTemperature <= 6) return 0.7;
  if (score < 0 && apparentTemperature >= 29) return 0.7;
  if (score > 0 && apparentTemperature >= 18) return 1.15;
  if (score < 0 && apparentTemperature <= 16) return 1.15;
  return 1;
}

function getClothingMultiplier(score, clothes) {
  const warmth = clothingWarmth(clothes);
  if (score < 0 && warmth >= 3) return 1.25;
  if (score < 0 && warmth <= -1) return 0.72;
  if (score > 0 && warmth <= -1) return 1.25;
  if (score > 0 && warmth >= 3) return 0.72;
  return 1;
}

function applyFeedbackLearning(comfortMeta, clothes) {
  const bucket = getTemperatureBucket(state.weather.apparentTemperature);

  if (comfortMeta.score === 0) {
    state.profile.bias = rounded(state.profile.bias * 0.9);
    state.profile.bucketBiases[bucket] = rounded((Number(state.profile.bucketBiases[bucket]) || 0) * 0.82);
    return 0;
  }

  const environmentMultiplier = getEnvironmentMultiplier(comfortMeta.score, state.weather.apparentTemperature);
  const clothingMultiplier = getClothingMultiplier(comfortMeta.score, clothes);
  const learningStep = rounded(comfortMeta.score * environmentMultiplier * clothingMultiplier);

  state.profile.bias = rounded(clamp(state.profile.bias + learningStep * 0.42, -4, 4));
  state.profile.bucketBiases[bucket] = rounded(clamp((Number(state.profile.bucketBiases[bucket]) || 0) + learningStep * 0.5, -3, 3));

  return learningStep;
}

function renderWeather() {
  if (!state.weather) return;

  const personalTemp = calculatePersonalTemp();
  const profileTemp = calculateProfileTemp();
  els.actualTemp.textContent = rounded(state.weather.temperature);
  els.personalTemp.textContent = personalTemp;
  els.windValue.textContent = `${rounded(state.weather.windSpeed)} km/h`;
  els.humidityValue.textContent = `${state.weather.humidity}%`;
  els.apparentValue.textContent = `${rounded(state.weather.apparentTemperature)} °C`;
  els.locationName.textContent = state.coords.name;
  els.weatherSummary.textContent = `${WEATHER_CODES[state.weather.weatherCode] || "Meteo ballerino"} adesso, aggiornato alle ${new Date(
    state.weather.time,
  ).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}.`;

  const difference = rounded(profileTemp - state.weather.temperature);
  const phrase =
    difference > 1
      ? `Secondo il tuo corpo, oggi potrebbe sembrare circa ${difference} °C più caldo. Io mi regolo su quello.`
      : difference < -1
        ? `Secondo il tuo corpo, oggi potrebbe sembrare circa ${Math.abs(difference)} °C più freddo. Non facciamoci fregare dal numero.`
        : "Oggi numero e sensazione dovrebbero parlarsi abbastanza bene.";
  els.personalSummary.textContent = phrase;

  applyWeatherTheme();
  renderOutfitRecommendation();
  renderProfile();
}

function renderProfile() {
  const currentBucketBias = state.weather ? getBucketBias(state.weather.apparentTemperature) : 0;
  const bias = rounded(state.profile.bias + currentBucketBias);
  const meterPosition = Math.max(5, Math.min(95, 50 + bias * 8));
  els.biasMeter.style.left = `${meterPosition}%`;

  if (state.profile.feedbackCount === 0) {
    els.profileText.textContent = "Ti conosco ancora poco: raccontami due uscite e divento piu sveglio.";
    els.learningNote.textContent = "Non ti conosco ancora: parto neutro.";
  } else {
    const tendency = bias > 0.4 ? "di solito senti più freddo degli altri" : bias < -0.4 ? "di solito senti più caldo degli altri" : "sei abbastanza allineato al meteo";
    els.profileText.textContent = `Dopo ${state.profile.feedbackCount} feedback, ${tendency}. In questa fascia meteo correggo i consigli di ${bias > 0 ? "+" : ""}${bias} °C.`;
    els.learningNote.textContent = `Ricevuto: la prossima volta ragiono con ${bias > 0 ? "+" : ""}${bias} °C di esperienza in piu.`;
  }

  els.historyList.innerHTML = "";
  const recent = state.profile.history.slice(0, 5);
  if (recent.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = '<span class="history-temp">--</span><span class="history-detail">Raccontami la prima uscita</span>';
    els.historyList.append(empty);
    return;
  }

  recent.forEach((item) => {
    const row = els.historyTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".history-temp").textContent = `${item.actual} °C`;
    row.querySelector(".history-detail").textContent = `${item.comfortLabel}, ${item.clothes || "senza dettagli"}`;
    els.historyList.append(row);
  });
}

async function fetchWeather(coords = state.coords) {
  els.weatherSummary.textContent = "Sto sbirciando fuori per te...";
  const params = new URLSearchParams({
    latitude: coords.latitude,
    longitude: coords.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Meteo non disponibile");

  const data = await response.json();
  state.weather = {
    temperature: data.current.temperature_2m,
    humidity: data.current.relative_humidity_2m,
    apparentTemperature: data.current.apparent_temperature,
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    time: data.current.time,
  };
  renderWeather();
}

function updateCoordsFromPosition(position) {
  state.coords = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    name: ["La tua posizione", formatAccuracy(position.coords.accuracy)].filter(Boolean).join(" · "),
  };
  saveCoords(state.coords);
  enrichLocationName(state.coords, { save: true });
  fetchWeather().catch(showWeatherError);
}

function showWeatherError(error) {
  els.weatherSummary.textContent = `${error.message}. Per non lasciarti al buio, parto da Roma.`;
  state.coords = DEFAULT_COORDS;
  fetchWeather(DEFAULT_COORDS).catch(() => {
    els.weatherSummary.textContent = "Il meteo non mi risponde. Riprova tra poco, magari si scioglie.";
  });
}

function handleFeedback(event) {
  event.preventDefault();
  if (!state.weather) return;

  const formData = new FormData(els.feedbackForm);
  const comfort = formData.get("comfort");
  const clothes = getSelectedClothing();
  const comfortMeta = getComfortMeta(comfort);
  const learningStep = applyFeedbackLearning(comfortMeta, clothes);

  state.profile.feedbackCount += 1;
  state.profile.history.unshift({
    actual: rounded(state.weather.temperature),
    personal: calculatePersonalTemp(),
    comfortLabel: comfortMeta.label,
    clothes: clothes.map((item) => item.label).join(", "),
    bucket: getTemperatureBucket(state.weather.apparentTemperature),
    learningStep,
    date: new Date().toISOString(),
  });
  state.profile.history = state.profile.history.slice(0, 12);
  saveProfile();
  renderWeather();
  els.feedbackToast.textContent = comfortMeta.toast;
  els.feedbackToast.classList.add("is-visible");
}

function requestGeolocation() {
  if (!navigator.geolocation) {
    els.locationName.textContent = "Il browser non mi lascia leggere il GPS. Uso l'ultima posizione salvata.";
    fetchWeather(state.coords).catch(showWeatherError);
    return;
  }

  els.locationName.textContent = "Cerco dove sei...";
  navigator.geolocation.getCurrentPosition(
    updateCoordsFromPosition,
    (error) => {
      const savedCoords = loadSavedCoords();
      state.coords = savedCoords;
      const reason =
        error.code === error.PERMISSION_DENIED
          ? "Non ho il permesso per il GPS"
          : error.code === error.TIMEOUT
            ? "Il GPS ci sta mettendo troppo"
            : "Non riesco a leggere la posizione";
      els.locationName.textContent = `${reason}. Uso l'ultima posizione salvata.`;
      fetchWeather(savedCoords).catch(showWeatherError);
    },
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 300000,
    },
  );
}

els.geoBtn.addEventListener("click", requestGeolocation);
els.refreshBtn.addEventListener("click", () => fetchWeather().catch(showWeatherError));
els.feedbackForm.addEventListener("change", renderWeather);
els.feedbackForm.addEventListener("submit", handleFeedback);
els.loginBtn.addEventListener("click", () => handleAuth("login"));
els.registerBtn.addEventListener("click", () => handleAuth("register"));
els.logoutBtn.addEventListener("click", () => {
  clearAuthSession();
  renderAuthState("Sei uscito. Da ora salvo solo sul dispositivo.");
});
els.resetBtn.addEventListener("click", () => {
  state.profile = normalizeProfile();
  saveProfile();
  renderProfile();
  renderWeather();
});

renderProfile();
renderAuthState();
loadProfileFromBackend();
fetchWeather(state.coords).then(() => enrichLocationName(state.coords, { save: state.coords !== DEFAULT_COORDS })).catch(showWeatherError);

const wardrobeObserver = new IntersectionObserver(
  ([entry]) => {
    document.body.classList.toggle("wardrobe-active", entry.isIntersecting);
  },
  { threshold: 0.35 },
);

wardrobeObserver.observe(els.feedbackForm);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app still works normally if the browser blocks service workers on file://.
    });
  });
}
