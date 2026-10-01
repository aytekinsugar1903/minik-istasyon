import {
  MAX_STARS,
  ROUTES,
  act,
  continueTarget,
  createRun,
  emptyProgress,
  isUnlocked,
  kancaSpeeds,
  levelSpec,
  loadWeight,
  previewStop,
  recordClear,
  routeById,
  starsFor,
  step,
  totalStars,
  trackY,
} from "./sim.js";

const SAVE_KEY = "minik-istasyon-v1";
const MUTE_KEY = "minik-istasyon-mute";

const homeEl = document.querySelector("#screen-home");
const routeEl = document.querySelector("#screen-route");
const playEl = document.querySelector("#screen-play");
const homeBtn = document.querySelector("#home-btn");
const starPill = document.querySelector("#star-pill");
const muteBtn = document.querySelector("#mute");
const canvas = document.querySelector("#view");
const ctx = canvas.getContext("2d");
const resultEl = document.querySelector("#result");
const pauseEl = document.querySelector("#pause");
const kickerEl = document.querySelector("#kicker");
const titleEl = document.querySelector("#level-title");
const blurbEl = document.querySelector("#blurb");
const readoutEl = document.querySelector("#readout");
const hintEl = document.querySelector("#hint");
const controlsEl = document.querySelector("#controls");

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const skies = {
  dawn: ["#f0b27a", "#f8e6cf", "#7f9a62", "#c9b08a"],
  noon: ["#7eb6e8", "#d9eefc", "#6ea15a", "#e4d2ae"],
  rain: ["#667684", "#c5d0d4", "#5c6b59", "#9a917f"],
  dusk: ["#3d3a6e", "#e7a06a", "#3d4c3c", "#a56b49"],
  night: ["#141824", "#2a3548", "#1b2922", "#3c362e"],
};

const progressLoad = loadProgress();

const state = {
  screen: "home",
  progress: progressLoad.progress,
  storageOk: progressLoad.ok,
  muted: localStorageGet(MUTE_KEY) === "1",
  run: null,
  paused: false,
  resolved: false,
  anim: 0,
  wheel: 0,
  puffs: [],
  ghostTravel: null,
  ghostBrake: null,
  audio: null,
};

function localStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ok: true, progress: emptyProgress() };
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return { ok: true, progress: emptyProgress() };
    return { ok: true, progress: { v: 1, stars: data.stars ?? {}, cleared: data.cleared ?? {} } };
  } catch {
    return { ok: false, progress: emptyProgress() };
  }
}

function saveProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.progress));
    state.storageOk = true;
  } catch {
    state.storageOk = false;
  }
}

