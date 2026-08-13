import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Velocity-buffer motion blur — the GPU Gems 3 ch.27 idea (per-pixel screen
 * velocity, then blur along it), extended past what the three.js forum
 * write-up of that technique does.
 *
 * That write-up reconstructs velocity from the depth buffer and the previous
 * *camera* matrix, which makes it blur camera movement only: with a static
 * camera it produces nothing at all. In this app the camera is often parked
 * while Transform nodes animate the objects, so it would have blurred
 * nothing in the common case. Rendering a real velocity buffer instead —
 * each vertex projected through both its current and its previous model
 * matrix — costs one extra depth-less scene pass and covers object motion
 * and camera motion in the same buffer.
 *
 * Replaces the AfterimagePass this started as. That pass just faded old
 * frames on top of new ones, so it smeared *everything* uniformly (a still
 * object ghosted as much as a fast one), trails persisted well after motion
 * stopped, and the direction of travel was nowhere in the result. This is
 * directional, proportional to actual speed, and stops the instant motion
 * does.
 */

/**
 * Fixed, not a uniform: GLSL ES 1.00 (what three compiles ShaderMaterial to
 * unless asked otherwise) requires a constant loop bound, and a dynamic
 * `break` against a uniform is exactly the pattern some drivers reject.
 */
const SAMPLES = 16;

/**
 * Ceiling on per-pixel velocity, in UV units. Something crossing the whole
 * screen in one frame would otherwise ask for a smear the size of the
 * viewport, which reads as a broken frame rather than fast motion.
 */
const MAX_VELOCITY_UV = 0.08;

/**
 * Maps the node's 0..1 knob onto shutter length. 1.0 would be a physically
 * true 360° shutter (blur spanning exactly the frame-to-frame displacement),
 * which at 60fps is subtle; 2.0 gives the exaggerated look this kind of tool
 * usually wants at full tilt. The one number to change if the effect reads
 * too strong or too weak overall.
 */
const SHUTTER_SCALE = 2.0;

const VELOCITY_VERTEX_SHADER = /* glsl */ `
  uniform mat4 prevModelMatrix;
  uniform mat4 prevViewProjectionMatrix;
  varying vec4 vCurrentClip;
  varying vec4 vPreviousClip;

  void main() {
    vec4 localPosition = vec4(position, 1.0);
    vCurrentClip = projectionMatrix * viewMatrix * modelMatrix * localPosition;
    vPreviousClip = prevViewProjectionMatrix * prevModelMatrix * localPosition;
    gl_Position = vCurrentClip;
  }
`;

const VELOCITY_FRAGMENT_SHADER = /* glsl */ `
  varying vec4 vCurrentClip;
  varying vec4 vPreviousClip;

  void main() {
    vec2 current = vCurrentClip.xy / vCurrentClip.w;
    vec2 previous = vPreviousClip.xy / vPreviousClip.w;
    // NDC spans 2 units across what is 1 unit of UV, hence the halving.
    vec2 velocity = (current - previous) * 0.5;
    // Alpha flags "geometry was here" — the blur pass leaves everything else
    // (the background layer) perfectly sharp.
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const MOTION_BLUR_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tVelocity: { value: null as THREE.Texture | null },
    intensity: { value: 0 },
    maxVelocity: { value: MAX_VELOCITY_UV },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define SAMPLES ${SAMPLES}

    uniform sampler2D tDiffuse;
    uniform sampler2D tVelocity;
    uniform float intensity;
    uniform float maxVelocity;
    varying vec2 vUv;

    void main() {
      vec4 velocitySample = texture2D(tVelocity, vUv);
      vec4 sharp = texture2D(tDiffuse, vUv);

      if (velocitySample.a < 0.5 || intensity <= 0.0) {
        gl_FragColor = sharp;
        return;
      }

      vec2 velocity = velocitySample.xy * intensity;
      float speed = length(velocity);
      if (speed > maxVelocity) velocity *= maxVelocity / speed;

      // Centred on the pixel rather than trailing behind it: a real shutter
      // is open either side of the sampled instant, so a moving edge blurs
      // symmetrically instead of dragging a comet tail.
      vec4 sum = vec4(0.0);
      for (int i = 0; i < SAMPLES; i++) {
        float t = float(i) / float(SAMPLES - 1) - 0.5;
        sum += texture2D(tDiffuse, vUv + velocity * t);
      }

      gl_FragColor = sum / float(SAMPLES);
    }
  `,
};

