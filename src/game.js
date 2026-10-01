import {
  MAX_STARS,
  ROUTES,
  act,
  branchY,
  continueTarget,
  createRun,
  emptyProgress,
  isUnlocked,
  levelSpec,
  loadWeight,
  previewStop,
  recordClear,
  routeById,
  starsFor,
  step,
  tablaLock,
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
  dawn: ["#f0b27a", "#f8e6cf", "#7f9a62", "#c9b08a", "#f3d7b0", "#9bb57a"],
  noon: ["#7eb6e8", "#d9eefc", "#6ea15a", "#e4d2ae", "#c5e4f8", "#8fba72"],
  rain: ["#667684", "#c5d0d4", "#5c6b59", "#9a917f", "#aeb8bc", "#738470"],
  dusk: ["#3d3a6e", "#e7a06a", "#3d4c3c", "#a56b49", "#c98462", "#5d6e52"],
  night: ["#141824", "#2a3548", "#1b2922", "#3c362e", "#243044", "#2a4034"],
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
      <p class="lede">İstasyonda bu gece tek kişi sensin. Her bölümde bir vagon ve bir karar var: kol, fren, yük, tabla ya da kapak.</p>
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
  } else if (run.route === "tabla") {
    controlsEl.innerHTML = `
      <button type="button" data-turn="-8">8° sola</button>
      <button type="button" data-turn="-1">1° sola</button>
      <button type="button" data-turn="1">1° sağa</button>
      <button type="button" data-turn="8">8° sağa</button>
      <button id="act" class="go" type="button">Vagonu gönder</button>
    `;
    for (const button of controlsEl.querySelectorAll("[data-turn]")) {
      button.addEventListener("click", () => doAction({ type: "turn", delta: Number(button.dataset.turn) }));
    }
    controlsEl.querySelector("#act").addEventListener("click", () => doAction({ type: "send" }));
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
  if (action.type === "throw" || action.type === "send" || action.type === "release" || action.type === "gate") {
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
  } else if (run.route === "tabla") {
    const lock = tablaLock(run.spec, run.angle);
    const deg = Math.round(run.angle);
    const dir = deg === 0 ? "0°" : deg < 0 ? `${Math.abs(deg)}° sol` : `${deg}° sağ`;
    const plate = run.spec.decoy == null ? "" : `Plaka ${run.spec.plate} · `;
    if (lock.seated) {
      const mark = "ABCDEFGH"[run.spec.stalls.indexOf(lock.stall)];
      text = `${plate}${dir} · ${mark} kemeri`;
    } else {
      text = `${plate}${dir}`;
    }
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
    tabla: "Doğru kemer",
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
  const gradient = ctx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, sky[0]);
  gradient.addColorStop(0.55, sky[1]);
  gradient.addColorStop(1, sky[4] || sky[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 540);
  drawCelestial(run.spec.atmosphere);
  drawClouds(run.spec.atmosphere);
  drawHills(sky[2], sky[5] || sky[2]);
  ctx.fillStyle = grassPattern();
  ctx.fillRect(0, 300, 960, 240);
  ctx.fillStyle = "rgba(40, 32, 22, 0.18)";
  ctx.fillRect(0, 455, 960, 85);
  if (run.route === "makas") drawMakas(run);
  else if (run.route === "fren") drawFren(run);
  else if (run.route === "kurek") drawKurek(run);
  else if (run.route === "tabla") drawTabla(run);
  else drawBariyer(run);
  if (run.spec.atmosphere === "rain" && !reduced) drawRain();
  if (run.route !== "tabla") {
    drawLantern(86, 392);
    drawLantern(860, 392);
  }
  const shade = ctx.createRadialGradient(480, 260, 180, 480, 270, 620);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(8, 10, 14, 0.38)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 960, 540);
}

const textures = {};

function pattern(key, width, height, paint) {
  if (!textures[key]) {
    const sheet = document.createElement("canvas");
    sheet.width = width;
    sheet.height = height;
    paint(sheet.getContext("2d"), width, height);
    textures[key] = ctx.createPattern(sheet, "repeat");
  }
  return textures[key];
}

function grassPattern() {
  return pattern("grass", 80, 80, (g, w, h) => {
    g.fillStyle = "#6f8b4e";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i += 1) {
      const x = (i * 29) % w;
      const y = (i * 17) % h;
      g.strokeStyle = i % 3 === 0 ? "#8eaa68" : "#56723d";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y + 3);
      g.lineTo(x + 1, y - 2);
      g.stroke();
    }
  });
}

