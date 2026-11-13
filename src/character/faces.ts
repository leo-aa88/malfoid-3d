import type { Weights } from './Malfoid';

/*
 * Ginny's expressions (shape keys of the base mesh, tuned against the facial atlas in the
 * viewer). Keys a face doesn't list keep her resting value. Her resting face is warm and
 * self-assured: open eyes, a hint of a smile.
 */
const noSmile = { mouthSmileLeft: 0, mouthSmileRight: 0 };

export const GINNY_FACES: Record<string, Weights> = {
  neutral: {},
  happy: { Smile2: 1.0, 'vrc.blink_Straight': 0 },                  // the atlas's wink smile
  cheerful: { 'ワ': 0.6, mouthSmileLeft: 0.6, mouthSmileRight: 0.6, cheekSquintLeft: 0.4, cheekSquintRight: 0.4,
    browOuterUpLeft: 0.3, browOuterUpRight: 0.3 },
  confident: { Confident: 0.8 },
  teasing: { Smirk: 0.8, browOuterUpLeft: 0.5, eyeSquintRight: 0.3 },
  determined: { ...noSmile, browDownLeft: 0.7, browDownRight: 0.7, eyeSquintLeft: 0.35, eyeSquintRight: 0.35,
    mouthPressLeft: 0.7, mouthPressRight: 0.7, '真面目': 0.6 },
  frustrated: { ...noSmile, browDownLeft: 1.0, browDownRight: 1.0, browInnerUp: 0.4, mouthFrownLeft: 0.6,
    mouthFrownRight: 0.6, mouthPressLeft: 0.5, mouthPressRight: 0.5, '困る': 0.5 },
  angry: { ...noSmile, browDownLeft: 1.2, browDownRight: 1.2, eyeSquintLeft: 0.3, eyeSquintRight: 0.3, jawOpen: 0.22,
    mouthUpperUpLeft: 0.4, mouthUpperUpRight: 0.4, mouthFrownLeft: 0.4, mouthFrownRight: 0.4, '怒り': 0.8 },
  surprised: { ...noSmile, eyeWideLeft: 0.9, eyeWideRight: 0.9, browInnerUp: 0.8, browOuterUpLeft: 0.7,
    browOuterUpRight: 0.7, jawOpen: 0.3, mouthFunnel: 0.4, 'vrc.blink_Straight': 0 },
  embarrassed: { Shy: 1.0, eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5, browInnerUp: 0.5, '照れ': 1.0 },
  pain: { ...noSmile, eyeBlinkLeft: 0.65, eyeBlinkRight: 0.65, browDownLeft: 0.8, browDownRight: 0.8, browInnerUp: 0.7,
    mouthStretchLeft: 0.7, mouthStretchRight: 0.7, jawOpen: 0.15 },
};

/**
 * Ginny's open mouth while she speaks (Malfoid.setTalk scales it): the "a" viseme, a little
 * jaw and the corners up, like the atlas's "Speaking (light, natural)"
 */
export const GINNY_TALK: Weights = { 'あ': 0.4, jawOpen: 0.06, mouthSmileLeft: 0.4, mouthSmileRight: 0.4 };
