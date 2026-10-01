import assert from "node:assert/strict";
import {
  MAX_STARS,
  ROUTES,
  act,
  continueTarget,
  createRun,
  emptyProgress,
  isUnlocked,
  kancaSpeeds,
  kurekVerdict,
  levelSpec,
  recordClear,
  settle,
  starsFor,
  step,
  stopDistance,
  totalStars,
} from "../src/sim.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok  ${name}`);
}

function solveMakas(spec) {
  const run = createRun("makas", spec.n);
  const ideal1 = (spec.zoneMin + spec.zoneMax) / 2;
  const ideal2 = (spec.zone2Min + spec.zone2Max) / 2;
  let threw2 = false;
  for (let i = 0; i < 8000 && run.phase === "play"; i += 1) {
    if (run.throws === 0 && run.x >= ideal1) act(run, { type: "throw" });
    if (spec.second && run.throws === 1 && !threw2 && run.x >= ideal2) {
      act(run, { type: "throw" });
      threw2 = true;
    }
    step(run, 1 / 120);
  }
  return run;
}

function solveKanca(spec) {
  let bestT = 0;
  let best = Infinity;
  for (let i = 0; i < 1600; i += 1) {
    const time = i / 100;
    const { delta, front } = kancaSpeeds(spec, time);
    if (front <= 0) break;
    if (delta < best) {
      best = delta;
      bestT = time;
    }
  }
  const run = createRun("kanca", spec.n);
  while (run.t < bestT && run.phase === "play") step(run, 1 / 120);
  act(run, { type: "hook" });
  settle(run);
  return run;
}

function solveBariyer(spec) {
  const run = createRun("bariyer", spec.n);
  for (const gate of spec.order) {
    act(run, { type: "gate", gate });
    if (run.phase === "lost") return run;
    step(run, 0.35);
  }
  settle(run);
  return run;
}

test("beş rota ve 50 bölüm", () => {
  assert.equal(ROUTES.length, 5);
  assert.equal(MAX_STARS, 150);
  for (const route of ROUTES) {
    const names = new Set();
    for (let n = 1; n <= 10; n += 1) {
      const spec = levelSpec(route.id, n);
      assert.equal(spec.n, n);
      assert.equal(spec.route, route.id);
      names.add(spec.name);
    }
    assert.equal(names.size, 10);
  }
});

test("makas 10 bölüm çözülür, erken ve geç başarısız", () => {
  for (let n = 1; n <= 10; n += 1) {
    const spec = levelSpec("makas", n);
    const won = solveMakas(spec);
    assert.equal(won.phase, "won", `${spec.name} çözülmedi: ${won.fail}`);
    assert.ok(won.stars >= 2, `${spec.name} yıldız ${won.stars}`);

    const early = createRun("makas", n);
    act(early, { type: "throw" });
    assert.equal(early.phase, "lost");

    const late = createRun("makas", n);
    while (late.phase === "play" && late.x < spec.zoneMax + 2) step(late, 1 / 240);
    if (late.phase === "play") act(late, { type: "throw" });
    assert.equal(late.phase, "lost", spec.name);
  }
});

test("fren ideali üç yıldız, uçlar şeridin dışında", () => {
  for (let n = 1; n <= 10; n += 1) {
    const spec = levelSpec("fren", n);
    const idealTravel = stopDistance(spec, spec.ideal);
    assert.ok(Math.abs(idealTravel - spec.target) < 1.5, `${spec.name} hedef kaydı`);
    if (spec.twoStep) assert.ok(spec.target > spec.stepAt, `${spec.name} eğimi görmüyor`);
    assert.ok(spec.target > 120 && spec.target < 760, `${spec.name} mesafe ${spec.target.toFixed(0)}`);

    const run = createRun("fren", n);
    act(run, { type: "brake", value: spec.ideal });
    act(run, { type: "release" });
    settle(run);
    assert.equal(run.phase, "won", `${spec.name}: ${run.fail}`);
    assert.equal(run.stars, 3, spec.name);

    for (const brake of [0, 1]) {
      const miss = createRun("fren", n);
      act(miss, { type: "brake", value: brake });
      act(miss, { type: "release" });
      settle(miss);
      assert.equal(miss.phase, "lost", `${spec.name} fren ${brake} kazanmamalı`);
    }

    const nudged = Math.abs(stopDistance(spec, spec.ideal + 0.008) - spec.target);
    assert.ok(nudged < spec.tol, `${spec.name} fren çok sert: 0.008 kol ${nudged.toFixed(1)} birim`);
  }
});

