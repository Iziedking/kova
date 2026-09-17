import test from "node:test";
import assert from "node:assert/strict";
import { describeCapability } from "../src/design/capability-view";
import { getCapabilities } from "../src/application/capabilities";

test("every capability the application reports has a described view", () => {
  for (const [name, value] of Object.entries(getCapabilities().capabilities)) {
    const view = describeCapability(value);
    assert.ok(view.label.trim().length > 0, `${name} (${value}) has no label`);
    assert.ok(["ok", "warn", "off"].includes(view.tone), `${name} has tone ${view.tone}`);
  }
});

test("an unavailable capability is described as unavailable, never as pending or coming soon", () => {
  const view = describeCapability("unavailable");
  assert.equal(view.tone, "off");
  assert.match(view.label, /unavailable/i);
  assert.doesNotMatch(view.label, /soon|pending|shortly/i);
});

test("preview and fixture states are never described as live or verified", () => {
  for (const value of ["preview_only", "fixture_backed", "captured_snapshot", "browser_seam_only"]) {
    const view = describeCapability(value);
    assert.doesNotMatch(view.label, /\blive\b|\bverified\b/i, `${value} overstates its state`);
  }
});

test("an unrecognised value degrades to unknown rather than claiming health", () => {
  const view = describeCapability("something_new_from_the_backend");
  assert.equal(view.tone, "warn");
  assert.match(view.label, /unknown/i);
});
