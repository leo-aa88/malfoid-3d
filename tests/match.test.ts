// Logic tests for a campaign match (best of three rounds): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATCH, Match } from '../src/game/match';

/** plays the rounds (true: Malfoid wins it) until the match is decided; the outcomes */
function play(rounds: boolean[]) {
  const m = new Match();
  const out = rounds.map((w) => m.record(w));
  return { m, out, last: out[out.length - 1] };
}

test('best of three: two round wins take the match', () => {
  assert.deepEqual(MATCH, { bestOf: 3, toWin: 2 });
});

test('win, win: victory after two rounds', () => {
  const { out, last } = play([true, true]);
  assert.equal(out[0].decided, false);
  assert.deepEqual(last, { round: 2, decided: true, malfoidWon: true });
});

test('win, lose, win: victory in the third round', () => {
  const { out, last } = play([true, false, true]);
  assert.deepEqual(out.map((o) => o.decided), [false, false, true]);
  assert.deepEqual(last, { round: 3, decided: true, malfoidWon: true });
});

test('lose, lose: defeat after two rounds', () => {
  const { out, last } = play([false, false]);
  assert.equal(out[0].decided, false);
  assert.deepEqual(last, { round: 2, decided: true, malfoidWon: false });
});

test('lose, win, win: victory in the third round', () => {
  const { last } = play([false, true, true]);
  assert.deepEqual(last, { round: 3, decided: true, malfoidWon: true });
});

test('lose, win, lose: defeat in the third round', () => {
  const { out, last } = play([false, true, false]);
  assert.deepEqual(out.map((o) => o.decided), [false, false, true]);
  assert.deepEqual(last, { round: 3, decided: true, malfoidWon: false });
});

test('win, lose, lose: defeat in the third round', () => {
  const { last } = play([true, false, false]);
  assert.deepEqual(last, { round: 3, decided: true, malfoidWon: false });
});

test('round numbers, the deciding round, and a reset', () => {
  const m = new Match();
  assert.equal(m.round, 1);
  m.record(false);
  assert.equal(m.round, 2);
  assert.equal(m.final, false);
  m.record(true);
  assert.equal(m.round, 3);
  assert.equal(m.final, true);
  m.record(true);
  assert.equal(m.decided, true);
  // a decided match ignores more rounds (a late knockout can't change it)
  assert.deepEqual(m.record(false), { round: 4, decided: true, malfoidWon: true });
  assert.deepEqual([m.malfoidWins, m.opponentWins], [2, 1]);
  m.reset();
  assert.deepEqual([m.round, m.malfoidWins, m.opponentWins, m.decided], [1, 0, 0, false]);
});