export interface MotionBlur {
  pass: ShaderPass;
  /** Renders this frame's velocity buffer. Call before the composer runs, only when the effect is on. */
  renderVelocity: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;
  /** Feeds the knob through to the blur shader. */
  setIntensity: (amount: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createMotionBlur(width: number, height: number): MotionBlur {
  const velocityTarget = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    // Velocity is signed, so an ordinary 8-bit target would clip every
    // leftward/downward movement to zero.
    type: THREE.HalfFloatType,
    depthBuffer: true,
  });

  const velocityMaterial = new THREE.ShaderMaterial({
    uniforms: {
      prevModelMatrix: { value: new THREE.Matrix4() },
      prevViewProjectionMatrix: { value: new THREE.Matrix4() },
    },
    vertexShader: VELOCITY_VERTEX_SHADER,
    fragmentShader: VELOCITY_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });

  const pass = new ShaderPass(MOTION_BLUR_SHADER);
  pass.uniforms.tVelocity.value = velocityTarget.texture;

  const previousViewProjection = new THREE.Matrix4();
  const currentViewProjection = new THREE.Matrix4();
  let hasPreviousFrame = false;

  // Per-object previous model matrix has to reach a material that every
  // object shares, so it can only be set per draw call. `onBeforeRender`
  // fires immediately before each object's draw, which is exactly that hook;
  // `uniformsNeedUpdate` is what stops three from deciding the material is
  // unchanged since the last object and skipping the re-upload.
  const velocityHook: THREE.Object3D["onBeforeRender"] = function (this: THREE.Object3D) {
    if (!isRenderingVelocity) return;
    const previousMatrix = this.userData.__prevMatrixWorld as THREE.Matrix4 | undefined;
    velocityMaterial.uniforms.prevModelMatrix.value.copy(previousMatrix ?? this.matrixWorld);
    velocityMaterial.uniformsNeedUpdate = true;
  };
  let isRenderingVelocity = false;

  function renderVelocity(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    currentViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    // Nothing to compare against on the very first frame — a zeroed previous
    // camera would report every pixel as moving at once.
    velocityMaterial.uniforms.prevViewProjectionMatrix.value.copy(
      hasPreviousFrame ? previousViewProjection : currentViewProjection,
    );

    const meshes: THREE.Mesh[] = [];
    const hidden: THREE.Object3D[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.onBeforeRender !== velocityHook) object.onBeforeRender = velocityHook;
        meshes.push(object);
        return;
      }
      // An override material replaces whatever a Points/Line/Sprite draws
      // itself with, and the particle system's real positions live in a GPU
      // texture its own vertex shader samples — not in the `position`
      // attribute this override would read, which is all zeros. Rendering
      // those here would stamp a bogus velocity blob at the world origin, so
      // they sit the pass out and stay sharp instead.
      if (object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite) {
        if (object.visible) {
          object.visible = false;
          hidden.push(object);
        }
      }
    });

    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();

    isRenderingVelocity = true;
    scene.overrideMaterial = velocityMaterial;
    renderer.setRenderTarget(velocityTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    isRenderingVelocity = false;

    scene.overrideMaterial = previousOverride;
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.setRenderTarget(previousTarget);
    for (const object of hidden) object.visible = true;

    // Snapshot *after* drawing — these become "previous" for the next frame.
    for (const mesh of meshes) {
      let stored = mesh.userData.__prevMatrixWorld as THREE.Matrix4 | undefined;
      if (!stored) {
        stored = new THREE.Matrix4();
        mesh.userData.__prevMatrixWorld = stored;
      }
      stored.copy(mesh.matrixWorld);
    }
    previousViewProjection.copy(currentViewProjection);
    hasPreviousFrame = true;
  }

  return {
    pass,
    renderVelocity,
    setIntensity: (amount: number) => {
      pass.uniforms.intensity.value = Math.max(0, amount) * SHUTTER_SCALE;
    },
    setSize: (nextWidth: number, nextHeight: number) => {
      velocityTarget.setSize(Math.max(1, nextWidth), Math.max(1, nextHeight));
    },
    dispose: () => {
      velocityTarget.dispose();
      velocityMaterial.dispose();
      pass.dispose();
    },
  };
}
