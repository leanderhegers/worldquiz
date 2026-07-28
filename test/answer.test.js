// Tests for the shared answer handling that the country, lake, river and city quizzes all use.
// This logic used to be copy-pasted into four click handlers, tangled up with DOM work, and so
// was not testable at all — a scoring bug could only be found by playing.
const { test } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./helpers/load-app.js');

/**
 * Fresh game state per test, with the 1100 ms "next question" timer captured rather than run.
 * `game` is mutated in place because app.js holds a reference to that same object.
 */
function setup(overrides = {}) {
  const app = loadApp(['resolveAnswer', 'canAnswer', 'game']);
  const timers = [];
  app.sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  app.sandbox.clearTimeout = () => {};

  for (const k of Object.keys(app.game)) delete app.game[k];
  Object.assign(app.game, {
    current: 10, found: new Set(), skippedItems: new Set(),
    correct: 0, wrong: 0, firstTry: 0, skipped: 0, wrongOnCurrent: false, queue: [], total: 1
  }, overrides);

  const calls = { flash: 0, repaint: 0 };
  const answer = extra => app.resolveAnswer({
    key: 10, correct: true, name: 'Testland', flashKey: 10,
    flash: () => calls.flash++, repaint: () => calls.repaint++,
    ...extra
  });
  return { ...app, timers, calls, answer };
}

test('a correct answer scores, remembers the find and queues the next question', () => {
  const { game, calls, timers, answer } = setup();
  answer({ correct: true });

  assert.strictEqual(game.correct, 1);
  assert.strictEqual(game.wrong, 0);
  assert.strictEqual(game.firstTry, 1, 'a first-time correct answer counts towards firstTry');
  assert.ok(game.found.has(10), 'the answered item should be remembered as found');
  assert.strictEqual(calls.repaint, 1, 'colours must be refreshed so the item turns green');
  // 2000 ms also appears: showFeedback() auto-hides its message. Only the advance matters here.
  assert.ok(timers.some(t => t.ms === 1100), 'the next question should be queued');
});

test('a wrong answer scores against you and does not advance', () => {
  const { game, calls, timers, answer } = setup();
  answer({ correct: false });

  assert.strictEqual(game.wrong, 1);
  assert.strictEqual(game.correct, 0);
  assert.ok(game.wrongOnCurrent, 'the current target must be marked as already missed');
  assert.strictEqual(game.found.size, 0, 'a wrong answer must not count as found');
  assert.strictEqual(calls.flash, 1, 'the wrong pick should be painted red');
  assert.ok(timers.some(t => t.ms === 1000), 'the red flash should be scheduled to clear after 1s');
  assert.ok(!timers.some(t => t.ms === 1100),
    'the quiz must not advance to the next question on a wrong answer');
});

test('getting it right after a mistake scores, but not as a first try', () => {
  const { game, answer } = setup();
  answer({ correct: false });
  answer({ correct: true });

  assert.strictEqual(game.correct, 1);
  assert.strictEqual(game.wrong, 1);
  assert.strictEqual(game.firstTry, 0, 'firstTry is reserved for answers with no prior mistake');
});

test('the red flash survives the pointer moving away, then clears itself', () => {
  // Regression guard: the flash used to be reset by the mouseout handler, cutting it short.
  // getColor() consults wrongFlashIds, so the key has to stay in the set for the full second.
  const app = loadApp(['resolveAnswer', 'wrongFlashIds', 'game']);
  const timers = [];
  app.sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  app.sandbox.clearTimeout = () => {};
  Object.assign(app.game, { current: 1, found: new Set(), skippedItems: new Set(), correct: 0, wrong: 0, firstTry: 0 });

  app.resolveAnswer({ key: 42, correct: false, name: 'X', flashKey: 42, flash() {}, repaint() {} });
  assert.ok(app.wrongFlashIds.has(42), 'wrongFlashIds must contain the key while the flash is showing');

  timers.find(t => t.ms === 1000).fn();          // fast-forward the flash timer
  assert.ok(!app.wrongFlashIds.has(42), 'the key must be removed once the flash ends');
});

test('two wrong picks flash independently — the second must not cut the first short', () => {
  // Regression guard: wrongFlashId/wrongFlash used to be a single value and a single shared
  // timer, so picking a second wrong item reset the first one back to its normal colour early.
  const app = loadApp(['resolveAnswer', 'wrongFlashIds', 'game']);
  const timers = [];
  let nextId = 1;
  app.sandbox.setTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms }); return id; };
  app.sandbox.clearTimeout = id => { const t = timers.find(t => t.id === id); if (t) t.cancelled = true; };
  Object.assign(app.game, { current: 1, found: new Set(), skippedItems: new Set(), correct: 0, wrong: 0, firstTry: 0 });

  app.resolveAnswer({ key: 1, correct: false, name: 'A', flashKey: 1, flash() {}, repaint() {} });
  app.resolveAnswer({ key: 2, correct: false, name: 'B', flashKey: 2, flash() {}, repaint() {} });
  assert.ok(app.wrongFlashIds.has(1) && app.wrongFlashIds.has(2), 'both keys should be flashing');

  // Each resolveAnswer() call runs fully synchronously, so its 1s flash timer is scheduled before
  // the next call's — the two 1000ms timers appear in the same order as the two keys.
  const flashTimers = timers.filter(t => t.ms === 1000);
  assert.strictEqual(flashTimers.length, 2, 'each key should have gotten its own flash timer');
  const [timerFor1, timerFor2] = flashTimers;

  timerFor2.fn();
  assert.ok(!app.wrongFlashIds.has(2), 'key 2 clears once its own timer fires');
  assert.ok(app.wrongFlashIds.has(1), 'key 1 must still be flashing — the second click must not have cancelled it');

  timerFor1.fn();
  assert.ok(!app.wrongFlashIds.has(1), 'key 1 clears once its own timer fires');
});

test('canAnswer() blocks clicks that should do nothing', () => {
  const { canAnswer, game } = setup();
  assert.ok(canAnswer(10), 'an open target is answerable');

  game.found.add(10);
  assert.ok(!canAnswer(10), 'an already-found item must not be answerable again');

  game.found.delete(10);
  game.skippedItems.add(10);
  assert.ok(!canAnswer(10), 'a skipped item must not be answerable');
});

test('canAnswer() blocks clicks when no round is running', () => {
  const { canAnswer, game } = setup();
  game.current = null;
  assert.ok(!canAnswer(10), 'without a current target there is nothing to answer');
});

test('the country quiz can leave finds unmarked when "stay green" is off', () => {
  // keepFound=false means a solved country goes back to neutral, so it must stay clickable —
  // remembering it as found would lock it out for the rest of the round.
  const { game, answer } = setup();
  answer({ correct: true, keepOnFound: false });

  assert.strictEqual(game.correct, 1, 'the answer still scores');
  assert.strictEqual(game.found.size, 0, 'but it must not be recorded as found');
});
