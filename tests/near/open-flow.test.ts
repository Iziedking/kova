import assert from "node:assert/strict";
import { test } from "node:test";
import { openAndRegister } from "../../src/features/near/grid/open-flow";

const instant = async () => undefined;

function run(over: Partial<Parameters<typeof openAndRegister>[0]> = {}) {
  const calls: string[] = [];
  const progress: string[] = [];
  const result = openAndRegister({
    open: async () => (calls.push("open"), { success: true, url: "open-tx" }),
    findMine: async () => (calls.push("find"), { mine: "nene.factory.near" }),
    register: async (mine) => (calls.push(`register ${mine}`), { ok: true, url: "register-tx" }),
    onProgress: (t) => progress.push(t),
    symbol: "NENE",
    wait: instant,
    ...over,
  });
  return { result, calls, progress };
}

test("a mine is opened first, then found, then registered, in that order", async () => {
  const { result, calls, progress } = run();
  assert.deepEqual(await result, { stage: "done", mine: "nene.factory.near", alreadyRegistered: false, url: "register-tx" });
  assert.deepEqual(calls, ["open", "find", "register nene.factory.near"]);
  assert.equal(progress.length, 3);
  assert.match(progress[0], /Step 1 of 2/);
  assert.match(progress[2], /Step 2 of 2: registering the mine with NENE/);
});

test("if opening fails, nothing is registered", async () => {
  const { result, calls } = run({ open: async () => ({ success: false, failure: "Attach at least 0.2 NEAR", url: "x" }) });
  assert.deepEqual(await result, { stage: "open_failed", message: "Attach at least 0.2 NEAR", url: "x" });
  assert.deepEqual(calls, [], "no mine lookup and no registration");
});

test("it waits for the mine to appear, and gives up with a clear stage if it never does", async () => {
  let looks = 0;
  const appears = run({ findMine: async () => (++looks < 4 ? null : { mine: "late.factory.near" }) });
  assert.equal((await appears.result).stage, "done");
  assert.equal(looks, 4, "kept looking until it appeared");

  let never = 0;
  const gone = run({ findMine: async () => (never += 1, null), attempts: 5 });
  assert.deepEqual(await gone.result, { stage: "mine_missing", url: "open-tx" });
  assert.equal(never, 5);
  assert.ok(!gone.calls.some((c) => c.startsWith("register")), "never registers a mine it could not find");
});

test("a lookup that throws counts as not found yet, not as a crash", async () => {
  let n = 0;
  const { result } = run({ findMine: async () => { if (++n < 3) throw new Error("rate limited"); return { mine: "m.factory.near" }; } });
  assert.equal((await result).stage, "done");
});

test("if registration fails the mine is still reported open, with what to do", async () => {
  const { result } = run({ register: async () => ({ ok: false, message: "This account has 0.0010 NEAR free", url: "reg-tx" }) });
  assert.deepEqual(await result, { stage: "registration_failed", mine: "nene.factory.near", message: "This account has 0.0010 NEAR free", url: "reg-tx" });
});

test("a coin that needs no registration finishes without paying for one", async () => {
  const { result } = run({ register: async () => ({ ok: true, already: true }) });
  assert.deepEqual(await result, { stage: "done", mine: "nene.factory.near", alreadyRegistered: true, url: "open-tx" });
});
