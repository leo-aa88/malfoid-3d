// Logic tests for the duel's voice lines and lip movement (no Web Audio): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuelVoices, VOICE, mouthOpen } from '../src/audio/duelVoices';
import { ENVELOPE_RATE, loudnessEnvelope } from '../src/audio/envelope';
import type { SoundHandle, SoundId } from '../src/audio/Sfx';

const DT = 1 / 60;

/** a sound player on a fake audio clock; every line is 1 s: loud (syllables) then quiet */
class FakePlayer {
  clock = 0;
  pending = false;
  missing = false;
  played: { id: SoundId; at: number }[] = [];
  play(id: SoundId): SoundHandle | null {
    if (this.missing) return null;
    const t0 = this.clock;
    this.played.push({ id, at: t0 });
    return { stop() {}, elapsed: () => this.clock - t0, duration: 1 };
  }
  envelope(): Float32Array {
    // 0..0.5 s: syllables (loud / quiet every 0.1 s); 0.5..1 s: silence
    return Float32Array.from({ length: ENVELOPE_RATE }, (_, i) => (i < 50 ? (Math.floor(i / 10) % 2 ? 0.05 : 1) : 0));
  }
}

class FakeSpeaker {
  talk = 0;
  maxTalk = 0;
  setTalk(v: number) {
    this.talk = v;
    this.maxTalk = Math.max(this.maxTalk, v);
  }
}

function setup() {
  const sfx = new FakePlayer();
  const malfoid = new FakeSpeaker();
  const ginny = new FakeSpeaker();
  const voices = new DuelVoices(sfx, malfoid, ginny);
  let introDone = 0;
  voices.onIntroDone = () => introDone++;
  const run = (s: number, each?: () => void) => {
    for (let i = 0; i < Math.round(s / DT); i++) {
      sfx.clock += DT;
      voices.update(DT);
      each?.();
    }
  };
  return { sfx, malfoid, ginny, voices, run, done: () => introDone };
}

test('intro: Malfoid speaks, then Ginny replies, then the fight starts', () => {
  const { sfx, voices, run, done } = setup();
  voices.startIntro();
  assert.ok(voices.introRunning);
  run(VOICE.introDelay + 0.1);
  assert.deepEqual(sfx.played.map((p) => p.id), ['malfoidOpening']);
  run(1 + VOICE.replyGap + 0.1);
  assert.deepEqual(sfx.played.map((p) => p.id), ['malfoidOpening', 'ginnyOpening']);
  assert.ok(sfx.played[1].at - sfx.played[0].at >= 1 + VOICE.replyGap - 2 * DT, 'Ginny waits for Malfoid to finish');
  assert.equal(done(), 0, 'the fight waits for Ginny to finish');
  run(1.1);
  assert.equal(done(), 1);
  assert.ok(!voices.introRunning);
});

test('mouths open on loud syllables, close in pauses and when the other speaks', () => {
  const { malfoid, ginny, voices, run } = setup();
  voices.startIntro();
  run(VOICE.introDelay + 0.05);
  // during Malfoid's syllables: her mouth moves, Ginny's stays shut
  const seen: number[] = [];
  run(0.5, () => seen.push(malfoid.talk));
  assert.ok(Math.max(...seen) > 0.8, 'opens on loud parts');
  assert.ok(Math.min(...seen.slice(5)) < 0.3, 'closes between syllables');
  assert.equal(ginny.maxTalk, 0);
  run(0.4);                                    // the quiet end of her line
  assert.ok(malfoid.talk < 0.05, 'shut when quiet');
  run(0.5);                                    // Ginny's turn
  assert.ok(ginny.maxTalk > 0.8);
});

test('missing sound files: the intro is skipped and the fight starts at once', () => {
  const { sfx, voices, run, done } = setup();
  sfx.missing = true;
  voices.startIntro();
  run(VOICE.introDelay + 0.1);
  assert.equal(done(), 1);
});

test('the very first duel waits for the files to decode (but not forever)', () => {
  const { sfx, voices, run, done } = setup();
  sfx.pending = true;
  voices.startIntro();
  run(1);
  assert.equal(sfx.played.length, 0, 'waits while loading');
  sfx.pending = false;
  run(0.1);
  assert.equal(sfx.played.length, 1, 'plays once loaded');
  const b = setup();
  b.sfx.pending = true;
  b.sfx.missing = true;
  b.voices.startIntro();
  b.run(VOICE.introDelay + VOICE.loadWait + 0.2);
  assert.equal(b.done(), 1, 'gives up after loadWait');
  assert.equal(done(), 0);
});

test('win line: the winner speaks after a beat; stop cuts an intro without starting the fight', () => {
  const { sfx, ginny, voices, run, done } = setup();
  voices.startIntro();
  run(0.5);
  voices.win(ginny);                           // e.g. a KO during the intro is impossible, but any line is cut
  assert.ok(!voices.introRunning);
  run(VOICE.winDelay + 0.1);
  assert.equal(sfx.played.at(-1)!.id, 'ginnyWin');
  assert.ok(ginny.maxTalk > 0.8);
  voices.startIntro();
  voices.stop();
  run(3);
  assert.equal(done(), 0);
});

test('loudness envelope: 100 values a second, loud parts near 1, silence 0', () => {
  const sr = 8000;
  const data = new Float32Array(sr);           // 1 s: 0.5 s of a tone, then silence
  for (let i = 0; i < sr / 2; i++) data[i] = 0.5 * Math.sin((i / sr) * 2 * Math.PI * 220);
  const env = loudnessEnvelope({ sampleRate: sr, numberOfChannels: 1, getChannelData: () => data }, 0, 1);
  assert.equal(env.length, ENVELOPE_RATE);
  assert.ok(Math.abs(env[20] - 1) < 0.05);
  assert.equal(env[80], 0);
  assert.equal(mouthOpen(0), 0);
  assert.equal(mouthOpen(1), 1);
});
