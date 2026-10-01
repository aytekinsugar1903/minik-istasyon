/** Minik İstasyon — bölüm kuralları. Çizim ve girdi bu dosyaya girmez. */

export const ROUTES = [
  { id: "makas", name: "Makas", verb: "Kolunu doğru anda çevir", color: "#e0a100" },
  { id: "fren", name: "Fren", verb: "Vagonu şeritte durdur", color: "#d4533a" },
  { id: "kurek", name: "Kürek", verb: "Köprüyü kaldıracak yükü koy", color: "#2f6f4e" },
  { id: "kanca", name: "Kanca", verb: "Hızlar denk gelince bırak", color: "#3d6f99" },
  { id: "bariyer", name: "Bariyer", verb: "Kapakları sırayla yönet", color: "#8a5a9a" },
];

export const MAX_STARS = 150;

const MAKAS_NAMES = ["İlk makas", "Sabah seferi", "İkinci hat", "Çatal", "İniş", "Çift kol", "Hızlanan ray", "Çisenti", "Kaygan makas", "Gece seferi"];
const FREN_NAMES = ["Yumuşak duruş", "Peron şeridi", "Biraz daha hız", "İki eğim", "Dik rampa", "Kısa şerit", "Ağır vagon", "Islak ray", "Yağmur", "Son fren"];
const KUREK_NAMES = ["Dört kürek", "Kömür de", "Taş seçimi", "Daha ağır", "Dar kefe", "Köprü inat eder", "Tam kilo", "Hassas yük", "Son kürek", "Terazi ustası"];
const KANCA_NAMES = ["Yavaş yaklaşma", "Denk hız", "Yakın kanca", "Tümsek", "Hızlanan arka", "Dar fark", "Kısa pencere", "Rüzgar", "Esinti", "Gece kancası"];
const BARIYER_NAMES = ["Üç kapak", "Sırayı öğren", "Sakin geçit", "Geri tepen kapak", "Daha çabuk", "Saat başladı", "Dar zaman", "İki baskı", "Son dakikalar", "Gece geçidi"];

const BARIYER_TIMERS = { 3: 11, 4: 9.5, 5: 8.5, 6: 7.5, 7: 6.8, 8: 6.2, 9: 5.8, 10: 5.4 };
const BARIYER_ORDERS = [
  ["approach", "platform", "exit"],
  ["platform", "exit", "approach"],
  ["exit", "approach", "platform"],
  ["approach", "exit", "platform"],
  ["platform", "approach", "exit"],
  ["exit", "platform", "approach"],
  ["approach", "platform", "exit"],
  ["exit", "approach", "platform"],
  ["platform", "exit", "approach"],
  ["approach", "exit", "platform"],
];

export function atmosphere(level) {
  if (level <= 2) return "dawn";
  if (level <= 4) return "noon";
  if (level <= 6) return "rain";
  if (level <= 8) return "dusk";
  return "night";
}

export function routeById(id) {
  return ROUTES.find((route) => route.id === id) ?? ROUTES[0];
}

export function levelSpec(route, n) {
  const level = Math.max(1, Math.min(10, n));
  const t = (level - 1) / 9;
  const shared = {
    route,
    n: level,
    atmosphere: atmosphere(level),
    coach: level === 1,
  };
  if (route === "makas") return makasSpec(shared, level, t);
  if (route === "fren") return frenSpec(shared, level, t);
  if (route === "kurek") return kurekSpec(shared, level, t);
  if (route === "kanca") return kancaSpec(shared, level, t);
  return bariyerSpec(shared, level, t);
}

function makasSpec(shared, level, t) {
  const speed = 108 + t * 52;
  const windowSec = 1.1 - t * 0.82;
  const center = 430;
  const half = (speed * windowSec) / 2;
  const second = level >= 4;
  const center2 = 690;
  const half2 = half * (level >= 8 ? 0.82 : 0.94);
  return {
    ...shared,
    name: MAKAS_NAMES[level - 1],
    blurb: second
      ? "İki kol var. Vagon altın şeritteyken çevir."
      : "Vagon altın şeride girince kolu çevir.",
    hint: "Erken ve geç çevirmek vagonu yanlış hatta bırakır.",
    speed,
    startX: 36,
    zoneMin: center - half,
    zoneMax: center + half,
    switchX: center,
    second,
    zone2Min: center2 - half2,
    zone2Max: center2 + half2,
    switch2X: center2,
    gradeAt: 545,
    grade: second ? 1.16 : 1,
    rain: level >= 8,
    platformX: second ? 880 : 780,
  };
}

