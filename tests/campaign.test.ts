// Logic tests for the campaign run: lives, the order, the spells learned: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SPELLS, CAMPAIGN_LIVES, Campaign, parseRun, type RunStore } from '../src/game/campaign';

class MemoryStore implements RunStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

test('a new run: Ginny first, 3 lives, only Confringo', () => {
  const c = new Campaign(new MemoryStore());
  assert.equal(c.run, null);
  assert.equal(c.opponent, null);
  c.start('normal');
  assert.equal(CAMPAIGN_LIVES, 3);
  assert.deepEqual(c.run, { level: 'normal', lives: 3, stage: 0, learned: [] });
  assert.equal(c.opponent?.id, 'ginny');
  assert.deepEqual([...c.spells], ['confringo']);
});

test('beating Ginny teaches Expelliarmus and Cho is next; practice and training have every spell', () => {
  const c = new Campaign(new MemoryStore());
  c.start('easy');
  const r = c.win();
  assert.equal(r.learned, 'expelliarmus');
  assert.equal(r.beaten.id, 'ginny');
  assert.equal(r.next?.id, 'cho');
  assert.equal(c.opponent?.id, 'cho');
  assert.ok(c.spells.has('expelliarmus'));
  assert.ok(ALL_SPELLS.has('confringo') && ALL_SPELLS.has('expelliarmus'));
});

test('a loss costs a life and the same opponent comes again; the third loss is game over', () => {
  const c = new Campaign(new MemoryStore());
  c.start('hard');
  c.win();                                         // Ginny beaten: Expelliarmus learned
  assert.deepEqual(c.lose(), { lives: 2, gameOver: false, opponent: c.opponent });
  assert.equal(c.opponent?.id, 'cho', 'the same opponent again');
  assert.equal(c.lose().lives, 1);
  const last = c.lose();
  assert.equal(last.gameOver, true);
  assert.equal(last.opponent.id, 'cho');
  assert.equal(c.run, null, 'the run is over');
  c.start('hard');
  assert.equal(c.opponent?.id, 'ginny', 'start again from Ginny');
  assert.ok(!c.spells.has('expelliarmus'), 'spells learned in the lost run are forgotten');
});

test('the run is remembered; a game over forgets it', () => {
  const store = new MemoryStore();
  const a = new Campaign(store);
  a.start('normal');
  a.lose();
  a.win();
  const b = new Campaign(store);
  assert.deepEqual(b.run, { level: 'normal', lives: 2, stage: 1, learned: ['expelliarmus'] });
  b.lose();
  b.lose();
  assert.equal(new Campaign(store).run, null);
});

test('a stored run is read safely', () => {
  assert.equal(parseRun(null), null);
  assert.equal(parseRun('garbage'), null);
  assert.equal(parseRun('{"level":"brutal","lives":3,"stage":0,"learned":[]}'), null);
  assert.equal(parseRun('{"level":"easy","lives":0,"stage":0,"learned":[]}'), null);
  assert.equal(parseRun('{"level":"easy","lives":3,"stage":99,"learned":[]}'), null);
  assert.deepEqual(parseRun('{"level":"easy","lives":2,"stage":1,"learned":["expelliarmus","avada",3,"expelliarmus"]}'),
    { level: 'easy', lives: 2, stage: 1, learned: ['expelliarmus'] });
  // blocked storage: still playable, just not remembered
  const blocked: RunStore = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const c = new Campaign(blocked);
  c.start('easy');
  assert.equal(c.win().learned, 'expelliarmus');
  c.clear();
});

test('the order: Ginny, Cho, Susan Bones, Luna, Hermione, Harry, Bellatrix, Voldemort; Susan (playable) after Cho, then Luna (not yet)', async () => {
  const { CAMPAIGN } = await import('../src/game/campaign');
  assert.deepEqual(CAMPAIGN.map((o) => o.id), ['ginny', 'cho', 'susan', 'luna', 'hermione', 'harry', 'bellatrix', 'voldemort']);
  const c = new Campaign(new MemoryStore());
  c.start('easy');
  c.win();
  const r = c.win();                                   // Cho beaten
  assert.equal(r.next?.name, 'Susan Bones');
  assert.equal(r.next?.playable, true, 'Susan is in the game');
  const s = c.win();                                   // Susan beaten
  assert.equal(s.next?.name, 'Luna Lovegood');
  assert.equal(s.next?.playable, false, 'not in the game yet');
});
