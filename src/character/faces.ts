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

/*
 * Cho's expressions (shape keys of the base mesh plus the 'blush' and 'tears' face channels,
 * tuned against her facial atlas in the viewer). Her resting face is calm and attentive:
 * a soft almond opening and a faint smile. More restrained than Ginny's, never Malfoid's glare.
 */
const noSmileCho = { mouthSmileLeft: 0, mouthSmileRight: 0 };

export const CHO_FACES: Record<string, Weights> = {
  neutral: {},
  // atlas: eyes closed in happy arcs, an open bright smile
  cheerful: { Smile2: 1.0, 'ワ': 0.35, jawOpen: 0.08, 'vrc.blink_Straight': 0, eyeSquintLeft: 0, eyeSquintRight: 0, blush: 0.2 },
  // a glance up and aside, brows a little lowered, lips pressed and pulled to one side
  thoughtful: { ...noSmileCho, browDownLeft: 0.55, browDownRight: 0.35, browInnerUp: 0.35, eyeLookOutRight: 0.6,
    eyeLookInLeft: 0.6, eyeLookUpLeft: 0.45, eyeLookUpRight: 0.45, 'vrc.blink_Straight': 0.28, mouthPressLeft: 0.45,
    mouthPressRight: 0.45, mouthLeft: 0.45, mouthPucker: 0.2 },
  // gently raised inner brows, a tense pressed mouth
  worried: { ...noSmileCho, '困る': 1.0, browInnerUp: 1.0, mouthPressLeft: 0.6, mouthPressRight: 0.6, mouthFrownLeft: 0.35,
    mouthFrownRight: 0.35, eyeSquintLeft: 0, eyeSquintRight: 0, eyeWideLeft: 0.25, eyeWideRight: 0.25 },
  surprised: { ...noSmileCho, 'びっくり': 0.8, jawOpen: 0.25, mouthFunnel: 0.4, browInnerUp: 0.6, browOuterUpLeft: 0.6,
    browOuterUpRight: 0.6, eyeSquintLeft: 0, eyeSquintRight: 0, 'vrc.blink_Straight': 0 },
  // a soft, knowing laugh: eyes eased shut, a lopsided smile
  amused: { 'なごみ': 0.75, mouthSmileLeft: 0.6, mouthSmileRight: 0.45, browInnerUp: 0.15, eyeSquintLeft: 0, eyeSquintRight: 0 },
  // shy: a lowered gaze, a small smile and the cheeks flushed
  blushing: { Shy: 0.8, eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5, browInnerUp: 0.45, mouthSmileLeft: 0.35,
    mouthSmileRight: 0.35, blush: 1 },
  // downcast, no tears (the Sad key alone brings watery highlights: kept low so sad and teary differ)
  sad: { ...noSmileCho, Sad: 0.4, '困る': 0.6, browInnerUp: 0.9, eyeLookDownLeft: 0.6, eyeLookDownRight: 0.6,
    mouthFrownLeft: 0.55, mouthFrownRight: 0.55, 'vrc.blink_Straight': 0.35 },
  // about to cry: watery eyes, tears at the lids, a little flushed
  teary: { ...noSmileCho, Teary_Eyes: 1.0, Sad: 0.6, browInnerUp: 0.7, tears: 1, blush: 0.35 },
  // quiet resolve: brows down, a focused narrowed gaze, lips pressed
  determined: { ...noSmileCho, browDownLeft: 1.0, browDownRight: 1.0, eyeSquintLeft: 0.55, eyeSquintRight: 0.55,
    mouthPressLeft: 0.75, mouthPressRight: 0.75, '真面目': 0.8 },
  pain: { ...noSmileCho, eyeBlinkLeft: 0.65, eyeBlinkRight: 0.65, browDownLeft: 0.7, browDownRight: 0.7, browInnerUp: 0.7,
    mouthStretchLeft: 0.6, mouthStretchRight: 0.6, jawOpen: 0.12 },
};

/** Cho's speaking mouth (atlas "Speaking: light, natural"): the "a" viseme, a little jaw */
export const CHO_TALK: Weights = { 'あ': 0.38, jawOpen: 0.06, mouthSmileLeft: 0.2, mouthSmileRight: 0.2 };