function frenSpec(shared, level, t) {
  const spec = {
    ...shared,
    name: FREN_NAMES[level - 1],
    blurb: level === 1
      ? "İlk seferde hayalet vagon duracağı yeri gösterir."
      : "Hayalet yok. Şeridi gözünle tut, freni bırak.",
    hint: level === 1
      ? "Ok tuşları freni ince ayarlar. Bırakınca vagon kendi gider."
      : "Sonraki seferlerde duruş kendiliğinden hesaplanır, önizleme görünmez.",
    speed: 188 + t * 28,
    slope: 8 + (level >= 4 ? 7 : 0),
    twoStep: level >= 4,
    stepAt: 250,
    stepExtra: level >= 4 ? 6 + (level - 4) * 1.4 : 0,
    wet: level >= 8,
    tol: 48 - t * 36,
    startX: 78,
    k0: 58,
    k1: 74,
  };
  spec.ideal = Math.round((0.36 + t * 0.26) * 1000) / 1000;
  spec.target = stopDistance(spec, spec.ideal);
  return spec;
}

function kurekSpec(shared, level, t) {
  const allow = level === 1 ? ["wood"] : level === 2 ? ["wood", "coal"] : ["wood", "coal", "stone"];
  const target = Math.round(4 + t * 18);
  const tol = Math.round((1.4 - t * 0.8) * 10) / 10;
  return {
    ...shared,
    name: KUREK_NAMES[level - 1],
    blurb: "Ahşap 1 kg, kömür 2 kg, taş 3 kg. Köprü boşluğa oturunca vagon karşıya geçer.",
    hint: "Boşluk, kurulacak köprü kadar geniştir. Ağırlık tutmazsa geçiş olmaz.",
    target,
    tol,
    allow,
    maxScoops: 16,
    weights: { wood: 1, coal: 2, stone: 3 },
  };
}

function kancaSpec(shared, level, t) {
  return {
    ...shared,
    name: KANCA_NAMES[level - 1],
    blurb: "İbreler bir an üst üste gelir. O anda bırak. Pencere ilk bölümden dardır.",
    hint: "Sayı yok. Rüzgar ve tümsek ilk seferden vardır.",
    frontV: 118,
    decel: 22 + t * 14,
    rearV: 34,
    bump: 10 + t * 14,
    bumpAt: 0.45,
    windAmp: 0.45 + t * 0.9,
    windFreq: 3.1,
    threshold: 6.2 - t * 4,
  };
}

function bariyerSpec(shared, level) {
  const spring = level >= 2 ? Math.round((2.6 - (level - 2) * 0.16) * 100) / 100 : 0;
  const board = level === 1 ? 99 : level < 4 ? 4.5 : level < 7 ? 2.4 : 1.15;
  return {
    ...shared,
    name: BARIYER_NAMES[level - 1],
    blurb: level === 1
      ? "Tabela sırayı gösterir. Yan hat tuzaktır. Sonraki bölümlerde tabela kapanır."
      : "Sıra değişti. Tabela kısa süre kalır, yanlış kapak vagonu durdurur.",
    hint: "Parlak sıra yalnız ilk bölümde vardır.",
    order: BARIYER_ORDERS[level - 1],
    labels: { approach: "Yaklaşım", platform: "Peron", exit: "Çıkış", siding: "Yan hat" },
    buttons: ["siding", "exit", "approach", "platform"],
    spring,
    timer: BARIYER_TIMERS[level] ?? 0,
    board,
    arrive: 1.15,
  };
}

export function createRun(route, n) {
  const spec = levelSpec(route, n);
  const run = {
    route,
    n: spec.n,
    spec,
    phase: route === "fren" || route === "kurek" ? "aim" : "play",
    t: 0,
    stars: 0,
    fail: "",
    note: "",
    x: spec.startX ?? 36,
    v: 0,
    throws: 0,
    errs: [],
    brake: 0.45,
    counts: { wood: 0, coal: 0, stone: 0 },
    stepIndex: 0,
    moves: 0,
    springLeft: 0,
    clock: spec.timer ?? 0,
    clockOn: false,
    arriving: 0,
    coupled: false,
    doom: "",
  };
  if (route === "fren") run.brake = 0.2;
  return run;
}

export function step(run, dt) {
  if (!run || run.phase !== "play") return run;
  let left = Math.min(Math.max(dt, 0), 30);
  while (left > 1e-8 && run.phase === "play") {
    const h = Math.min(left, 1 / 120);
    stepOnce(run, h);
    left -= h;
  }
  return run;
}

