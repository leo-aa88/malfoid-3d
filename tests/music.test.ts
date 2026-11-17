// Logic tests for the battle music (fake <audio> elements): `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC, Music, Track } from '../src/audio/Music';
import { OPPONENTS } from '../src/game/opponents';
import { DEFAULT_MUSIC_VOLUME, parseVolume } from '../src/ui/VolumeControl';

class FakeTrack implements Track {
  loop = false;
  volume = 1;
  currentTime = 0;
  preload = '';
  playing = false;
  constructor(readonly url: string) {}
  play(): Promise<void> {
    this.playing = true;
    return Promise.resolve();
  }
  pause(): void {
    this.playing = false;
  }
}

function setup(supported = true) {
  const made: FakeTrack[] = [];
  const music = new Music('/', supported, (url) => {
    const t = new FakeTrack(url);
    made.push(t);
    return t;
  });
  const song = (name: string) => made.find((t) => t.url === `/music/${name}.ogg` && t.loop);
  return { music, made, song };
}

test('DUEL!: the song from its beginning, looping, at the slider level under the mix gain', () => {
  const { music, song } = setup();
  music.prepare('battle');
  const t = song('battle')!;
  assert.equal(t.preload, 'auto');                       // buffered before DUEL!
  assert.equal(t.playing, false);
  t.currentTime = 42;
  music.start('battle');
  assert.equal(t.playing, true);
  assert.equal(t.loop, true);
  assert.equal(t.currentTime, 0);
  assert.equal(t.volume, music.volume * MUSIC.gain);
  assert.equal(music.playing, 'battle');
});

test('the winner announced: a fade-out over MUSIC.fadeOut s of game time, then silence', () => {
  const { music, song } = setup();
  music.start('battle');
  const t = song('battle')!;
  const full = t.volume;
  music.stop();
  music.update(MUSIC.fadeOut / 2);
  assert.ok(Math.abs(t.volume - full / 2) < 1e-9);
  assert.equal(t.playing, true);
  music.update(MUSIC.fadeOut / 2 + 0.01);
  assert.equal(t.playing, false);
  assert.equal(music.playing, null);
});

test('a pause holds the song and its fade; leaving the duel while paused stops it at once', () => {
  const { music, song } = setup();
  music.start('battle');
  const t = song('battle')!;
  music.stop();
  music.update(0.2);
  const v = t.volume;
  music.setPaused(true);
  assert.equal(t.playing, false);
  music.setPaused(false);
  assert.equal(t.playing, true);
  assert.equal(t.volume, v);                             // no fade ran during the pause
  music.setPaused(true);
  music.stop(0.3);                                       // e.g. the menu opened
  assert.equal(music.playing, null);
  music.setPaused(false);
  assert.equal(t.playing, false);                        // not brought back by the unpause
});

test('DUEL! while paused (entering a mode from the menu) starts with the unpause', () => {
  const { music, song } = setup();
  music.setPaused(true);
  music.start('battle');
  assert.equal(song('battle')!.playing, false);
  music.setPaused(false);
  assert.equal(song('battle')!.playing, true);
});

test('a match\'s later round: the song goes on where it is; after the match ends, the next starts it over', () => {
  const { music, song } = setup();
  music.keep('battle');                                  // round 1's DUEL!
  const t = song('battle')!;
  assert.equal(t.playing, true);
  t.currentTime = 80;
  music.keep('battle');                                  // round 2's DUEL!: no restart
  assert.equal(t.currentTime, 80);
  music.stop();                                          // the match's winner announced
  music.update(MUSIC.fadeOut + 0.1);
  assert.equal(t.playing, false);
  music.keep('battle');                                  // the next match
  assert.equal(t.playing, true);
  assert.equal(t.currentTime, 0);
  assert.equal(t.volume, music.volume * MUSIC.gain);    // full again, not the faded level
});

test('the music slider starts at 100 %', () => {
  const { music } = setup();
  assert.equal(music.volume, 1);
  assert.equal(DEFAULT_MUSIC_VOLUME, 100);
});

test('Hermione has her own song; every other opponent the shared battle song', () => {
  assert.equal(OPPONENTS.hermione.music, 'battle_against_hermione');
  for (const o of Object.values(OPPONENTS)) if (o.id !== 'hermione') assert.equal(o.music ?? MUSIC.defaultSong, 'battle');
  const { music, song } = setup();
  music.start('battle');
  music.start('battle_against_hermione');                // a different duel straight after
  assert.equal(song('battle')!.playing, false);
  assert.equal(song('battle_against_hermione')!.playing, true);
});

test('music volume: its own slider and mute; a fade never gets louder when stopped again', () => {
  const { music, song } = setup();
  music.start('battle');
  const t = song('battle')!;
  music.setVolume(0.5);
  assert.equal(t.volume, 0.5 * MUSIC.gain);
  music.setMuted(true);
  assert.equal(t.volume, 0);
  music.setMuted(false);
  music.stop(0.4);
  music.update(0.2);
  music.stop(5);                                         // a slower stop doesn't stretch the fade
  music.update(0.21);
  assert.equal(music.playing, null);
  assert.equal(parseVolume(null, DEFAULT_MUSIC_VOLUME), DEFAULT_MUSIC_VOLUME);
});

test('a browser without Ogg Vorbis: no music, nothing breaks', () => {
  const { music, made } = setup(false);
  music.prepare('battle');
  music.start('battle');
  music.setPaused(true);
  music.stop();
  music.preview();
  assert.equal(made.length, 0);
  assert.equal(music.playing, null);
});