function tone(freq, duration, type = "sine", gain = 0.05) {
  if (state.muted) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!state.audio) state.audio = new AudioCtx();
  const now = state.audio.currentTime;
  const osc = state.audio.createOscillator();
  const amp = state.audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(amp);
  amp.connect(state.audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playChord(ok) {
  if (ok) {
    tone(523, 0.18, "triangle", 0.05);
    setTimeout(() => tone(659, 0.22, "triangle", 0.05), 90);
  } else {
    tone(146, 0.22, "sawtooth", 0.03);
  }
}

function starText(count) {
  return `${"★".repeat(count)}${"☆".repeat(Math.max(0, 3 - count))}`;
}

function routeStars(route) {
  let sum = 0;
  for (let level = 1; level <= 10; level += 1) sum += starsFor(state.progress, route, level);
  return sum;
}

function paintChrome() {
  starPill.textContent = `${totalStars(state.progress)} / ${MAX_STARS}`;
  muteBtn.textContent = state.muted ? "Ses kapalı" : "Ses açık";
  homeBtn.hidden = state.screen === "home";
}

function show(screen) {
  state.screen = screen;
  homeEl.hidden = screen !== "home";
  routeEl.hidden = screen !== "route";
  playEl.hidden = screen !== "play";
  paintChrome();
}

function renderHome() {
  const next = continueTarget(state.progress);
  const route = routeById(next.route);
  const done = totalStars(state.progress) >= MAX_STARS;
  const cards = ROUTES.map((item) => `
    <button class="card" type="button" data-route="${item.id}" style="--route:${item.color}">
      <b>${item.name}</b>
      <span>${item.verb}</span>
      <span>${routeStars(item.id)} / 30 yıldız</span>
    </button>
  `).join("");
  homeEl.innerHTML = `
    <section class="hero">
      <p class="lede">İstasyonda bu gece tek kişi sensin. Her bölümde bir vagon ve bir karar var: kol, fren, yük, kanca ya da kapak.</p>
      <button id="continue" class="primary" type="button">${done ? "Yıldızlar tamam" : `Devam · ${route.name} ${next.level}`}</button>
    </section>
    <div class="routes">${cards}</div>
    ${state.storageOk ? "" : `<p class="warn storage">Kayıt yazılamıyor. Yıldızlar bu oturumda kalır.</p>`}
  `;
  homeEl.querySelector("#continue").addEventListener("click", () => openLevel(next.route, next.level));
  for (const button of homeEl.querySelectorAll("[data-route]")) {
    button.addEventListener("click", () => openRoute(button.dataset.route));
  }
  show("home");
}

function openRoute(routeId) {
  const route = routeById(routeId);
  const buttons = Array.from({ length: 10 }, (_, index) => {
    const level = index + 1;
    const spec = levelSpec(route.id, level);
    const unlocked = isUnlocked(state.progress, route.id, level);
    const stars = starsFor(state.progress, route.id, level);
    return `
      <button class="level-btn" type="button" data-level="${level}" ${unlocked ? "" : "disabled"}>
        <span class="idx">${unlocked ? `BÖLÜM ${level}` : "KİLİTLİ"}</span>
        <strong>${spec.name}</strong>
        <span>${unlocked ? starText(stars) : "Önce bir öncekini bitir"}</span>
      </button>
    `;
  }).join("");
  routeEl.innerHTML = `
    <div class="route-head">
      <div>
        <p class="eyebrow">${route.verb}</p>
        <h2>${route.name}</h2>
      </div>
      <span class="pill">${routeStars(route.id)} / 30</span>
    </div>
    <div class="level-grid">${buttons}</div>
  `;
  for (const button of routeEl.querySelectorAll("[data-level]")) {
    button.addEventListener("click", () => openLevel(route.id, Number(button.dataset.level)));
  }
  show("route");
  state.routeId = route.id;
}

function openLevel(route, level) {
  if (!isUnlocked(state.progress, route, level)) return;
  state.run = createRun(route, level);
  state.paused = false;
  state.resolved = false;
  state.puffs = [];
  state.wheel = 0;
  state.ghostBrake = null;
  state.ghostTravel = null;
  pauseEl.hidden = true;
  resultEl.hidden = true;
  const spec = state.run.spec;
  const meta = routeById(route);
  kickerEl.textContent = `${meta.name} · bölüm ${level}`;
  titleEl.textContent = spec.name;
  blurbEl.textContent = spec.blurb;
  hintEl.textContent = spec.coach ? spec.hint : "";
  renderControls();
  updateReadout();
  show("play");
  fitCanvas();
  tone(392, 0.08, "triangle", 0.03);
}

function renderControls() {
  const run = state.run;
  const spec = run.spec;
  if (run.route === "makas") {
    controlsEl.innerHTML = `<button id="act" class="go" type="button">Kolu çevir</button>`;
    controlsEl.querySelector("#act").addEventListener("click", () => doAction({ type: "throw" }));
  } else if (run.route === "fren") {
    controlsEl.innerHTML = `
      <label class="brake">Fren kolu
        <input id="brake" type="range" min="0" max="1000" value="${Math.round(run.brake * 1000)}">
      </label>
      <button id="act" class="go" type="button">Bırak</button>
    `;
    const slider = controlsEl.querySelector("#brake");
    slider.addEventListener("input", () => {
      act(run, { type: "brake", value: Number(slider.value) / 1000 });
      updateReadout();
    });
    controlsEl.querySelector("#act").addEventListener("click", () => doAction({ type: "release" }));
  } else if (run.route === "kurek") {
    const labels = { wood: "Ahşap · 1 kg", coal: "Kömür · 2 kg", stone: "Taş · 3 kg" };
    controlsEl.innerHTML = `
      ${spec.allow.map((material) => `<button type="button" data-scoop="${material}">${labels[material]}</button>`).join("")}
      <button id="undo" type="button">Son küreği geri al</button>
      <button id="act" class="go" type="button">Köprüyü kur</button>
    `;
    for (const button of controlsEl.querySelectorAll("[data-scoop]")) {
      button.addEventListener("click", () => {
        doAction({ type: "scoop", material: button.dataset.scoop });
      });
    }
    controlsEl.querySelector("#undo").addEventListener("click", () => doAction({ type: "undo" }));
    controlsEl.querySelector("#act").addEventListener("click", () => doAction({ type: "confirm" }));
  } else if (run.route === "kanca") {
    controlsEl.innerHTML = `<button id="act" class="go" type="button">Kancayı bırak</button>`;
    controlsEl.querySelector("#act").addEventListener("click", () => doAction({ type: "hook" }));
  } else {
    controlsEl.innerHTML = spec.order.map((gate) => `
      <button type="button" data-gate="${gate}">${spec.labels[gate]}</button>
    `).join("");
    for (const button of controlsEl.querySelectorAll("[data-gate]")) {
      button.addEventListener("click", () => doAction({ type: "gate", gate: button.dataset.gate }));
    }
  }
}

function doAction(action) {
  const run = state.run;
  if (!run || state.paused || state.resolved) return;
  if (run.phase !== "play" && run.phase !== "aim") return;
  act(run, action);
  if (action.type === "throw" || action.type === "hook" || action.type === "release" || action.type === "gate") {
    tone(210, 0.07, "square", 0.03);
  }
  updateReadout();
  markGates();
}

function markGates() {
  const run = state.run;
  if (!run || run.route !== "bariyer") return;
  const expected = run.spec.order[run.stepIndex];
  for (const button of controlsEl.querySelectorAll("[data-gate]")) {
    button.classList.toggle("next-gate", button.dataset.gate === expected && run.phase === "play");
    button.disabled = run.phase !== "play";
  }
}

function updateReadout() {
  const run = state.run;
  if (!run) return;
  let text = "";
  let toneClass = "";
  if (run.route === "makas") {
    const spec = run.spec;
    const zone = run.throws === 0 ? [spec.zoneMin, spec.zoneMax] : [spec.zone2Min, spec.zone2Max];
    const needed = spec.second ? 2 : 1;
    if (run.throws >= needed) text = "Vagon perona gidiyor";
    else if (run.x < zone[0]) text = run.throws === 0 ? "Altın şerit yaklaşıyor" : "İkinci kola hazırlan";
    else if (run.x <= zone[1]) {
      text = "Çevir";
      toneClass = "good";
    } else text = "Şerit geçti";
  } else if (run.route === "fren") {
    const travel = ghostTravel(run);
    if (travel > 4000) {
      text = "Bu frenle durmaz";
      toneClass = "bad";
    } else {
      const err = travel - run.spec.target;
      const ahead = err > 0;
      text = `Şeride ${Math.abs(err).toFixed(0)} birim ${ahead ? "ileri" : "geri"} · pay ±${run.spec.tol.toFixed(0)}`;
      toneClass = Math.abs(err) <= run.spec.tol ? "good" : "bad";
    }
  } else if (run.route === "kurek") {
    const weight = loadWeight(run.spec, run.counts);
    const err = Math.abs(weight - run.spec.target);
    const goal = run.spec.tol < 1 ? `tam ${run.spec.target} kg` : `${run.spec.target} kg ± ${run.spec.tol.toFixed(1)}`;
    text = `${weight} kg · hedef ${goal}`;
    toneClass = err <= run.spec.tol ? "good" : "";
  } else if (run.route === "kanca") {
    const speeds = kancaSpeeds(run.spec, run.t);
    text = `Fark ${speeds.delta.toFixed(1)} · sınır ${run.spec.threshold.toFixed(1)}`;
    toneClass = speeds.delta <= run.spec.threshold ? "good" : "";
  } else {
    const spec = run.spec;
    const next = spec.labels[spec.order[run.stepIndex]] ?? "Vagon geçiyor";
    const clock = spec.timer ? ` · süre ${Math.max(0, run.clock).toFixed(1)} sn` : "";
    const spring = run.stepIndex === 1 && spec.spring > 0 ? ` · kapak ${Math.max(0, run.springLeft).toFixed(1)} sn` : "";
    text = `${next}${clock}${spring}`;
  }
  readoutEl.textContent = text;
  readoutEl.className = toneClass;
  markGates();
}

function ghostTravel(run) {
  if (state.ghostBrake !== run.brake || state.ghostTravel == null) {
    state.ghostBrake = run.brake;
    state.ghostTravel = previewStop(run.spec, run.brake) - run.spec.startX;
  }
  return state.ghostTravel;
}

function onResolve() {
  const run = state.run;
  state.resolved = true;
  const won = run.phase === "won";
  if (won) {
    state.progress = recordClear(state.progress, run.route, run.n, run.stars);
    saveProgress();
    paintChrome();
  }
  playChord(won);
  const titles = {
    makas: "Doğru hatta",
    fren: "Şeritte durdu",
    kurek: "Köprü kalktı",
    kanca: "Kanca oturdu",
    bariyer: "Geçit açıldı",
  };
  const hasNext = won && run.n < 10;
  resultEl.hidden = false;
  resultEl.innerHTML = `
    <h3>${won ? titles[run.route] : run.fail}</h3>
    ${won ? `<p class="stars">${starText(run.stars)}</p>` : ""}
    <p>${run.note || ""}</p>
    <div class="row">
      <button id="retry" type="button">Yeniden</button>
      ${hasNext ? `<button id="next" class="primary" type="button">Sonraki</button>` : `<button id="back" class="primary" type="button">${won ? "Rotaya dön" : "Bölümler"}</button>`}
    </div>
  `;
  resultEl.querySelector("#retry").addEventListener("click", () => openLevel(run.route, run.n));
  resultEl.querySelector("#next")?.addEventListener("click", () => openLevel(run.route, run.n + 1));
  resultEl.querySelector("#back")?.addEventListener("click", () => openRoute(run.route));
  (resultEl.querySelector("#next") || resultEl.querySelector("#back") || resultEl.querySelector("#retry")).focus();
}

function fitCanvas() {
  const width = canvas.clientWidth || 960;
  const height = width * 540 / 960;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(canvas.width / 960, 0, 0, canvas.height / 540, 0, 0);
}

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - (frame.last || now)) / 1000));
  frame.last = now;
  if (state.screen === "play" && state.run) {
    if (!state.paused) {
      if (!reduced) state.anim += dt;
      if (state.run.phase === "play") step(state.run, dt);
      state.wheel += (state.run.v || 0) * dt * 0.08;
      if ((state.run.phase === "won" || state.run.phase === "lost") && !state.resolved) onResolve();
      if (!reduced && state.run.route === "makas" && state.run.v > 20 && state.puffs.length < 18 && Math.random() < 0.35) {
        state.puffs.push({ x: state.run.x - 24, y: trackY(state.run) - 56, life: 1 });
      }
    }
    updateReadout();
    for (const puff of state.puffs) {
      puff.y -= 18 * dt;
      puff.life -= dt;
    }
    state.puffs = state.puffs.filter((puff) => puff.life > 0);
    draw();
  }
  requestAnimationFrame(frame);
}