function stepOnce(run, dt) {
  run.t += dt;
  if (run.route === "makas") stepMakas(run, dt);
  else if (run.route === "fren") stepFren(run, dt);
  else if (run.route === "kurek") stepKurek(run, dt);
  else if (run.route === "kanca") stepKanca(run, dt);
  else stepBariyer(run, dt);
}

export function act(run, action) {
  if (!run || (run.phase !== "play" && run.phase !== "aim")) return run;
  if (action.type === "throw") throwSwitch(run);
  else if (action.type === "brake") run.brake = clamp(action.value, 0, 1);
  else if (action.type === "release") releaseBrake(run);
  else if (action.type === "scoop") addScoop(run, action.material);
  else if (action.type === "undo") undoScoop(run);
  else if (action.type === "confirm") confirmLoad(run);
  else if (action.type === "hook") dropHook(run);
  else if (action.type === "gate") pressGate(run, action.gate);
  return run;
}

export function settle(run, maxSeconds = 24) {
  let t = 0;
  while (run && (run.phase === "play" || run.phase === "resolving") && t < maxSeconds) {
    step(run, 1 / 60);
    t += 1 / 60;
  }
  return run;
}

function stepMakas(run, dt) {
  const spec = run.spec;
  const speed = makasSpeed(spec, run.t, run.x);
  run.x += speed * dt;
  run.v = speed;
  if (run.throws < 1 && run.x > spec.zoneMax + 10) {
    run.doom = "tampon";
    finish(run, false, "Geç kaldın", "Vagon düz gidip tampona sıkıştı.");
    return;
  }
  if (spec.second && run.throws === 1 && run.x > spec.zone2Max + 10) {
    run.doom = "tampon";
    finish(run, false, "İkinci kol geç kaldı", "Vagon çatalı kaçırıp tampona yapıştı.");
    return;
  }
  const needed = spec.second ? 2 : 1;
  if (run.throws >= needed && run.x >= spec.platformX) {
    const err = Math.max(...run.errs);
    const stars = err <= 0.28 ? 3 : err <= 0.62 ? 2 : 1;
    finish(run, true, "", timingNote(err), stars);
  }
  if (run.t > 18) {
    run.doom = "cukur";
    finish(run, false, "Vagon varamadı", "Vagon raydan çıkıp hendeğe düştü.");
  }
}

function throwSwitch(run) {
  if (run.route !== "makas" || run.phase !== "play") return;
  const spec = run.spec;
  const needed = spec.second ? 2 : 1;
  if (run.throws >= needed) return;
  const zone = run.throws === 0
    ? [spec.zoneMin, spec.zoneMax]
    : [spec.zone2Min, spec.zone2Max];
  if (run.x < zone[0]) {
    run.doom = "cukur";
    finish(run, false, "Erken çevirdin", "Makas erken açıldı. Vagon hendeğe düştü.");
    return;
  }
  if (run.x > zone[1]) {
    run.doom = "tampon";
    finish(run, false, "Geç çevirdin", "Vagon makası geçip tampona sıkıştı.");
    return;
  }
  run.throws += 1;
  run.errs.push(zoneError(run.x, zone[0], zone[1]));
}

function stepFren(run, dt) {
  tickFren(run, run.spec, dt);
  if (run.v <= 0.4 || run.t > 14) {
    const travel = run.x - run.spec.startX;
    const err = Math.abs(travel - run.spec.target);
    if (run.v > 0.4) {
      run.doom = "ucurum";
      finish(run, false, "Durmadı", "Vagon freni yenip uçuruma düştü.");
      return;
    }
    if (err <= run.spec.tol) {
      const stars = err <= run.spec.tol * 0.33 ? 3 : err <= run.spec.tol * 0.66 ? 2 : 1;
      const dir = travel > run.spec.target ? "şeridin ilerisinde" : "şeridin gerisinde";
      finish(run, true, "", `${Math.abs(travel - run.spec.target).toFixed(0)} birim ${dir}.`, stars);
    } else if (travel > run.spec.target) {
      run.doom = "ucurum";
      finish(run, false, "Peronu geçti", "Vagon şeridi aşıp uçuruma düştü.");
    } else {
      run.doom = "camur";
      finish(run, false, "Kısa kaldı", "Tekerler çukura gömüldü, vagon sıkıştı.");
    }
  }
}

function releaseBrake(run) {
  if (run.route !== "fren" || run.phase !== "aim") return;
  run.phase = "play";
  run.t = 0;
  run.x = run.spec.startX;
  run.v = run.spec.speed;
}

