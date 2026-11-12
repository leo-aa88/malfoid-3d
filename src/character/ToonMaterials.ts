import * as THREE from 'three';

/** Two-step ramp for anime cel shading. */
function makeGradient(): THREE.DataTexture {
  const tones = new Uint8Array([175, 175, 175, 255, 255, 255, 255, 255]);
  const tex = new THREE.DataTexture(tones, 2, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// face decals and effect cards: no outline, flat lighting
const FACE_DECALS = new Set(['Eye', 'Highlight', 'Alpha']);
const HIDDEN = new Set(['Tear']);
// alpha-card hair and small trims get no inverted-hull outline (it would outline every card)
const NO_OUTLINE = new Set(['Body', 'Eye', 'Highlight', 'Alpha', 'Tear', 'mf_earring', 'mf_crest_silver',
  'mf_crest_green', 'mf_tie', 'mf_tie_stripe', 'mf_tie_tex', 'mf_hair_tex']);

const OUTLINE_COLOR = new THREE.Color('#3a2a28');

export class ToonMaterials {
  private readonly gradient = makeGradient();
  private readonly cache = new Map<string, THREE.Material>();
  private readonly outline: THREE.MeshBasicMaterial;

  constructor(private readonly outlineWidth = 0.0016) {
    this.outline = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });
    const w = this.outlineWidth;
    this.outline.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        // push out along the bind-pose normal before skinning
        `#include <begin_vertex>\n  transformed += normalize(normal) * ${w.toFixed(5)};`,
      );
    };
    this.outline.customProgramCacheKey = () => 'mf-outline';
  }

  /** convert one glTF material into its toon counterpart (shared per name) */
  convert(src: THREE.Material, mesh: THREE.Mesh): THREE.Material {
    const key = src.name + (mesh.geometry.hasAttribute('color') && src.name === 'mf_hair' ? '#vc' : '');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const s = src as THREE.MeshStandardMaterial;
    let out: THREE.Material;
    if (FACE_DECALS.has(s.name)) {
      out = new THREE.MeshBasicMaterial({ map: s.map, color: s.color, alphaTest: 0.5, side: THREE.DoubleSide });
    } else {
      const m = new THREE.MeshToonMaterial({
        color: s.color,
        map: s.map,
        gradientMap: this.gradient,
        side: THREE.DoubleSide,
      });
      if (s.map) m.alphaTest = 0.5;
      if (s.name === 'mf_hair') {
        m.vertexColors = true;
        m.color.set('#f1d8bb');                 // platinum blonde; vertex colours add root/tip tones
      }
      if (s.name === 'mf_earring') m.color.set('#141414');
      out = m;
    }
    out.name = s.name;
    out.transparent = false;
    this.cache.set(key, out);
    return out;
  }

  /** convert every mesh of the character, add inverted-hull outlines */
  apply(root: THREE.Object3D): void {
    const outlined: THREE.SkinnedMesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = (mesh.material as THREE.Material).name;
      if (HIDDEN.has(name)) {
        mesh.visible = false;
        return;
      }
      mesh.material = this.convert(mesh.material as THREE.Material, mesh);
      mesh.castShadow = !FACE_DECALS.has(name);
      // the face stays clean: hair/cards casting dithered shadow onto it reads as dirt in toon shading
      mesh.receiveShadow = !(name === 'Body' || FACE_DECALS.has(name));
      mesh.frustumCulled = false;            // skinned bounds are unreliable while animating
      if (!NO_OUTLINE.has(name) && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        outlined.push(mesh as THREE.SkinnedMesh);
      }
    });
    for (const mesh of outlined) {
      const hull = new THREE.SkinnedMesh(mesh.geometry, this.outline);
      hull.bind(mesh.skeleton, mesh.bindMatrix);
      hull.morphTargetInfluences = mesh.morphTargetInfluences;
      hull.morphTargetDictionary = mesh.morphTargetDictionary;
      hull.frustumCulled = false;
      hull.castShadow = false;
      hull.name = mesh.name + '_outline';
      mesh.parent?.add(hull);
      hull.position.copy(mesh.position);
      hull.quaternion.copy(mesh.quaternion);
      hull.scale.copy(mesh.scale);
    }
  }
}