function draw() {
  const run = state.run;
  const sky = skies[run.spec.atmosphere];
  const gradient = ctx.createLinearGradient(0, 0, 0, 360);
  gradient.addColorStop(0, sky[0]);
  gradient.addColorStop(1, sky[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 540);
  drawCelestial(run.spec.atmosphere);
  drawHills(sky[2]);
  ctx.fillStyle = sky[3];
  ctx.fillRect(0, 430, 960, 110);
  if (run.route === "makas") drawMakas(run);
  else if (run.route === "fren") drawFren(run);
  else if (run.route === "kurek") drawKurek(run);
  else if (run.route === "kanca") drawKanca(run);
  else drawBariyer(run);
  if (run.spec.atmosphere === "rain" && !reduced) drawRain();
  drawLantern(86, 392);
  drawLantern(860, 392);
}

function drawCelestial(atmosphere) {
  const night = atmosphere === "night" || atmosphere === "dusk";
  ctx.fillStyle = night ? "#f4ecd4" : "#fff4c8";
  ctx.beginPath();
  ctx.arc(night ? 780 : 820, night ? 78 : 92, night ? 22 : 34, 0, Math.PI * 2);
  ctx.fill();
  if (atmosphere === "night") {
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 97) % 900 + 20;
      const y = (i * 53) % 150 + 20;
      ctx.globalAlpha = reduced ? 0.8 : 0.45 + Math.sin(state.anim * 2 + i) * 0.35;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

function drawHills(color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 300);
  ctx.quadraticCurveTo(180, 230, 360, 292);
  ctx.quadraticCurveTo(560, 210, 760, 286);
  ctx.quadraticCurveTo(860, 250, 960, 300);
  ctx.lineTo(960, 440);
  ctx.lineTo(0, 440);
  ctx.fill();
}

function drawRails(y, from = 16, to = 944) {
  ctx.strokeStyle = "#6d5844";
  ctx.lineWidth = 4;
  for (let x = from; x < to; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 16, y + 12);
    ctx.stroke();
  }
  ctx.strokeStyle = "#d7d2c8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(from, y - 6);
  ctx.lineTo(to, y - 6);
  ctx.moveTo(from, y + 8);
  ctx.lineTo(to, y + 8);
  ctx.stroke();
}