function stepKurek(run) {
  if (run.t > 0.85) {
    const verdict = kurekVerdict(run.spec, run.counts);
    if (!verdict.ok) run.doom = "ucurum";
    const note = verdict.ok ? verdict.note : "Köprü oturmadı. Vagon boşluğa düştü.";
    finish(run, verdict.ok, verdict.fail, note, verdict.stars);
  }
}

function addScoop(run, material) {
  if (run.route !== "kurek" || run.phase !== "aim") return;
  if (!run.spec.allow.includes(material)) return;
  const total = run.counts.wood + run.counts.coal + run.counts.stone;
  if (total >= run.spec.maxScoops) return;
  run.counts[material] += 1;
  run.history = run.history ?? [];
  run.history.push(material);
}

function undoScoop(run) {
  if (run.route !== "kurek" || run.phase !== "aim") return;
  const last = run.history?.pop();
  if (!last) return;
  run.counts[last] -= 1;
}

function confirmLoad(run) {
  if (run.route !== "kurek" || run.phase !== "aim") return;
  run.phase = "play";
  run.t = 0;
}

function stepKanca(run, dt) {
  if (run.coupled) {
    if (run.t - run.coupledAt > 0.45) finish(run, true, "", run.note, run.stars);
    return;
  }
  if (run.t > 16) {
    run.doom = "sikis";
    finish(run, false, "Kaçtı", "Kanca kaçtı. Vagonlar birbirine sıkıştı.");
  }
  void dt;
}

function dropHook(run) {
  if (run.route !== "kanca" || run.phase !== "play" || run.coupled) return;
  const { delta } = kancaSpeeds(run.spec, run.t);
  if (delta <= run.spec.threshold) {
    const ratio = delta / run.spec.threshold;
    run.stars = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    run.note = `Hız farkı ${delta.toFixed(1)}.`;
    run.coupled = true;
    run.coupledAt = run.t;
    return;
  }
  run.doom = "sikis";
  finish(run, false, "Hızlar ayrı", "Kanca oturmadı. Vagonlar tampon tampona sıkıştı.");
}

function stepBariyer(run, dt) {
  const spec = run.spec;
  if (run.clockOn) {
    run.clock -= dt;
    if (spec.timer > 0 && run.clock <= 0 && run.arriving <= 0) {
      run.doom = "bariyer";
      finish(run, false, "Süre bitti", "Vagon inik kapağın altında sıkıştı.");
      return;
    }
  }
  if (run.stepIndex === 1 && spec.spring > 0) {
    run.springLeft -= dt;
    if (run.springLeft <= 0) {
      run.doom = "bariyer";
      finish(run, false, "Kapak geri açıldı", "Kapak indi. Vagon kolun altında kaldı.");
      return;
    }
  }
  if (run.arriving > 0) {
    run.arriving -= dt;
    run.x += 150 * dt;
    if (run.arriving <= 0) {
      const stars = bariyerStars(run);
      finish(run, true, "", run.moves === spec.order.length ? "Tek hamlede geçti." : `${run.moves} kapak hareketi.`, stars);
    }
  }
}

function pressGate(run, gate) {
  if (run.route !== "bariyer" || run.phase !== "play" || run.arriving > 0) return;
  const spec = run.spec;
  const expected = spec.order[run.stepIndex];
  run.moves += 1;
  if (gate !== expected) {
    run.doom = "bariyer";
    finish(run, false, "Sıra şaştı", "Yanlış kapak indi. Vagon kola sıkıştı.");
    return;
  }
  run.stepIndex += 1;
  if (!run.clockOn && spec.timer > 0) {
    run.clockOn = true;
    run.clock = spec.timer;
  }
  if (run.stepIndex === 1 && spec.spring > 0) run.springLeft = spec.spring;
  if (run.stepIndex >= spec.order.length) {
    run.arriving = spec.arrive;
    run.x = 80;
  }
}

export function makasSpeed(spec, time, x) {
  let scale = 1;
  if (spec.rain) scale *= 1 + 0.16 * Math.sin(time * 2.3);
  if (spec.grade !== 1 && x > spec.gradeAt) scale *= spec.grade;
  return spec.speed * scale;
}

export function branchY(spec, x) {
  if (x <= spec.switchX) return 386;
  const length = spec.second ? 520 : 340;
  const u = Math.min(1, (x - spec.switchX) / length);
  const rise = u < 0.18 ? Math.sin((u / 0.18) * Math.PI / 2) : 1;
  const settle = u > 0.78 ? Math.cos(((u - 0.78) / 0.22) * Math.PI / 2) : 1;
  return 386 - rise * Math.max(0, settle) * 62;
}

