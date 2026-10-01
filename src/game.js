import {
  MAX_STARS,
  ROUTES,
  act,
  branchY,
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
  failT: 0,
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
  state.failT = 0;
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
    const shift = (spec.n - 1) % spec.buttons.length;
    const buttons = spec.buttons.slice(shift).concat(spec.buttons.slice(0, shift));
    controlsEl.innerHTML = buttons.map((gate) => `
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
    button.classList.toggle("next-gate", run.n === 1 && button.dataset.gate === expected && run.phase === "play");
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
    if (run.n === 1) {
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
    } else {
      text = "Hayalet kapalı. Freni bırak, vagon kendisi durur.";
    }
  } else if (run.route === "kurek") {
    const weight = loadWeight(run.spec, run.counts);
    const err = Math.abs(weight - run.spec.target);
    const goal = run.spec.tol < 1 ? `tam ${run.spec.target} kg` : `${run.spec.target} kg ± ${run.spec.tol.toFixed(1)}`;
    text = `${weight} kg · hedef ${goal}`;
    toneClass = err <= run.spec.tol ? "good" : "";
  } else if (run.route === "kanca") {
    const speeds = kancaSpeeds(run.spec, run.t);
    text = speeds.delta <= run.spec.threshold ? "Şimdi" : "İbreleri izle";
    toneClass = speeds.delta <= run.spec.threshold ? "good" : "";
  } else {
    const spec = run.spec;
    const clock = spec.timer ? `Süre ${Math.max(0, run.clock).toFixed(1)} sn` : "Tabela sırayı tutar";
    const spring = run.stepIndex === 1 && spec.spring > 0 ? ` · kapak ${Math.max(0, run.springLeft).toFixed(1)} sn` : "";
    const next = run.n === 1 ? `${spec.labels[spec.order[run.stepIndex]] ?? "Vagon geçiyor"} · ` : "";
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
      if (state.run.phase === "lost") state.failT = Math.min(1.2, state.failT + dt);
      const ready = state.run.phase === "won" || state.failT > 0.7;
      if ((state.run.phase === "won" || state.run.phase === "lost") && ready && !state.resolved) onResolve();
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

function railPoints(from, to, yAt) {
  const points = [];
  for (let x = from; x <= to; x += 10) points.push({ x, y: yAt(x) });
  return points;
}

function fillBed(points, depth, color) {
  if (points.length < 2) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - 8);
  for (const point of points) ctx.lineTo(point.x, point.y - 8);
  for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i].x, points[i].y + depth);
  ctx.closePath();
  ctx.fill();
}

function drawRailPair(points) {
  ctx.strokeStyle = "#5c4634";
  ctx.lineWidth = 5;
  for (let i = 0; i < points.length - 1; i += 2) {
    ctx.beginPath();
    ctx.moveTo(points[i].x, points[i].y - 2);
    ctx.lineTo(points[i].x + 12, points[i].y + 14);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c5ccd1";
  ctx.lineWidth = 3;
  for (const offset of [-7, 7]) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const command = index === 0 ? "moveTo" : "lineTo";
      ctx[command](point.x, point.y + offset);
    });
    ctx.stroke();
  }
  ctx.strokeStyle = "#8d969c";
  ctx.lineWidth = 1;
  for (const offset of [-7, 7]) {
    ctx.beginPath();
    points.forEach((point, index) => {
      const command = index === 0 ? "moveTo" : "lineTo";
      ctx[command](point.x, point.y + offset - 1.5);
    });
    ctx.stroke();
  }
}

function drawWagon(x, y, ghost = false, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = ghost ? 0.38 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 20, 36, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, -36, -24, 54, 28, 6);
  ctx.fillStyle = "#efe4d2";
  ctx.fill();
  ctx.strokeStyle = "#b9a48a";
  ctx.stroke();
  roundRect(ctx, 8, -46, 28, 26, 5);
  ctx.fillStyle = "#a33b32";
  ctx.fill();
  ctx.fillStyle = "#6a2a24";
  ctx.beginPath();
  ctx.moveTo(6, -46);
  ctx.lineTo(22, -60);
  ctx.lineTo(38, -46);
  ctx.fill();
  ctx.fillStyle = "#f3d48a";
  ctx.fillRect(-24, -16, 12, 10);
  ctx.fillRect(-8, -16, 12, 10);
  ctx.fillStyle = "#d7dde2";
  ctx.fillRect(14, -40, 16, 12);
  ctx.fillStyle = "#2a2118";
  for (const wheel of [-18, 14]) {
    ctx.save();
    ctx.translate(wheel, 8);
    ctx.rotate(state.wheel);
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c9b89a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawMakas(run) {
  const main = railPoints(20, 940, () => 386);
  const branchFrom = run.spec.switchX;
  const branch = railPoints(branchFrom, 930, (x) => branchY(run.spec, x));
  fillBed(main, 26, "#6d5844");
  fillBed(branch, 34, "#5a4636");
  drawRailPair(main);
  drawRailPair(branch);
  const onBranch = run.throws > 0;
  const zone = run.throws === 0 || !run.spec.second
    ? [run.spec.zoneMin, run.spec.zoneMax, (x) => 386]
    : [run.spec.zone2Min, run.spec.zone2Max, (x) => branchY(run.spec, x)];
  ctx.fillStyle = "rgba(255, 186, 46, 0.78)";
  ctx.beginPath();
  ctx.moveTo(zone[0], zone[2](zone[0]) - 16);
  ctx.lineTo(zone[1], zone[2](zone[1]) - 16);
  ctx.lineTo(zone[1], zone[2](zone[1]) + 18);
  ctx.lineTo(zone[0], zone[2](zone[0]) + 18);
  ctx.fill();
  drawStation(760, 214);
  const lost = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.75);
  let wagonX = run.x;
  let wagonY = (onBranch ? branchY(run.spec, run.x) : 386) - 10;
  let tilt = 0;
  if (lost && run.doom === "cukur") {
    wagonY += u * 78;
    tilt = u * 0.7;
    ctx.fillStyle = "#1c242c";
    ctx.beginPath();
    ctx.ellipse(wagonX, 430, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (lost && run.doom === "tampon") {
    wagonX = Math.min(860, run.x + u * 80);
    ctx.fillStyle = "#8a3b32";
    ctx.fillRect(888, 352, 16, 48);
    ctx.fillStyle = "#d7dde2";
    ctx.fillRect(878, 360, 12, 8);
    ctx.fillRect(878, 384, 12, 8);
  }
  drawWagon(wagonX, wagonY, false, tilt);
  for (const puff of state.puffs) puffAt(puff);
  drawLever(70, 250, run.throws > 0);
  if (run.spec.second) drawLever(150, 210, run.throws > 1);
}

function drawFren(run) {
  const yAt = (x) => 292 + (x - 40) * 0.16;
  const points = railPoints(36, 930, yAt);
  ctx.fillStyle = "#5d4a38";
  ctx.beginPath();
  ctx.moveTo(20, yAt(20) + 8);
  points.forEach((point) => ctx.lineTo(point.x, point.y + 8));
  ctx.lineTo(940, 470);
  ctx.lineTo(20, 470);
  ctx.fill();
  fillBed(points, 22, "#6a5644");
  drawRailPair(points);
  const center = run.spec.startX + run.spec.target;
  ctx.fillStyle = "rgba(47, 107, 74, 0.42)";
  ctx.beginPath();
  const left = center - run.spec.tol;
  const right = center + run.spec.tol;
  ctx.moveTo(left, yAt(left) - 16);
  ctx.lineTo(right, yAt(right) - 16);
  ctx.lineTo(right, yAt(right) + 16);
  ctx.lineTo(left, yAt(left) + 16);
  ctx.fill();
  const slope = Math.atan(0.16);
  const lost = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.75);
  let wagonX = run.phase === "aim" ? run.spec.startX : run.x;
  let wagonY = yAt(wagonX) - 10;
  let tilt = slope;
  if (lost && run.doom === "camur") {
    wagonY += u * 22;
    ctx.fillStyle = "#3d3428";
    ctx.beginPath();
    ctx.ellipse(wagonX, wagonY + 16, 28, 10, slope, 0, Math.PI * 2);
    ctx.fill();
  }
  if (lost && run.doom === "ucurum") {
    ctx.fillStyle = "#1b242c";
    ctx.beginPath();
    ctx.moveTo(860, yAt(860));
    ctx.lineTo(940, yAt(860) + 20);
    ctx.lineTo(940, 520);
    ctx.lineTo(840, 520);
    ctx.fill();
    wagonX = Math.min(900, wagonX + u * 70);
    wagonY = yAt(Math.min(wagonX, 860)) - 10 + u * 90;
    tilt = slope + u * 0.8;
  }
  const travel = ghostTravel(run);
  if (run.n === 1 && run.phase === "aim" && travel < 4000) {
    const ghostX = Math.min(900, run.spec.startX + travel);
    drawWagon(ghostX, yAt(ghostX) - 10, true, slope);
  }
  drawWagon(wagonX, wagonY, false, tilt);
  drawStation(800, yAt(800) - 130);
}

function drawKurek(run) {
  const nearL = 120;
  const nearR = 360;
  const gapL = 360;
  const gapR = 600;
  const deckY = 338;
  const weight = loadWeight(run.spec, run.counts);
  const seated = Math.abs(weight - run.spec.target) <= run.spec.tol;
  const crossing = run.phase === "won" || (run.phase === "play" && seated);
  ctx.fillStyle = "#1b242c";
  ctx.beginPath();
  ctx.moveTo(gapL, deckY + 18);
  ctx.lineTo(gapR, deckY + 18);
  ctx.lineTo(gapR + 16, 520);
  ctx.lineTo(gapL - 16, 520);
  ctx.fill();
  ctx.fillStyle = "#31404a";
  for (let y = deckY + 48; y < 500; y += 16) ctx.fillRect(gapL + 10, y, gapR - gapL - 20, 2);
  ctx.fillStyle = "#6d5844";
  ctx.fillRect(36, deckY + 8, nearL - 36, 26);
  ctx.fillRect(gapR, deckY + 8, 900 - gapR, 26);
  ctx.fillStyle = "#8a735c";
  ctx.fillRect(nearL - 16, deckY - 6, 18, 64);
  ctx.fillRect(gapL - 8, deckY - 6, 16, 64);
  ctx.fillRect(gapR - 8, deckY - 6, 16, 64);
  drawBridgeDeck(nearL, nearR, deckY);
  if (seated || crossing) drawBridgeDeck(gapL, gapR, deckY);
  const progress = crossing ? Math.min(1, run.phase === "won" ? 1 : run.t / 0.85) : 0;
  const falling = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.8);
  let wagonX = nearL + 70 + progress * (gapR - nearL - 40);
  let wagonY = deckY - 10;
  let tilt = 0;
  if (falling) {
    wagonX = nearR - 20 + u * 80;
    wagonY = deckY - 10 + u * 110;
    tilt = u * 0.9;
  }
  drawWagon(wagonX, wagonY, false, tilt);
  drawStation(690, 196);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "16px Segoe UI";
  ctx.fillText(`${weight} kg`, 48, deckY - 18);
}

function drawBridgeDeck(from, to, y) {
  ctx.fillStyle = "#6a4b32";
  ctx.fillRect(from, y - 6, to - from, 14);
  ctx.strokeStyle = "#c5ccd1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(from, y - 2);
  ctx.lineTo(to, y - 2);
  ctx.moveTo(from, y + 4);
  ctx.lineTo(to, y + 4);
  ctx.stroke();
  ctx.strokeStyle = "#4d3828";
  ctx.lineWidth = 3;
  const span = to - from;
  const posts = Math.max(2, Math.round(span / 36));
  for (let i = 0; i <= posts; i += 1) {
    const x = from + (span * i) / posts;
    ctx.beginPath();
    ctx.moveTo(x, y + 8);
    ctx.lineTo(x, y + 28);
    if (i < posts) {
      const next = from + (span * (i + 1)) / posts;
      ctx.moveTo(x, y + 28);
      ctx.lineTo(next, y + 8);
    }
    ctx.stroke();
  }
}

function drawKanca(run) {
  drawRails(360, 80, 880);
  drawRails(430, 80, 880);
  const speeds = kancaSpeeds(run.spec, run.t);
  const jammed = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.75);
  const topY = jammed ? 348 + u * 28 : 348;
  const bottomY = jammed ? 418 - u * 28 : 418;
  drawWagon(250, topY, false, jammed ? u * 0.35 : 0);
  drawWagon(250, bottomY, false, jammed ? -u * 0.35 : 0);
  ctx.strokeStyle = run.coupled ? "#e7a322" : jammed ? "#8a3b32" : "#6d5844";
  ctx.lineWidth = jammed ? 7 : 4;
  ctx.beginPath();
  ctx.moveTo(250, topY + 24);
  ctx.quadraticCurveTo(250, (topY + bottomY) / 2, 250, bottomY - 16);
  ctx.stroke();
  if (jammed && u > 0.45) {
    ctx.fillStyle = "#2a2118";
    ctx.fillRect(236, (topY + bottomY) / 2 - 6, 28, 12);
  }
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
  const angle = Math.PI + Math.max(0, Math.min(1, speed / 150)) * Math.PI;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * 48, y + Math.sin(angle) * 48);
  ctx.stroke();
}

function drawBariyer(run) {
  const main = railPoints(20, 940, () => 400);
  fillBed(main, 24, "#6d5844");
  drawRailPair(main);
  ctx.fillStyle = "#6a5c50";
  ctx.fillRect(400, 348, 200, 52);
  const done = (gate) => run.spec.order.slice(0, run.stepIndex).includes(gate);
  const next = run.spec.order[run.stepIndex];
  const guide = run.n === 1;
  drawArm(430, 392, !done("approach"), guide && next === "approach");
  drawArm(500, 392, done("platform"), guide && next === "platform");
  drawArm(560, 392, done("exit"), guide && next === "exit");
  const x = run.arriving > 0 ? run.x : 160;
  const stuck = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.75);
  const wagonX = stuck ? 160 + u * 250 : x;
  drawWagon(wagonX, stuck ? 386 + u * 4 : 386);
  if (stuck) {
    ctx.save();
    ctx.translate(430, 348);
    ctx.rotate(0.15);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(-8, 0, 14, 70);
    ctx.fillStyle = "#c94b3a";
    ctx.fillRect(-8, 18, 14, 12);
    ctx.fillRect(-8, 40, 14, 12);
    ctx.restore();
  }
  const boardOn = run.t < run.spec.board;
  ctx.fillStyle = boardOn ? "#f6efe2" : "rgba(246,239,226,0.35)";
  ctx.fillRect(70, 78, 250, 54);
  ctx.fillStyle = boardOn ? "#241910" : "rgba(36,25,16,0.35)";
  ctx.font = "15px Segoe UI";
  const line = run.spec.order.map((gate) => run.spec.labels[gate]).join(" → ");
  ctx.fillText(boardOn ? line : "Tabela kapandı", 82, 110);
  if (run.spec.timer) {
    ctx.fillStyle = "#f6efe2";
    ctx.fillRect(70, 146, 180, 12);
    ctx.fillStyle = "#e7a322";
    ctx.fillRect(72, 148, 176 * Math.max(0, run.clock) / run.spec.timer, 8);
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
  else if (run.n === 1) doAction({ type: "gate", gate: run.spec.order[run.stepIndex] });
});
window.addEventListener("resize", () => {
  if (state.screen === "play") fitCanvas();
});

renderHome();
requestAnimationFrame(frame);