test("kürek tam kilo kazanır, uzak kilo kaybeder", () => {
  for (let n = 1; n <= 10; n += 1) {
    const spec = levelSpec("kurek", n);
    const counts = { wood: 0, coal: 0, stone: 0 };
    let left = spec.target;
    if (spec.allow.includes("stone")) {
      counts.stone = Math.floor(left / 3);
      left -= counts.stone * 3;
    }
    if (spec.allow.includes("coal")) {
      counts.coal = Math.floor(left / 2);
      left -= counts.coal * 2;
    }
    counts.wood = left;
    const good = kurekVerdict(spec, counts);
    assert.equal(good.ok, true, spec.name);
    assert.equal(good.stars, 3);

    const run = createRun("kurek", n);
    for (const [material, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i += 1) act(run, { type: "scoop", material });
    }
    act(run, { type: "confirm" });
    settle(run);
    assert.equal(run.phase, "won", spec.name);
    assert.equal(run.stars, 3);

    const heavy = kurekVerdict(spec, { ...counts, wood: counts.wood + 4 });
    assert.equal(heavy.ok, false);

    if (n === 1) assert.deepEqual(spec.allow, ["wood"]);
    if (n >= 3) assert.ok(spec.allow.includes("stone"));
  }
});

test("kanca penceresi her bölümde bir kez yakalanır", () => {
  for (let n = 1; n <= 10; n += 1) {
    const spec = levelSpec("kanca", n);
    const won = solveKanca(spec);
    assert.equal(won.phase, "won", `${spec.name}: ${won.fail} ${won.note}`);
    assert.ok(won.stars >= 1, spec.name);
    if (n === 1) assert.ok(spec.threshold <= 7 && spec.windAmp > 0);

    const early = createRun("kanca", n);
    act(early, { type: "hook" });
    assert.equal(early.phase, "lost");
  }
});

test("bariyer sırası kazanır, yanlış kapak ve geri tepme kaybeder", () => {
  for (let n = 1; n <= 10; n += 1) {
    const spec = levelSpec("bariyer", n);
    const won = solveBariyer(spec);
    assert.equal(won.phase, "won", `${spec.name}: ${won.fail}`);
    assert.equal(won.stars, 3, `${spec.name} yıldız ${won.stars}`);
    if (n >= 3) assert.ok(spec.timer >= 5 && spec.timer <= 11);
    if (n >= 2) assert.ok(spec.spring > 0);
    if (n === 1) assert.notEqual(spec.order[0], "exit");
  }
  const orders = new Set();
  for (let n = 1; n <= 10; n += 1) orders.add(levelSpec("bariyer", n).order.join("-"));
  assert.ok(orders.size >= 6);

  const wrong = createRun("bariyer", 1);
  act(wrong, { type: "gate", gate: "exit" });
  assert.equal(wrong.phase, "lost");

  const spring = createRun("bariyer", 5);
  act(spring, { type: "gate", gate: spring.spec.order[0] });
  step(spring, spring.spec.spring + 0.2);
  assert.equal(spring.phase, "lost");

  const slow = createRun("bariyer", 10);
  act(slow, { type: "gate", gate: slow.spec.order[0] });
  act(slow, { type: "gate", gate: slow.spec.order[1] });
  step(slow, slow.spec.timer + 0.05);
  assert.equal(slow.phase, "lost");
  assert.equal(slow.fail, "Süre bitti");
});

test("ilerleme, kilit ve yıldızlar", () => {
  let progress = emptyProgress();
  assert.equal(isUnlocked(progress, "fren", 1), true);
  assert.equal(isUnlocked(progress, "fren", 2), false);
  progress = recordClear(progress, "fren", 1, 2);
  progress = recordClear(progress, "fren", 1, 1);
  assert.equal(starsFor(progress, "fren", 1), 2);
  assert.equal(isUnlocked(progress, "fren", 2), true);
  assert.equal(totalStars(progress), 2);
  assert.deepEqual(continueTarget(progress), { route: "makas", level: 1 });
  for (const route of ROUTES) {
    for (let n = 1; n <= 10; n += 1) progress = recordClear(progress, route.id, n, 3);
  }
  assert.equal(totalStars(progress), 150);
  assert.deepEqual(continueTarget(progress), { route: "makas", level: 1 });
});

console.log(`\n${passed} test tamam`);