/*
 * Susan's expressions (the same keys and face channels, tuned against her facial atlas in the
 * viewer). Her resting face is composed and kind: a warm closed smile, relaxed lids. Warmer and
 * softer than Cho's; even her resolve is quiet (brows lowered, lips pressed, no glare).
 */
const noSmileSusan = { mouthSmileLeft: 0, mouthSmileRight: 0 };

export const SUSAN_FACES: Record<string, Weights> = {
  neutral: {},
  // atlas: eyes closed in happy arcs, an open bright smile, a touch of colour
  cheerful: { Smile2: 1.0, 'ワ': 0.45, jawOpen: 0.1, 'vrc.blink_Straight': 0, eyeSquintLeft: 0, eyeSquintRight: 0, blush: 0.25 },
  // a glance aside and down, a lowered brow, the mouth pulled a little to one side
  thoughtful: { ...noSmileSusan, browDownLeft: 0.4, browDownRight: 0.25, browInnerUp: 0.3, eyeLookOutLeft: 0.55,
    eyeLookInRight: 0.55, eyeLookDownLeft: 0.25, eyeLookDownRight: 0.25, 'vrc.blink_Straight': 0.25, mouthPressLeft: 0.35,
    mouthPressRight: 0.35, mouthRight: 0.35 },
  // raised inner brows, a tense mouth (the atlas's anxious look)
  worried: { ...noSmileSusan, '困る': 1.0, browInnerUp: 1.0, mouthPressLeft: 0.55, mouthPressRight: 0.55, mouthFrownLeft: 0.3,
    mouthFrownRight: 0.3, eyeSquintLeft: 0, eyeSquintRight: 0, eyeWideLeft: 0.2, eyeWideRight: 0.2 },
  surprised: { ...noSmileSusan, 'びっくり': 0.8, jawOpen: 0.28, mouthFunnel: 0.45, browInnerUp: 0.6, browOuterUpLeft: 0.6,
    browOuterUpRight: 0.6, eyeSquintLeft: 0, eyeSquintRight: 0, 'vrc.blink_Straight': 0 },
  // a soft laugh: eyes eased shut, an open smile
  amused: { 'なごみ': 0.8, mouthSmileLeft: 0.6, mouthSmileRight: 0.6, 'ワ': 0.2, eyeSquintLeft: 0, eyeSquintRight: 0, blush: 0.15 },
  // shy: a lowered gaze, a small smile, the cheeks flushed
  blushing: { Shy: 0.8, eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5, browInnerUp: 0.45, mouthSmileLeft: 0.35,
    mouthSmileRight: 0.35, blush: 1 },
  // downcast, no tears
  sad: { ...noSmileSusan, Sad: 0.4, '困る': 0.6, browInnerUp: 0.9, eyeLookDownLeft: 0.6, eyeLookDownRight: 0.6,
    mouthFrownLeft: 0.5, mouthFrownRight: 0.5, 'vrc.blink_Straight': 0.35 },
  teary: { ...noSmileSusan, Teary_Eyes: 1.0, Sad: 0.6, browInnerUp: 0.7, tears: 1, blush: 0.35 },
  // quiet resolve: brows lowered, a steady gaze, lips pressed (firm, not angry)
  determined: { ...noSmileSusan, browDownLeft: 0.8, browDownRight: 0.8, eyeSquintLeft: 0.35, eyeSquintRight: 0.35,
    mouthPressLeft: 0.6, mouthPressRight: 0.6, '真面目': 0.7 },
  // comforted / sincere: eyes gently closed, a warm smile (she heals with this face)
  comforted: { 'なごみ': 0.95, mouthSmileLeft: 0.45, mouthSmileRight: 0.45, browInnerUp: 0.25, eyeSquintLeft: 0,
    eyeSquintRight: 0, blush: 0.15 },
  pain: { ...noSmileSusan, eyeBlinkLeft: 0.65, eyeBlinkRight: 0.65, browDownLeft: 0.7, browDownRight: 0.7, browInnerUp: 0.7,
    mouthStretchLeft: 0.6, mouthStretchRight: 0.6, jawOpen: 0.12 },
};

/** Susan's speaking mouth (atlas "Speaking: light, natural"): the "a" viseme, warm corners */
export const SUSAN_TALK: Weights = { 'あ': 0.4, jawOpen: 0.06, mouthSmileLeft: 0.3, mouthSmileRight: 0.3 };
