// Logic tests for the campaign run: the order, the spells learned, game over: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SPELLS, Campaign, parseRun, spellsBefore, type RunStore } from '../src/game/campaign';

class MemoryStore implements RunStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

test('a new run: Ginny first, only Confringo', () => {
  const c = new Campaign(new MemoryStore());
  assert.equal(c.run, null);
  assert.equal(c.opponent, null);
  c.start('normal');
  assert.deepEqual(c.run, { level: 'normal', stage: 0, learned: [] });
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

test('beating Cho teaches Protego; a run saved past Cho before she taught it gets it', () => {
  const c = new Campaign(new MemoryStore());
  c.start('normal');
  c.win();
  const r = c.win();
  assert.equal(r.beaten.id, 'cho');
  assert.equal(r.learned, 'protego');
  assert.deepEqual([...c.spells], ['confringo', 'expelliarmus', 'protego']);
  assert.ok(ALL_SPELLS.has('protego'));
  assert.deepEqual(parseRun('{"level":"easy","lives":3,"stage":2,"learned":["expelliarmus"]}')!.learned, ['expelliarmus', 'protego']);
  assert.deepEqual(parseRun('{"level":"easy","lives":3,"stage":1,"learned":[]}')!.learned, ['expelliarmus']);
});

test('a lost match is game over: the run ends at once and starts again from Ginny', () => {
  const c = new Campaign(new MemoryStore());
  c.start('hard');
  c.win();                                         // Ginny beaten: Expelliarmus learned
  c.win();                                         // Cho beaten: Protego learned
  const r = c.lose();                              // lost to Susan
  assert.deepEqual(r, { opponent: r.opponent });
  assert.equal(r.opponent.id, 'susan');
  assert.equal(c.run, null, 'the run is over');
  assert.equal(c.opponent, null);
  c.start('hard');
  assert.equal(c.opponent?.id, 'ginny', 'start again from Ginny');
  assert.ok(!c.spells.has('expelliarmus'), 'spells learned in the lost run are forgotten');
});

test('the run is remembered; a game over forgets it', () => {
  const store = new MemoryStore();
  const a = new Campaign(store);
  a.start('normal');
  a.win();
  const b = new Campaign(store);
  assert.deepEqual(b.run, { level: 'normal', stage: 1, learned: ['expelliarmus'] });
  b.lose();
  assert.equal(new Campaign(store).run, null);
});

test('a stored run is read safely', () => {
  assert.equal(parseRun(null), null);
  assert.equal(parseRun('garbage'), null);
  assert.equal(parseRun('{"level":"brutal","lives":3,"stage":0,"learned":[]}'), null);
  assert.equal(parseRun('{"level":"easy","stage":99,"learned":[]}'), null);
  assert.deepEqual(parseRun('{"level":"easy","stage":1,"learned":["expelliarmus","avada",3,"expelliarmus"]}'),
    { level: 'easy', stage: 1, learned: ['expelliarmus'] });
  // a run saved while the campaign had lives carries on (the lives are dropped)
  assert.deepEqual(parseRun('{"level":"normal","lives":2,"stage":2,"learned":["expelliarmus","protego"]}'),
    { level: 'normal', stage: 2, learned: ['expelliarmus', 'protego'] });
  // blocked storage: still playable, just not remembered
  const blocked: RunStore = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const c = new Campaign(blocked);
  c.start('easy');
  assert.equal(c.win().learned, 'expelliarmus');
  c.clear();
});

test('the order: Ginny, Cho, Susan Bones, Luna, Hermione, Harry, Bellatrix, Voldemort; up to Hermione playable, then Harry (not yet)', async () => {
  const { CAMPAIGN } = await import('../src/game/campaign');
  assert.deepEqual(CAMPAIGN.map((o) => o.id), ['ginny', 'cho', 'susan', 'luna', 'hermione', 'harry', 'bellatrix', 'voldemort']);
  const c = new Campaign(new MemoryStore());
  c.start('easy');
  c.win();
  const r = c.win();                                   // Cho beaten
  assert.equal(r.next?.name, 'Susan Bones');
  assert.equal(r.next?.playable, true, 'Susan is in the game');
  const s = c.win();                                   // Susan beaten
  assert.equal(s.learned, 'impedimenta', 'her Impediment Jinx');
  assert.equal(s.next?.name, 'Luna Lovegood');
  assert.equal(s.next?.playable, true, 'Luna is in the game');
  const l = c.win();                                   // Luna beaten
  assert.equal(l.learned, null, 'her reward (Illusio) comes later');
  assert.equal(l.next?.name, 'Hermione Granger');
  assert.equal(l.next?.playable, true, 'Hermione is in the game');
  const h = c.win();                                   // Hermione beaten
  assert.equal(h.learned, null, 'no reward');
  assert.equal(h.next?.name, 'Harry Potter');
  assert.equal(h.next?.playable, false, 'not in the game yet');
});

test("practice: the spells she has on reaching each opponent in the campaign (no Protego against Ginny)", () => {
  assert.deepEqual([...spellsBefore('ginny')], ['confringo']);
  assert.deepEqual([...spellsBefore('cho')], ['confringo', 'expelliarmus']);
  assert.deepEqual([...spellsBefore('susan')], ['confringo', 'expelliarmus', 'protego']);
  assert.deepEqual([...spellsBefore('luna')], ['confringo', 'expelliarmus', 'protego', 'impedimenta']);
  // the same as a campaign run arriving there
  const c = new Campaign(new MemoryStore());
  c.start('easy');
  for (const id of ['ginny', 'cho', 'susan', 'luna']) {
    assert.equal(c.opponent?.id, id);
    assert.deepEqual([...c.spells].sort(), [...spellsBefore(id)].sort());
    c.win();
  }
  // not in the campaign (a mirror match): every spell
  assert.deepEqual([...spellsBefore('malfoid')].sort(), [...ALL_SPELLS].sort());
});