export function trackY(run) {
  if (run.route !== "makas") return 386;
  if (run.throws < 1) return 386;
  return branchY(run.spec, run.x);
}

function accelOf(spec, brake, x) {
  const wet = spec.wet ? 0.82 : 1;
  const slope = spec.twoStep && x - spec.startX > spec.stepAt ? spec.slope + spec.stepExtra : spec.slope;
  return (spec.k0 + brake * spec.k1) * wet - slope;
}

function tickFren(state, spec, dt) {
  const a = accelOf(spec, state.brake, state.x);
  state.a = a;
  if (a <= 0) {
    state.v += 40 * dt;
    state.x += state.v * dt;
    return;
  }
  state.v = Math.max(0, state.v - a * dt);
  if (state.v > 0) state.x += state.v * dt;
}

export function stopDistance(spec, brake) {
  const state = { brake, x: spec.startX, v: spec.speed, a: 0 };
  for (let i = 0; i < 20000; i += 1) {
    if (state.v <= 0.4) break;
    if (state.a <= 0 && i > 30) return 5000;
    tickFren(state, spec, 1 / 120);
  }
  return state.x - spec.startX;
}

export function previewStop(spec, brake) {
  return spec.startX + stopDistance(spec, brake);
}

export function loadWeight(spec, counts) {
  return counts.wood * spec.weights.wood + counts.coal * spec.weights.coal + counts.stone * spec.weights.stone;
}

export function kurekVerdict(spec, counts) {
  const weight = loadWeight(spec, counts);
  const err = Math.abs(weight - spec.target);
  if (err > spec.tol + 1e-6) {
    return {
      ok: false,
      stars: 0,
      fail: weight > spec.target ? "Fazla yük" : "Eksik yük",
      note: `${weight} kg, hedef ${spec.target} kg.`,
    };
  }
  const stars = err === 0 ? 3 : err <= spec.tol * 0.67 ? 2 : 1;
  return { ok: true, stars, fail: "", note: `${weight} kg.` };
}

export function kancaSpeeds(spec, time) {
  const front = spec.frontV - spec.decel * time;
  let rear = spec.rearV;
  if (spec.bump && time >= spec.bumpAt) rear += spec.bump;
  if (spec.windAmp) rear += spec.windAmp * Math.sin(time * spec.windFreq);
  return { front, rear, delta: Math.abs(front - rear) };
}

function bariyerStars(run) {
  if (run.moves > run.spec.order.length) return 1;
  if (!run.spec.timer) return 3;
  const spent = run.spec.timer - Math.max(0, run.clock);
  const ratio = spent / run.spec.timer;
  if (ratio <= 0.45) return 3;
  if (ratio <= 0.75) return 2;
  return 1;
}

function zoneError(x, min, max) {
  const ideal = (min + max) / 2;
  const half = Math.max(1, (max - min) / 2);
  return clamp(Math.abs(x - ideal) / half, 0, 1);
}

function timingNote(err) {
  if (err <= 0.28) return "Altın şeridin ortasındaydın.";
  if (err <= 0.62) return "Şeridin içinde, biraz kenarda.";
  return "Şeridin kıyısından geçtin.";
}

function finish(run, ok, fail, note, stars = 0) {
  if (run.phase === "won" || run.phase === "lost") return;
  run.phase = ok ? "won" : "lost";
  run.fail = fail;
  run.note = note;
  run.stars = ok ? stars : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function emptyProgress() {
  return { v: 1, stars: {}, cleared: {} };
}

export function isUnlocked(progress, route, level) {
  if (level <= 1) return true;
  return Boolean(progress?.cleared?.[`${route}-${level - 1}`]);
}

export function recordClear(progress, route, level, stars) {
  const next = {
    v: 1,
    stars: { ...(progress?.stars ?? {}) },
    cleared: { ...(progress?.cleared ?? {}) },
  };
  const key = `${route}-${level}`;
  next.stars[key] = Math.max(next.stars[key] ?? 0, stars);
  if (stars > 0) next.cleared[key] = true;
  return next;
}

export function totalStars(progress) {
  return Object.values(progress?.stars ?? {}).reduce((sum, value) => sum + value, 0);
}

export function starsFor(progress, route, level) {
  return progress?.stars?.[`${route}-${level}`] ?? 0;
}

export function continueTarget(progress) {
  for (const route of ROUTES) {
    for (let level = 1; level <= 10; level += 1) {
      if (!isUnlocked(progress, route.id, level)) break;
      if ((progress?.stars?.[`${route.id}-${level}`] ?? 0) <= 0) {
        return { route: route.id, level };
      }
    }
  }
  return { route: "makas", level: 1 };
}
