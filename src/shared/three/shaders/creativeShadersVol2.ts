import * as THREE from "three";

// --- 1. THERMAL / INFRARED VISION SHADER ---
export function createThermalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      heatScale: { value: 1.5 },
      minTemp: { value: 0.1 },
      maxTemp: { value: 0.9 },
      distortion: { value: 0.2 },
      shimmerSpeed: { value: 1.5 },
      coldColor: { value: new THREE.Color(0x05051a) },
      hotColor: { value: new THREE.Color(0xffffff) },
      enableDistortion: { value: 1.0 },
      invert: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float heatScale;
      uniform float minTemp;
      uniform float maxTemp;
      uniform float distortion;
      uniform float shimmerSpeed;
      uniform vec3 coldColor;
      uniform vec3 hotColor;
      uniform float enableDistortion;
      uniform float invert;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      // Classic FLIR thermal palette function with customizable cold & hot anchors
      vec3 thermalPalette(float t, vec3 c0, vec3 c5) {
        t = clamp(t, 0.0, 1.0);
        vec3 c1 = vec3(0.3, 0.0, 0.5);    // Purple
        vec3 c2 = vec3(0.9, 0.1, 0.1);    // Red
        vec3 c3 = vec3(1.0, 0.6, 0.0);    // Orange
        vec3 c4 = vec3(1.0, 0.95, 0.2);   // Yellow

        if (t < 0.2) return mix(c0, c1, t / 0.2);
        if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
        if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
        if (t < 0.85) return mix(c3, c4, (t - 0.6) / 0.25);
        return mix(c4, c5, (t - 0.85) / 0.15);
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float NdotV = max(0.0, dot(N, V));

        // Heat based on curvature, height and subtle dynamic ripples
        float heat = NdotV * 0.7 + (sin(vWorldPos.y * heatScale + time * shimmerSpeed) * 0.5 + 0.5) * 0.3;
        if (enableDistortion > 0.5) {
          heat += sin(vWorldPos.x * 2.0 + vWorldPos.z * 2.0 + time * shimmerSpeed) * distortion * 0.2;
        }
        heat = smoothstep(minTemp, maxTemp, heat);
        if (invert > 0.5) {
          heat = 1.0 - heat;
        }

        vec3 color = thermalPalette(heat, coldColor, hotColor);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

// --- 2. X-RAY / RADIOLOGY SHADER ---
export function createXRayMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0x38bdf8) },
      coreColor: { value: new THREE.Color(0x0e2a47) },
      edgeIntensity: { value: 2.0 },
      interiorOpacity: { value: 0.15 },
      rimPower: { value: 2.0 },
      noiseIntensity: { value: 0.1 },
      enableGrain: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 coreColor;
      uniform float edgeIntensity;
      uniform float interiorOpacity;
      uniform float rimPower;
      uniform float noiseIntensity;
      uniform float enableGrain;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float NdotV = abs(dot(N, V)); // Double-sided X-Ray penetration

        // Inverted Fresnel: edges accumulate density, facing surfaces transmit
        float edge = pow(1.0 - NdotV, max(0.1, rimPower));
        float alpha = clamp(interiorOpacity + edge * edgeIntensity, 0.0, 1.0);

        // Radiological noise grain
        float grain = 0.0;
        if (enableGrain > 0.5) {
          grain = (fract(sin(dot(vWorldPos.xy * 100.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * noiseIntensity;
        }

        vec3 baseTint = mix(coreColor, color, edge);
        vec3 finalColor = baseTint * (1.0 + edge * 2.0) + vec3(grain);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- 3. HEXAGONAL ENERGY SHIELD SHADER ---
export function createEnergyShieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      shieldColor: { value: new THREE.Color(0x00f3ff) },
      gridColor: { value: new THREE.Color(0xec4899) },
      hexScale: { value: 12.0 },
      edgeSharpness: { value: 0.85 },
      fresnelPower: { value: 2.5 },
      pulseSpeed: { value: 2.5 },
      pulseIntensity: { value: 1.5 },
      enableGrid: { value: 1.0 },
      enablePulse: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 shieldColor;
      uniform vec3 gridColor;
      uniform float hexScale;
      uniform float edgeSharpness;
      uniform float fresnelPower;
      uniform float pulseSpeed;
      uniform float pulseIntensity;
      uniform float enableGrid;
      uniform float enablePulse;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      // Hexagonal tiling distance function
      vec4 hexCoords(vec2 uv) {
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(uv - hC.xy * s, uv - (hC.zw + 0.5) * s);
        return dot(h.xy, h.xy) < dot(h.zw, h.zw) 
          ? vec4(h.xy, hC.xy) 
          : vec4(h.zw, hC.zw + 9.73);
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), max(0.1, fresnelPower));

        // Hex grid with fwidth anti-aliasing
        float edge = 0.0;
        if (enableGrid > 0.5) {
          vec4 hc = hexCoords(vUv * hexScale);
          float hexDist = max(abs(hc.x) * 1.5 + abs(hc.y) * 0.866025, abs(hc.y) * 1.7320508);
          float fwHex = fwidth(hexDist);
          float edgeMin = min(0.97, max(clamp(edgeSharpness, 0.5, 0.97), 0.98 - max(fwHex * 2.0, 0.01)));
          edge = smoothstep(edgeMin, 0.98, hexDist);
        }

        // Pulsating spherical wave
        float pulse = 0.0;
        if (enablePulse > 0.5) {
          float dist = length(vWorldPos);
          pulse = sin(dist * 3.0 - time * pulseSpeed) * 0.5 + 0.5;
          pulse = pow(pulse, 4.0) * pulseIntensity;
        }

        vec3 glow = mix(shieldColor, gridColor, edge);
        vec3 finalColor = glow * (fresnel * 1.5 + edge * 2.0 + pulse);
        float alpha = clamp(fresnel * 0.6 + edge * 0.7 + pulse * 0.5, 0.0, 1.0);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- 4. STYLIZED FIRE SHADER (SDF & SMOOTH SUBTRACTION WITH PARAMETRIC K) ---
export function createStylizedFireMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      smoothness: { value: 0.18 },
      flameWidth: { value: 0.38 },
      flameHeight: { value: 0.82 },
      waveSpeed: { value: 2.8 },
      waveFrequency: { value: 3.2 },
      waveAmplitude: { value: 0.12 },
      bubbleSpeed: { value: 2.0 },
      bubbleScale: { value: 0.22 },
      internalHoles: { value: 0.65 },
      coreSize: { value: 0.45 },
      coreOffsetY: { value: -0.04 },
      coreBaseMask: { value: 0.55 },
      baseCurvature: { value: 1.0 },
      colorSoftness: { value: 0.06 },
      outlineWidth: { value: 0.015 },
      bodyColor: { value: new THREE.Color(0xff3b14) },
      innerColor: { value: new THREE.Color(0xffbf00) },
      coreColor: { value: new THREE.Color(0xffffff) },
      darkColor: { value: new THREE.Color(0x940a00) },
      outlineColor: { value: new THREE.Color(0x4a0000) },
      enableDark: { value: 1.0 },
      enableInner: { value: 1.0 },
      enableCore: { value: 1.0 },
      enableOutline: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float smoothness;
      uniform float flameWidth;
      uniform float flameHeight;
      uniform float waveSpeed;
      uniform float waveFrequency;
      uniform float waveAmplitude;
      uniform float bubbleSpeed;
      uniform float bubbleScale;
      uniform float internalHoles;
      uniform float coreSize;
      uniform float coreOffsetY;
      uniform float coreBaseMask;
      uniform float baseCurvature;
      uniform float colorSoftness;
      uniform float outlineWidth;

      uniform vec3 bodyColor;
      uniform vec3 innerColor;
      uniform vec3 coreColor;
      uniform vec3 darkColor;
      uniform vec3 outlineColor;

      uniform float enableDark;
      uniform float enableInner;
      uniform float enableCore;
      uniform float enableOutline;

      varying vec2 vUv;

      // Smooth polynomial minimum/subtraction (Inigo Quilez smin/opSmoothSubtraction)
      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      float opSmoothSubtraction(float d1, float d2, float k) {
        float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
        return mix(d2, -d1, h) + k * h * (1.0 - h);
      }

      // Exact 2D Circle SDF
      float sdCircle(vec2 p, vec2 center, float r) {
        return length(p - center) - r;
      }

      // Tear/droplet flame body with parametric base curvature
      float sdFlameBody(vec2 p, float width, float height, float curvature) {
        float y = p.y;
        float clampedY = clamp(y / height, 0.0, 1.0);
        // Base curvature taper factor
        float baseTaper = mix(1.0, 0.4 + 0.6 * curvature, (1.0 - clampedY) * (1.0 - clampedY));
        float lateralW = width * (1.0 - clampedY * 0.95) * sqrt(max(0.001, clampedY)) * 2.2 * baseTaper;
        return max(abs(p.x) - lateralW, max(-p.y, p.y - height));
      }

      void main() {
        // Center UV coordinates: (0,0) at lower base center
        vec2 p = (vUv - vec2(0.5, 0.12));

        float t = time;

        // 1. Upward Lateral Harmonic Waves
        float wave1 = sin(p.y * waveFrequency - t * waveSpeed) * waveAmplitude * (p.y + 0.12);
        float wave2 = cos(p.y * waveFrequency * 1.8 - t * waveSpeed * 1.4) * (waveAmplitude * 0.45) * (p.y + 0.1);
        vec2 pw = vec2(p.x - (wave1 + wave2), p.y);

        // 2. Base Primary Body SDF
        float dBody = sdFlameBody(pw, flameWidth, flameHeight, baseCurvature);

        // Animated Rising Cutters (Carving negative space to form dynamic flame tongues)
        // Base Center Cutter (Arched notch at combustion base)
        vec2 cBase = vec2(sin(t * 1.8) * 0.03, 0.015);
        float rBase = bubbleScale * 0.45 + sin(t * 4.0) * 0.01;
        float dCutBase = sdCircle(pw, cBase, rBase);

        // Left Rising Tongue Cutter
        float phaseL = fract(t * bubbleSpeed * 0.65);
        float yL = 0.08 + phaseL * flameHeight * 0.95;
        vec2 cL = vec2(-flameWidth * 0.42 + sin(t * 2.2) * 0.03, yL);
        float rL = bubbleScale * (0.45 + phaseL * 0.55) * sin(phaseL * 3.14159);
        float dCutL = sdCircle(pw, cL, rL);

        // Right Rising Tongue Cutter
        float phaseR = fract(t * bubbleSpeed * 0.72 + 0.48);
        float yR = 0.08 + phaseR * flameHeight * 0.95;
        vec2 cR = vec2(flameWidth * 0.44 + cos(t * 2.5) * 0.03, yR);
        float rR = bubbleScale * (0.45 + phaseR * 0.55) * sin(phaseR * 3.14159);
        float dCutR = sdCircle(pw, cR, rR);

        // Center Dissipation Bubble (Internal tear)
        float phaseC = fract(t * bubbleSpeed * 0.52 + 0.22);
        float yC = 0.15 + phaseC * flameHeight * 0.85;
        vec2 cC = vec2(sin(t * 2.4) * 0.04, yC);
        float rC = bubbleScale * 0.55 * sin(phaseC * 3.14159) * clamp(internalHoles, 0.0, 1.0);
        float dCutC = sdCircle(pw, cC, rC);

        // 3. Apply Smooth Subtraction
        float k = max(0.001, smoothness);
        float d = dBody;
        d = opSmoothSubtraction(dCutBase, d, k);
        d = opSmoothSubtraction(dCutL, d, k);
        d = opSmoothSubtraction(dCutR, d, k);
        if (internalHoles > 0.05) d = opSmoothSubtraction(dCutC, d, k * 0.7);

        // 4. Inner Flame & White Core SDF
        float waveCore = sin(p.y * waveFrequency * 1.2 - t * waveSpeed * 1.1) * (waveAmplitude * 0.6) * (p.y + 0.1);
        vec2 pwYellow = vec2(p.x - waveCore, p.y - coreOffsetY);
        float dYellow = sdFlameBody(pwYellow, flameWidth * (coreSize * 0.92), flameHeight * (coreSize * 1.25 + 0.05), baseCurvature);
        dYellow = opSmoothSubtraction(dCutBase, dYellow, k * 0.85);
        dYellow = opSmoothSubtraction(dCutL, dYellow, k * 0.5);
        dYellow = opSmoothSubtraction(dCutR, dYellow, k * 0.5);

        vec2 pwWhite = vec2(p.x - waveCore * 0.65, p.y - (coreOffsetY - 0.05));
        float dWhite = sdFlameBody(pwWhite, flameWidth * (coreSize * 0.52), flameHeight * (coreSize * 0.75), baseCurvature);
        if (coreBaseMask > 0.01) {
          vec2 pCoreBaseCut = vec2(pw.x - cBase.x, (pw.y - cBase.y) / max(0.1, baseCurvature));
          float dCutCoreBase = length(pCoreBaseCut) - bubbleScale * 0.95 * coreBaseMask;
          dWhite = opSmoothSubtraction(dCutCoreBase, dWhite, k * 0.6);
        }
        dWhite = opSmoothSubtraction(dCutL, dWhite, k * 0.4);
        dWhite = opSmoothSubtraction(dCutR, dWhite, k * 0.4);

        // 5. Pixel Alpha & Contour Clipping with fwidth
        float aa = max(0.001, fwidth(d));
        float feather = max(aa, colorSoftness);
        float outW = enableOutline > 0.5 ? max(0.001, outlineWidth) : 0.0;

        if (d > outW) {
          discard;
        }

        float alpha = 1.0 - smoothstep(outW - aa, outW, d);

        // 6. Color Ramp Evaluation
        vec3 finalColor = bodyColor;
        if (enableDark > 0.5) {
          float darkEdge = -0.01;
          float isDark = 1.0 - smoothstep(darkEdge - feather * 1.5, darkEdge, d);
          finalColor = mix(finalColor, darkColor, isDark * 0.75);
        }
        if (enableInner > 0.5) {
          float isInner = 1.0 - smoothstep(0.005 - feather * 1.2, 0.005, dYellow);
          finalColor = mix(finalColor, innerColor, isInner);
        }
        if (enableCore > 0.5) {
          float isCoreWhite = 1.0 - smoothstep(0.005 - feather * 1.2, 0.005, dWhite);
          finalColor = mix(finalColor, coreColor, isCoreWhite);
        }
        if (enableOutline > 0.5) {
          float isOutline = smoothstep(-aa - outW * 0.5, aa, d);
          finalColor = mix(finalColor, outlineColor, isOutline);
        }

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// --- 5. MIYAZAKI CLOUD SHADER (STUDIO GHIBLI STYLE) ---
export function createMiyazakiCloudMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      seed: { value: 0.0 },
      cumulusHeight: { value: 1.0 },
      cloudWidth: { value: 1.0 },
      baseFlatness: { value: 0.75 },
      puffiness: { value: 1.2 },
      detail: { value: 1.0 },
      sunAngle: { value: 55.0 }, // Degrees (55° = top-right sunbeam)
      sunElevation: { value: 0.75 },
      shadowIntensity: { value: 0.85 },
      bandSoftness: { value: 0.03 },
      edgeSharpness: { value: 0.012 },
      outlineWidth: { value: 0.012 },
      highlightColor: { value: new THREE.Color(0xfffeee) },
      bodyColor: { value: new THREE.Color(0xf6f0dd) },
      shadowColor: { value: new THREE.Color(0xb7c7c5) },
      deepShadowColor: { value: new THREE.Color(0x7a8da8) },
      outlineColor: { value: new THREE.Color(0x566575) },
      enableHighlight: { value: 1.0 },
      enableDeepShadow: { value: 1.0 },
      enableOutline: { value: 0.0 },
      enablePuffs: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormal;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float seed;
      uniform float cumulusHeight;
      uniform float cloudWidth;
      uniform float baseFlatness;
      uniform float puffiness;
      uniform float detail;
      uniform float sunAngle;
      uniform float sunElevation;
      uniform float shadowIntensity;
      uniform float bandSoftness;
      uniform float edgeSharpness;
      uniform float outlineWidth;

      uniform vec3 highlightColor;
      uniform vec3 bodyColor;
      uniform vec3 shadowColor;
      uniform vec3 deepShadowColor;
      uniform vec3 outlineColor;

      uniform float enableHighlight;
      uniform float enableDeepShadow;
      uniform float enableOutline;
      uniform float enablePuffs;

      varying vec2 vUv;
      varying vec3 vNormal;

      // 1D / 2D Pseudo-random hash functions
      float hash1(float p) {
        p = fract(p * 0.1031);
        p *= p + 33.33;
        p *= p + p;
        return fract(p);
      }

      vec2 hash2(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.xx + p3.yz) * p3.zy);
      }

      // Smooth polynomial minimum
      float smin(float a, float b, float k) {
        float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      // Cellular Voronoi distance field (Branchless formulation eliminating warp divergence)
      float voronoiDist(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float md = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2(n + g + vec2(seed * 0.17, seed * 0.31));
            vec2 r = g + o - f;
            md = min(md, dot(r, r));
          }
        }
        return sqrt(md);
      }

      // Primary cumulus lobe definition (12 tiered spheres)
      void getLobe(int i, out vec2 center, out float radius) {
        if (i == 0) { center = vec2(0.0, -0.42); radius = 0.44; }
        else if (i == 1) { center = vec2(-0.42, -0.40); radius = 0.36; }
        else if (i == 2) { center = vec2(0.44, -0.38); radius = 0.38; }
        else if (i == 3) { center = vec2(-0.70, -0.45); radius = 0.26; }
        else if (i == 4) { center = vec2(0.68, -0.42); radius = 0.28; }
        else if (i == 5) { center = vec2(-0.06, -0.02); radius = 0.42; }
        else if (i == 6) { center = vec2(-0.38, 0.08); radius = 0.32; }
        else if (i == 7) { center = vec2(0.32, 0.16); radius = 0.34; }
        else if (i == 8) { center = vec2(-0.04, 0.44); radius = 0.36; }
        else if (i == 9) { center = vec2(-0.24, 0.48); radius = 0.26; }
        else if (i == 10) { center = vec2(0.20, 0.52); radius = 0.25; }
        else { center = vec2(-0.02, 0.68); radius = 0.20; }
      }

      // Evaluates the 2D cloud signed distance field
      float cloudSDF(vec2 p) {
        float d = 1e5;

        // 1. Primary foundation lobes
        for (int i = 0; i < 12; i++) {
          vec2 c;
          float r;
          getLobe(i, c, r);

          float fi = float(i);
          vec2 offset = (vec2(hash1(seed * 13.1 + fi * 7.7), hash1(seed * 17.3 + fi * 5.9)) - 0.5) * 0.12;
          float rOffset = (hash1(seed * 19.3 + fi * 3.1) - 0.5) * 0.07;

          float dCircle = length(p - (c + offset)) - (r + rOffset);
          d = smin(d, dCircle, 0.14);
        }

        // 2. Base condensation plane (flatter underside)
        if (baseFlatness > 0.01) {
          float baseLevel = -0.68;
          float cutPlane = -(p.y - baseLevel + sin(p.x * 5.5 + seed) * 0.025);
          float kCut = 0.12 * (1.02 - baseFlatness);
          float h = clamp(0.5 + 0.5 * (cutPlane - d) / kCut, 0.0, 1.0);
          d = mix(d, cutPlane, h) + kCut * h * (1.0 - h);
        }

        // 3. Meso & micro scalloped puff modulation
        if (enablePuffs > 0.5) {
          float w1 = voronoiDist(p * 3.8);
          float w2 = voronoiDist(p * 8.2);

          float puff1 = (1.0 - clamp(w1 * 1.35, 0.0, 1.0)) * 0.08 * detail;
          float puff2 = (1.0 - clamp(w2 * 1.45, 0.0, 1.0)) * 0.035 * detail;
          d -= (puff1 + puff2);
        }

        return d;
      }

      // Evaluates surface dome height for normal mapping and shading
      float cloudHeight(vec2 p) {
        float d = cloudSDF(p);
        if (d > 0.04) return 0.0;

        float dome = sqrt(max(0.0, -d * 2.5));
        if (enablePuffs > 0.5) {
          float w1 = voronoiDist(p * 3.8);
          float w2 = voronoiDist(p * 8.2);
          float p1 = (1.0 - clamp(w1 * 1.35, 0.0, 1.0)) * 0.35 * puffiness;
          float p2 = (1.0 - clamp(w2 * 1.45, 0.0, 1.0)) * 0.15 * puffiness;
          dome += p1 + p2;
        }
        return dome;
      }

      void main() {
        // Map UV coordinates: centered at cloud core, scaled by width and height
        vec2 p = (vUv - vec2(0.5, 0.45)) * 2.0;
        p.x /= max(0.2, cloudWidth);
        p.y /= max(0.2, cumulusHeight);

        float d = cloudSDF(p);

        // Alpha silhouette with hardware derivative fwidth antialiasing (Nyquist clamping)
        float fw = fwidth(d);
        float aa = max(fw * 0.75, max(0.001, edgeSharpness));
        float alpha = 1.0 - smoothstep(-aa, aa, d);
        if (alpha <= 0.001) {
          discard;
        }

        // Surface normal reconstruction from height gradient with hemispherical curvature
        float eps = 0.006;
        float hR = cloudHeight(p + vec2(eps, 0.0));
        float hL = cloudHeight(p - vec2(eps, 0.0));
        float hU = cloudHeight(p + vec2(0.0, eps));
        float hD = cloudHeight(p - vec2(0.0, eps));

        vec2 grad = vec2(hR - hL, hU - hD) / (2.0 * eps);
        vec2 scaledGrad = grad * puffiness * 1.35;
        float gradLenSq = dot(scaledGrad, scaledGrad);
        float nz = sqrt(max(0.04, 1.0 - min(0.96, gradLenSq)));
        vec3 localN = normalize(vec3(-scaledGrad.x, -scaledGrad.y, nz));

        // Transform normal according to mesh orientation in view space
        vec3 geomNormal = normalize(vNormal);
        vec3 tangent = normalize(abs(geomNormal.y) < 0.999 ? cross(vec3(0.0, 1.0, 0.0), geomNormal) : cross(vec3(0.0, 0.0, 1.0), geomNormal));
        vec3 bitangent = cross(geomNormal, tangent);
        mat3 tbn = mat3(tangent, bitangent, geomNormal);
        vec3 N = normalize(tbn * localN);

        // Sun light direction vector
        float rad = radians(sunAngle);
        vec3 L = normalize(vec3(cos(rad), sin(rad), max(0.1, sunElevation)));
        float NdotL = dot(N, L);

        // Global vertical ambient illumination (sunlit cumulus crown)
        float vertAmbient = clamp((p.y + 0.65) * 0.55, 0.0, 1.0);
        float rawLight = NdotL * 0.5 + 0.5;
        float light = mix(rawLight * 0.65, rawLight, vertAmbient * 0.8 + 0.2);

        // Crevice / Ambient Occlusion
        float crevice = clamp(dot(grad, grad), 0.0, 2.0) * 0.2;
        light = clamp(light - crevice * shadowIntensity, 0.0, 1.0);

        // Cel-Shading Bands (Miyazaki 4-tone palette)
        float feather = max(0.002, bandSoftness);
        vec3 col = shadowColor;

        // 1. Deep Shadow (crevices and undercuts)
        if (enableDeepShadow > 0.5) {
          float deepMask = 1.0 - smoothstep(0.22 - feather, 0.26 + feather, light);
          col = mix(col, deepShadowColor, deepMask * shadowIntensity);
        }

        // 2. Lit Body (warm ivory)
        float bodyMask = smoothstep(0.42 - feather, 0.46 + feather, light);
        col = mix(col, bodyColor, bodyMask);

        // 3. Sunlit Rim / Highlight (warm solar cream crest)
        if (enableHighlight > 0.5) {
          float hlMask = smoothstep(0.68 - feather, 0.73 + feather, light);
          // Sun-facing contour rim boost
          float sunFacing = smoothstep(0.1, 0.9, dot(normalize(p + vec2(0.0, 0.2)), L.xy));
          float edgeRim = pow(clamp(NdotL, 0.0, 1.0), 2.5) * smoothstep(-0.06, -0.01, d) * sunFacing;
          hlMask = clamp(hlMask + edgeRim * 0.7, 0.0, 1.0);
          col = mix(col, highlightColor, hlMask);
        }

        // 4. Optional Watercolor Outline with fwidth antialiasing
        if (enableOutline > 0.5 && outlineWidth > 0.001) {
          float outW = outlineWidth;
          float fwEdge = max(0.001, fw * 0.75);
          float isOutline = smoothstep(-outW - fwEdge, -outW + fwEdge, d) * (1.0 - smoothstep(-fwEdge, fwEdge, d));
          col = mix(col, outlineColor, isOutline);
        }

        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