function drawWagon(x, y, ghost = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = ghost ? 0.45 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 34, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, -34, -28, 68, 32, 8);
  ctx.fillStyle = "#f4ecdf";
  ctx.fill();
  roundRect(ctx, 2, -48, 30, 24, 6);
  ctx.fillStyle = "#c94b3a";
  ctx.fill();
  ctx.fillStyle = "#f6d98a";
  ctx.fillRect(-22, -20, 14, 12);
  ctx.fillRect(-4, -20, 12, 12);
  ctx.fillStyle = "#2a2118";
  for (const wheel of [-18, 16]) {
    ctx.save();
    ctx.translate(wheel, 8);
    ctx.rotate(state.wheel);
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#e7d7bd";
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawMakas(run) {
  drawRails(386);
  ctx.strokeStyle = "#d7d2c8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(run.spec.switchX, 380);
  ctx.lineTo(run.spec.switchX + 120, 302);
  ctx.moveTo(run.spec.switch2X, 318);
  ctx.lineTo(run.spec.switch2X + 110, 366);
  ctx.stroke();
  const zone = run.throws === 0 || !run.spec.second
    ? [run.spec.zoneMin, run.spec.zoneMax, 386]
    : [run.spec.zone2Min, run.spec.zone2Max, 318];
  ctx.fillStyle = "rgba(255, 196, 46, 0.92)";
  ctx.fillRect(zone[0], zone[2] - 24, Math.max(10, zone[1] - zone[0]), 44);
  ctx.fillStyle = "#fff8df";
  ctx.fillRect(zone[0], zone[2] - 24, 5, 44);
  ctx.fillRect(zone[1] - 5, zone[2] - 24, 5, 44);
  drawStation(760, 250);
  drawWagon(run.x, trackY(run) - 8);
  for (const puff of state.puffs) puffAt(puff);
  drawLever(70, 250, run.throws > 0);
  if (run.spec.second) drawLever(150, 230, run.throws > 1);
}

function drawFren(run) {
  const yAt = (x) => 300 + (x - 40) * 0.12;
  ctx.strokeStyle = "#d7d2c8";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(40, yAt(40));
  ctx.lineTo(920, yAt(920));
  ctx.stroke();
  const center = run.spec.startX + run.spec.target;
  ctx.fillStyle = "rgba(47, 107, 74, 0.35)";
  ctx.fillRect(center - run.spec.tol, yAt(center) - 18, run.spec.tol * 2, 28);
  const travel = ghostTravel(run);
  if (run.phase === "aim" && travel < 4000) {
    const ghostX = Math.min(900, run.spec.startX + travel);
    drawWagon(ghostX, yAt(ghostX) - 8, true);
  }
  const wagonX = run.phase === "aim" ? run.spec.startX : run.x;
  drawWagon(wagonX, yAt(wagonX) - 8);
  drawStation(800, 300);
}

function drawKurek(run) {
  const weight = loadWeight(run.spec, run.counts);
  const tilt = Math.max(-0.42, Math.min(0.42, (weight - run.spec.target) / Math.max(run.spec.tol, 0.8) * 0.28));
  const ok = Math.abs(weight - run.spec.target) <= run.spec.tol;
  ctx.save();
  ctx.translate(470, 300);
  ctx.rotate(tilt);
  ctx.fillStyle = "#6a4b32";
  ctx.fillRect(-180, -8, 360, 16);
  ctx.fillStyle = ok ? "#2f6b4a" : "#c94b3a";
  pan(ctx, -170, 10, run.counts);
  ctx.fillStyle = "#d7d2c8";
  ctx.fillRect(150, 8, 46, 28);
  ctx.restore();
  ctx.fillStyle = "#4d3b2c";
  ctx.fillRect(458, 300, 24, 120);
  drawStation(760, 250);
  if (run.phase === "won") drawWagon(250, 360);
}

function pan(context, x, y, counts) {
  context.fillRect(x, y, 70, 12);
  let cursor = x + 8;
  const colors = { wood: "#c9894b", coal: "#2c2c2c", stone: "#8d8d8d" };
  for (const material of ["wood", "coal", "stone"]) {
    for (let i = 0; i < counts[material]; i += 1) {
      context.fillStyle = colors[material];
      context.fillRect(cursor, y - 16 - (i % 4) * 14, 16, 12);
      if (i % 4 === 3) cursor += 18;
    }
  }
}

function drawKanca(run) {
  drawRails(360, 80, 880);
  drawRails(430, 80, 880);
  const speeds = kancaSpeeds(run.spec, run.t);
  drawWagon(250, 348);
  drawWagon(250, 418);
  ctx.strokeStyle = run.coupled ? "#e7a322" : "#6d5844";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(250, 372);
  ctx.quadraticCurveTo(250, 390, 250, 404);
  ctx.stroke();
  drawDial(700, 250, speeds, run.spec.threshold);
}

function drawDial(x, y, speeds, threshold) {
  ctx.fillStyle = "#f6efe2";
  ctx.beginPath();
  ctx.arc(x, y, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = speeds.delta <= threshold ? "#2f6b4a" : "#c94b3a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, 58, Math.PI, Math.PI * 2);
  ctx.stroke();
  needle(x, y, speeds.front, "#c94b3a");
  needle(x, y, speeds.rear, "#2f6b4a");
}

function needle(x, y, speed, color) {
  const angle = Math.PI + Math.max(0, Math.min(1, speed / 100)) * Math.PI;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * 48, y + Math.sin(angle) * 48);
  ctx.stroke();
}

function drawBariyer(run) {
  drawRails(400);
  ctx.fillStyle = "#6d6458";
  ctx.fillRect(430, 360, 150, 70);
  const next = run.spec.order[run.stepIndex];
  drawArm(470, 390, run.stepIndex < 1, next === "approach");
  drawArm(520, 390, run.stepIndex >= 2, next === "platform");
  drawArm(560, 390, run.stepIndex >= 3, next === "exit");
  const x = run.arriving > 0 ? run.x : 180;
  drawWagon(x, 388);
  if (run.spec.timer) {
    ctx.fillStyle = "#f6efe2";
    ctx.fillRect(80, 70, 180, 16);
    ctx.fillStyle = "#e7a322";
    ctx.fillRect(82, 72, 176 * Math.max(0, run.clock) / run.spec.timer, 12);
  }
}

function drawArm(x, y, raised, next) {
  ctx.save();
  ctx.translate(x, y);
  if (next) {
    ctx.strokeStyle = "rgba(231,163,34,0.8)";
    ctx.strokeRect(-16, -46, 32, 70);
  }
  ctx.rotate(raised ? -1.1 : 0);
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(-6, -8, 12, 54);
  ctx.fillStyle = "#c94b3a";
  ctx.fillRect(-6, 8, 12, 10);
  ctx.fillRect(-6, 28, 12, 10);
  ctx.restore();
}

function drawStation(x, y) {
  ctx.fillStyle = "#6e3b32";
  ctx.fillRect(x, y, 150, 120);
  ctx.fillStyle = "#4e2a24";
  ctx.beginPath();
  ctx.moveTo(x - 10, y);
  ctx.lineTo(x + 75, y - 36);
  ctx.lineTo(x + 160, y);
  ctx.fill();
  ctx.fillStyle = state.run.spec.atmosphere === "night" || state.run.spec.atmosphere === "dusk" ? "#f6d98a" : "#d7ecf8";
  for (const windowX of [x + 18, x + 58, x + 98]) ctx.fillRect(windowX, y + 28, 22, 28);
}

function drawLever(x, y, pulled) {
  ctx.fillStyle = "#4d3b2c";
  ctx.fillRect(x, y, 10, 70);
  ctx.save();
  ctx.translate(x + 5, y);
  ctx.rotate(pulled ? 0.8 : -0.8);
  ctx.fillStyle = "#e7a322";
  ctx.fillRect(-4, 0, 8, 46);
  ctx.beginPath();
  ctx.arc(0, 48, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLantern(x, y) {
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(x, y, 8, 48);
  ctx.fillStyle = "rgba(246, 217, 138, 0.9)";
  ctx.beginPath();
  ctx.arc(x + 4, y - 8, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawRain() {
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 53 + state.anim * 180) % 980;
    const y = (i * 37 + state.anim * 260) % 420;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + 14);
    ctx.stroke();
  }
}

function puffAt(puff) {
  ctx.globalAlpha = Math.max(0, puff.life);
  ctx.fillStyle = "#f7f7f7";
  ctx.beginPath();
  ctx.arc(puff.x, puff.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function togglePause() {
  if (state.screen !== "play" || state.resolved) return;
  state.paused = !state.paused;
  pauseEl.hidden = !state.paused;
  if (state.paused) document.querySelector("#resume").focus();
}

homeBtn.addEventListener("click", renderHome);
muteBtn.addEventListener("click", () => {
  state.muted = !state.muted;
  try { localStorage.setItem(MUTE_KEY, state.muted ? "1" : "0"); } catch { /* oturum içi */ }
  paintChrome();
});
document.querySelector("#resume").addEventListener("click", togglePause);
canvas.addEventListener("pointerdown", () => {
  if (!state.run || state.paused || state.resolved) return;
  if (state.run.route === "makas") doAction({ type: "throw" });
  if (state.run.route === "kanca") doAction({ type: "hook" });
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    togglePause();
    return;
  }
  if (state.screen !== "play" || !state.run) return;
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    openLevel(state.run.route, state.run.n);
    return;
  }
  if (state.paused || state.resolved) return;
  const tag = document.activeElement?.tagName;
  if (event.key === " " && tag === "BUTTON") return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (state.run.route !== "fren" || state.run.phase !== "aim") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 0.008 : -0.008;
    act(state.run, { type: "brake", value: Math.max(0, Math.min(1, state.run.brake + delta)) });
    const slider = document.querySelector("#brake");
    if (slider) slider.value = String(Math.round(state.run.brake * 1000));
    updateReadout();
    return;
  }
  if (event.key !== " ") return;
  event.preventDefault();
  const run = state.run;
  if (run.route === "makas") doAction({ type: "throw" });
  else if (run.route === "fren") doAction({ type: "release" });
  else if (run.route === "kurek") doAction({ type: "confirm" });
  else if (run.route === "kanca") doAction({ type: "hook" });
  else doAction({ type: "gate", gate: run.spec.order[run.stepIndex] });
});
window.addEventListener("resize", () => {
  if (state.screen === "play") fitCanvas();
});

renderHome();
requestAnimationFrame(frame);