function gravelPattern() {
  return pattern("gravel", 64, 48, (g, w, h) => {
    g.fillStyle = "#6a5d50";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = ["#857666", "#4e453c", "#a89480", "#3a332c"][i % 4];
      g.fillRect((i * 19) % w, (i * 11) % h, i % 5 === 0 ? 3 : 2, 2);
    }
  });
}

function drawCelestial(atmosphere) {
  const night = atmosphere === "night" || atmosphere === "dusk";
  const x = night ? 760 : 800;
  const y = night ? 74 : 86;
  const radius = night ? 22 : 30;
  const glow = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius * 3.2);
  glow.addColorStop(0, night ? "rgba(255, 236, 196, 0.55)" : "rgba(255, 244, 210, 0.7)");
  glow.addColorStop(1, "rgba(255, 244, 210, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 3.2, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, radius);
  body.addColorStop(0, "#fffaf0");
  body.addColorStop(1, night ? "#f0d7a2" : "#ffe38a");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  if (atmosphere === "night") {
    for (let i = 0; i < 28; i += 1) {
      const sx = (i * 97) % 900 + 16;
      const sy = (i * 53) % 160 + 16;
      ctx.globalAlpha = reduced ? 0.7 : 0.35 + Math.sin(state.anim * 1.4 + i) * 0.25;
      ctx.fillStyle = "#f7f1e4";
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
}

function drawClouds(atmosphere) {
  if (atmosphere === "night") return;
  ctx.fillStyle = atmosphere === "rain" ? "rgba(230,236,240,0.35)" : "rgba(255,255,255,0.55)";
  const drift = reduced ? 0 : state.anim * 8;
  for (const cloud of [[140, 78, 70], [420, 56, 90], [690, 96, 60]]) {
    const x = (cloud[0] + drift) % 1040 - 40;
    ctx.beginPath();
    ctx.ellipse(x, cloud[1], cloud[2], 16, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 28, cloud[1] + 4, cloud[2] * 0.7, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHills(near, far) {
  const back = ctx.createLinearGradient(0, 180, 0, 340);
  back.addColorStop(0, far);
  back.addColorStop(1, near);
  ctx.fillStyle = back;
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.quadraticCurveTo(160, 150, 340, 230);
  ctx.quadraticCurveTo(520, 120, 760, 220);
  ctx.quadraticCurveTo(880, 170, 960, 240);
  ctx.lineTo(960, 360);
  ctx.lineTo(0, 360);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(0, 250);
  ctx.quadraticCurveTo(160, 150, 340, 230);
  ctx.quadraticCurveTo(300, 210, 180, 250);
  ctx.fill();
  const front = ctx.createLinearGradient(0, 220, 0, 430);
  front.addColorStop(0, near);
  front.addColorStop(1, "#3f5a34");
  ctx.fillStyle = front;
  ctx.beginPath();
  ctx.moveTo(0, 320);
  ctx.quadraticCurveTo(200, 250, 380, 310);
  ctx.quadraticCurveTo(560, 230, 780, 318);
  ctx.quadraticCurveTo(880, 280, 960, 330);
  ctx.lineTo(960, 460);
  ctx.lineTo(0, 460);
  ctx.fill();
}

function drawRails(y, from = 16, to = 944) {
  const points = railPoints(from, to, () => y);
  fillBed(points, 24);
  drawRailPair(points);
}

function railPoints(from, to, yAt) {
  const points = [];
  for (let x = from; x <= to; x += 10) points.push({ x, y: yAt(x) });
  return points;
}

function fillBed(points) {
  if (points.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y - 14);
  for (const point of points) ctx.lineTo(point.x, point.y - 14);
  for (let i = points.length - 1; i >= 0; i -= 1) ctx.lineTo(points[i].x, points[i].y + 22);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = gravelPattern();
  ctx.fillRect(0, 0, 960, 540);
  ctx.restore();
}

function strokeAlong(points, offset, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => {
    const command = index === 0 ? "moveTo" : "lineTo";
    ctx[command](point.x, point.y + offset);
  });
  ctx.stroke();
}

function drawRailPair(points) {
  for (let i = 0; i < points.length; i += 2) {
    const point = points[i];
    ctx.fillStyle = "#5a3b24";
    ctx.fillRect(point.x - 2, point.y - 11, 16, 22);
    ctx.fillStyle = "#8b6240";
    ctx.fillRect(point.x - 2, point.y - 11, 16, 3);
    ctx.fillStyle = "#3d2918";
    ctx.fillRect(point.x - 2, point.y + 8, 16, 3);
  }
  for (const offset of [-8, 8]) {
    strokeAlong(points, offset + 2, "rgba(0,0,0,0.35)", 5);
    strokeAlong(points, offset, "#9aa3a8", 3.5);
    strokeAlong(points, offset - 1.4, "#e7eef2", 1.2);
  }
}

function drawWagon(x, y, ghost = false, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = ghost ? 0.4 : 1;
  ctx.fillStyle = "rgba(20, 16, 12, 0.28)";
  ctx.beginPath();
  ctx.ellipse(2, 22, 42, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const boiler = ctx.createLinearGradient(0, -28, 0, 8);
  boiler.addColorStop(0, "#6e767c");
  boiler.addColorStop(0.45, "#d5dbdf");
  boiler.addColorStop(1, "#4d555b");
  roundRect(ctx, -40, -22, 58, 26, 12);
  ctx.fillStyle = boiler;
  ctx.fill();
  ctx.strokeStyle = "#2e3438";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(-28, -16);
  ctx.lineTo(10, -16);
  ctx.stroke();
  const cab = ctx.createLinearGradient(8, -52, 40, -8);
  cab.addColorStop(0, "#8d3a32");
  cab.addColorStop(0.5, "#c45a4c");
  cab.addColorStop(1, "#6c2c26");
  roundRect(ctx, 8, -48, 30, 32, 4);
  ctx.fillStyle = cab;
  ctx.fill();
  ctx.fillStyle = "#4a221e";
  ctx.beginPath();
  ctx.moveTo(6, -46);
  ctx.lineTo(23, -62);
  ctx.lineTo(40, -46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1c242c";
  ctx.fillRect(14, -40, 18, 14);
  ctx.fillStyle = "rgba(186, 220, 236, 0.85)";
  ctx.fillRect(16, -38, 14, 10);
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(-46, -28, 8, 10);
  const lamp = ctx.createRadialGradient(-44, -32, 1, -44, -32, 8);
  lamp.addColorStop(0, "#fff6d0");
  lamp.addColorStop(1, "rgba(255, 214, 120, 0)");
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(-44, -32, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  for (const wheel of [-20, 12]) {
    ctx.save();
    ctx.translate(wheel, 8);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c8c2b8";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    ctx.rotate(state.wheel);
    ctx.strokeStyle = "#8d8680";
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#d9d3cb";
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = "#2a2118";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, 2);
  ctx.lineTo(12, 2);
  ctx.stroke();
  ctx.restore();
}

function drawMakas(run) {
  const main = railPoints(20, 940, () => 386);
  const branchFrom = run.spec.switchX;
  const branch = railPoints(branchFrom, 930, (x) => branchY(run.spec, x));
  fillBed(main);
  fillBed(branch);
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
  fillBed(points);
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
  const railY = 356;
  const gapL = 280;
  const gapR = 640;
  const weight = loadWeight(run.spec, run.counts);
  const seated = Math.abs(weight - run.spec.target) <= run.spec.tol;
  const crossing = run.phase === "won" || (run.phase === "play" && seated);

  ctx.fillStyle = "#10161c";
  ctx.beginPath();
  ctx.moveTo(gapL - 8, railY + 28);
  ctx.lineTo(gapR + 8, railY + 28);
  ctx.lineTo(gapR + 36, 530);
  ctx.lineTo(gapL - 36, 530);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3a4652";
  ctx.beginPath();
  ctx.moveTo(gapL - 8, railY + 28);
  ctx.lineTo(gapL + 48, railY + 110);
  ctx.lineTo(gapL + 18, 530);
  ctx.lineTo(gapL - 36, 530);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(gapR + 8, railY + 28);
  ctx.lineTo(gapR - 48, railY + 110);
  ctx.lineTo(gapR - 18, 530);
  ctx.lineTo(gapR + 36, 530);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#24303a";
  for (let y = railY + 120; y < 510; y += 26) {
    ctx.fillRect(gapL + 70, y, gapR - gapL - 140, 3);
  }
  ctx.fillStyle = "#1a2830";
  ctx.fillRect(gapL + 80, 470, gapR - gapL - 160, 60);

  drawAbutment(gapL, railY);
  drawAbutment(gapR, railY);
  drawStation(790, railY - 118);
  if (seated) drawBridgeSpan(gapL, gapR, railY);
  if (seated) drawRails(railY, 16, 944);
  else {
    drawRails(railY, 16, gapL);
    drawRails(railY, gapR, 944);
  }

  const falling = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.8);
  let wagonX = 150;
  let wagonY = railY - 6;
  let tilt = 0;
  if (crossing) wagonX = 150 + Math.min(1, run.t / 2.6) * 620;
  else if (run.phase === "play") wagonX = 150 + Math.min(1, run.t / 1.15) * (gapL - 170);
  if (falling) {
    wagonX = gapL + 10 + u * 80;
    wagonY = railY - 6 + u * 140;
    tilt = u * 1.05;
  }
  drawWagon(wagonX, wagonY, false, tilt);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "16px Segoe UI";
  ctx.fillText(`${weight} kg`, 28, railY - 36);
}

function drawAbutment(x, railY) {
  const stone = ctx.createLinearGradient(x - 22, railY, x + 22, railY + 80);
  stone.addColorStop(0, "#8d867c");
  stone.addColorStop(1, "#4e4944");
  ctx.fillStyle = stone;
  ctx.fillRect(x - 22, railY - 6, 44, 92);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(x - 22, railY - 6, 44, 7);
  for (let row = 0; row < 5; row += 1) {
    ctx.fillStyle = "rgba(20,16,12,0.28)";
    ctx.fillRect(x - 22, railY + 10 + row * 15, 44, 2);
  }
}

function drawBridgeSpan(from, to, railY) {
  const deck = railY + 16;
  const top = railY - 78;
  const bays = 6;
  ctx.strokeStyle = "#1e262c";
  ctx.lineWidth = 8;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(from, top);
  ctx.lineTo(to, top);
  ctx.moveTo(from, deck);
  ctx.lineTo(to, deck);
  ctx.stroke();
  ctx.strokeStyle = "#8d98a0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(from, top + 3);
  ctx.lineTo(to, top + 3);
  ctx.stroke();
  for (let i = 0; i <= bays; i += 1) {
    const x = from + ((to - from) * i) / bays;
    ctx.strokeStyle = "#2c363e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, deck);
    ctx.stroke();
    if (i < bays) {
      const next = from + ((to - from) * (i + 1)) / bays;
      ctx.strokeStyle = "#3e4a52";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, deck);
      ctx.lineTo(next, top);
      ctx.moveTo(x, top);
      ctx.lineTo(next, deck);
      ctx.stroke();
    }
  }
}

function drawTabla(run) {
  const spec = run.spec;
  const door = (angle) => {
    const t = Math.max(-1, Math.min(1, angle / 78));
    const crowd = Math.min(96, 640 / spec.stalls.length);
    return {
      x: 480 + t * 300,
      y: 162 + Math.abs(t) * 26,
      w: crowd * (1 - Math.abs(t) * 0.16),
    };
  };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(156, 312);
  ctx.lineTo(176, 150);
  ctx.quadraticCurveTo(480, 86, 784, 150);
  ctx.lineTo(804, 312);
  ctx.closePath();
  const wall = ctx.createLinearGradient(180, 90, 780, 300);
  wall.addColorStop(0, "#684036");
  wall.addColorStop(0.48, "#8d5848");
  wall.addColorStop(1, "#4a2e28");
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.clip();
  for (let y = 96; y < 316; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? "rgba(255,255,255,0.05)" : "rgba(28,12,8,0.22)";
    ctx.fillRect(140, y, 700, 2);
  }
  ctx.restore();
  ctx.strokeStyle = "#2e1c18";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(176, 150);
  ctx.quadraticCurveTo(480, 86, 784, 150);
  ctx.stroke();
  ctx.fillStyle = "#3a2420";
  ctx.fillRect(392, 108, 176, 22);
  ctx.fillStyle = "#f0d7a2";
  ctx.font = "13px Segoe UI";
  ctx.textAlign = "center";
  ctx.fillText("LOKOMOTİF EVİ", 480, 124);
  ctx.textAlign = "left";

  const order = [...spec.stalls].sort((a, b) => Math.abs(b) - Math.abs(a));
  for (const stall of order) drawTablaDoor(door(stall), stall, spec);

  const lock = tablaLock(spec, run.angle);
  const end = door(run.angle);
  const mouthY = end.y + end.w * 0.92;
  const aim = run.angle * Math.PI / 180;

  ctx.fillStyle = "#10161c";
  ctx.beginPath();
  ctx.ellipse(480, 412, 172, 48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a3988c";
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = "#6a6158";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(480, 412, 156, 36, 0, 0, Math.PI * 2);
  ctx.stroke();

  const bx = Math.sin(aim) * 130;
  const by = Math.cos(aim) * 46;
  ctx.strokeStyle = "#241e1a";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(480 - bx, 412 + by);
  ctx.lineTo(480 + bx, 412 - by);
  ctx.stroke();
  ctx.strokeStyle = "#d7e0e6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480 - bx, 406 + by);
  ctx.lineTo(480 + bx, 406 - by);
  ctx.stroke();
  ctx.fillStyle = "#e0b15a";
  ctx.beginPath();
  ctx.arc(480, 412, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#8e99a0";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(468, 452);
  ctx.lineTo(468, 528);
  ctx.moveTo(492, 452);
  ctx.lineTo(492, 528);
  ctx.stroke();
  ctx.strokeStyle = "#e7eef2";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(470, 452);
  ctx.lineTo(470, 528);
  ctx.moveTo(490, 452);
  ctx.lineTo(490, 528);
  ctx.stroke();

  ctx.strokeStyle = lock.seated ? "#f4efe4" : "rgba(226, 232, 236, 0.7)";
  ctx.lineWidth = lock.seated ? 8 : 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(480, 408);
  ctx.lineTo(end.x, mouthY);
  ctx.stroke();
  ctx.strokeStyle = "#d5dee4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(480, 408);
  ctx.lineTo(end.x, mouthY);
  ctx.stroke();

  ctx.fillStyle = "#241c16";
  ctx.fillRect(628, 392, 78, 36);
  ctx.strokeStyle = "#e7c27a";
  ctx.lineWidth = 2;
  ctx.strokeRect(628, 392, 78, 36);
  ctx.fillStyle = "#e7c27a";
  ctx.font = "22px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(run.angle)}°`, 667, 417);
  ctx.textAlign = "left";

  const travel = run.phase === "aim" ? 0 : Math.min(1, run.phase === "won" ? 1 : run.t / 0.9);
  const lost = run.phase === "lost";
  const u = Math.min(1, state.failT / 0.8);
  let along = 0.58 + travel * 0.28;
  let sink = 0;
  let tilt = 0;
  if (lost && run.doom === "cukur") {
    along = 0.42;
    sink = u * 48;
    tilt = u * 0.8;
  } else if (lost) {
    along = 0.92;
    tilt = u * 0.35;
  }
  const lx = 480 + (end.x - 480) * along;
  const ly = 404 + (mouthY - 404) * along + sink;
  const face = end.x > 500 ? -1 : 1;
  ctx.save();
  ctx.translate(lx, ly);
  ctx.scale(face * 0.82, 0.82);
  ctx.rotate(tilt);
  drawWagon(0, 0);
  ctx.restore();
  if (sink > 8) {
    ctx.fillStyle = "#10161c";
    ctx.beginPath();
    ctx.ellipse(480, 436, 150, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#241c16";
  ctx.fillRect(28, 338, 118, 78);
  ctx.strokeStyle = "#e7c27a";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 338, 118, 78);
  ctx.fillStyle = "#e7c27a";
  ctx.font = "12px Segoe UI";
  ctx.textAlign = "left";
  ctx.fillText("VAGON PLAKASI", 40, 358);
  ctx.font = "36px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(spec.plate, 87, 398);
  ctx.textAlign = "left";
}

function drawTablaDoor(door, stall, spec) {
  const mouth = door.w * 1.02;
  const archY = door.y + mouth * 0.4;
  ctx.fillStyle = "#12100e";
  ctx.beginPath();
  ctx.moveTo(door.x - door.w / 2, door.y + mouth);
  ctx.lineTo(door.x - door.w / 2, archY);
  ctx.arc(door.x, archY, door.w / 2, Math.PI, 0);
  ctx.lineTo(door.x + door.w / 2, door.y + mouth);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#e6d2b4";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "#9aa6ae";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(door.x - 6, door.y + mouth - 2);
  ctx.lineTo(door.x - 6, archY + 4);
  ctx.moveTo(door.x + 6, door.y + mouth - 2);
  ctx.lineTo(door.x + 6, archY + 4);
  ctx.stroke();

  const mark = "ABCDEFGH"[spec.stalls.indexOf(stall)];
  const lying = spec.decoy != null;
  const glowTarget = !lying && stall === spec.target;
  const glowDecoy = lying && stall === spec.decoy;
  const lampY = door.y - 4;
  if (glowTarget || glowDecoy) {
    const glow = ctx.createRadialGradient(door.x, lampY, 2, door.x, lampY, 24);
    glow.addColorStop(0, glowDecoy ? "rgba(255, 196, 90, 0.95)" : "rgba(140, 230, 160, 0.95)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(door.x, lampY, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = glowTarget ? "#d9f5d0" : glowDecoy ? "#ffe0a8" : "#1b1612";
  ctx.fillRect(door.x - 11, lampY - 11, 22, 18);
  ctx.fillStyle = glowTarget || glowDecoy ? "#241910" : "#f4e6c4";
  ctx.font = "14px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(mark, door.x, lampY + 3);
  ctx.textAlign = "left";
}

function drawBariyer(run) {
  const main = railPoints(20, 940, () => 400);
  fillBed(main);
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
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(x + 75, y + 124, 70, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8d9094";
  ctx.fillRect(x + 8, y + 96, 134, 18);
  const wall = ctx.createLinearGradient(x, y, x + 150, y);
  wall.addColorStop(0, "#6a4034");
  wall.addColorStop(0.5, "#8d5644");
  wall.addColorStop(1, "#5a342c");
  ctx.fillStyle = wall;
  ctx.fillRect(x + 12, y + 28, 126, 72);
  for (let board = 0; board < 8; board += 1) {
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(x + 18 + board * 15, y + 28, 1, 72);
  }
  const roof = ctx.createLinearGradient(x, y - 30, x, y + 8);
  roof.addColorStop(0, "#6a3228");
  roof.addColorStop(1, "#3d1d18");
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(x - 4, y + 32);
  ctx.lineTo(x + 75, y - 8);
  ctx.lineTo(x + 154, y + 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a2118";
  ctx.fillRect(x + 108, y - 28, 10, 28);
  const night = state.run.spec.atmosphere === "night" || state.run.spec.atmosphere === "dusk";
  for (const windowX of [x + 26, x + 58]) {
    ctx.fillStyle = "#2c241c";
    ctx.fillRect(windowX - 2, y + 42, 24, 30);
    ctx.fillStyle = night ? "#f3d48a" : "#c5dfef";
    ctx.fillRect(windowX, y + 44, 20, 26);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(windowX + 10, y + 44);
    ctx.lineTo(windowX + 10, y + 70);
    ctx.moveTo(windowX, y + 57);
    ctx.lineTo(windowX + 20, y + 57);
    ctx.stroke();
  }
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(x + 96, y + 52, 22, 48);
  ctx.fillStyle = "#e7c27a";
  ctx.beginPath();
  ctx.arc(x + 112, y + 76, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLever(x, y, pulled) {
  ctx.fillStyle = "#3a2c22";
  ctx.fillRect(x, y + 8, 12, 78);
  ctx.fillStyle = "#6a5644";
  ctx.fillRect(x - 6, y + 78, 24, 8);
  ctx.save();
  ctx.translate(x + 6, y + 10);
  ctx.rotate(pulled ? 0.9 : -0.9);
  const grip = ctx.createLinearGradient(0, 0, 0, 48);
  grip.addColorStop(0, "#f0c14a");
  grip.addColorStop(1, "#a86b12");
  ctx.fillStyle = grip;
  ctx.fillRect(-4, 0, 8, 46);
  ctx.beginPath();
  ctx.arc(0, 50, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLantern(x, y) {
  ctx.fillStyle = "#241910";
  ctx.fillRect(x + 2, y, 6, 46);
  const glow = ctx.createRadialGradient(x + 5, y - 6, 2, x + 5, y - 6, 28);
  glow.addColorStop(0, "rgba(255, 214, 120, 0.85)");
  glow.addColorStop(1, "rgba(255, 214, 120, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x + 5, y - 6, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6e2a8";
  ctx.beginPath();
  ctx.arc(x + 5, y - 8, 7, 0, Math.PI * 2);
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
    if (state.run.route === "tabla" && state.run.phase === "aim") {
      event.preventDefault();
      const stepDeg = event.shiftKey ? 8 : 1;
      doAction({ type: "turn", delta: event.key === "ArrowRight" ? stepDeg : -stepDeg });
      return;
    }
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
  else if (run.route === "tabla") doAction({ type: "send" });
  else if (run.n === 1) doAction({ type: "gate", gate: run.spec.order[run.stepIndex] });
});
window.addEventListener("resize", () => {
  if (state.screen === "play") fitCanvas();
});

renderHome();
requestAnimationFrame(frame);
