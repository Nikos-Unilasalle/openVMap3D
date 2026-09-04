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

        // Hex grid
        float edge = 0.0;
        if (enableGrid > 0.5) {
          vec4 hc = hexCoords(vUv * hexScale);
          float hexDist = max(abs(hc.x) * 1.5 + abs(hc.y) * 0.866025, abs(hc.y) * 1.7320508);
          edge = smoothstep(clamp(edgeSharpness, 0.5, 0.97), 0.98, hexDist);
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
      coreBaseMask: { value: 0.9 },
      baseCurvature: { value: 1.0 },
      outlineWidth: { value: 0.018 },
      colorSoftness: { value: 0.02 },
      enableCore: { value: 1.0 },
      enableInner: { value: 1.0 },
      enableDark: { value: 1.0 },
      enableOutline: { value: 1.0 },
      coreColor: { value: new THREE.Color(0xfffde0) },
      innerColor: { value: new THREE.Color(0xffcc00) },
      bodyColor: { value: new THREE.Color(0xff5500) },
      darkColor: { value: new THREE.Color(0xa82000) },
      outlineColor: { value: new THREE.Color(0x1a0500) },
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
      uniform float outlineWidth;
      uniform float colorSoftness;

      uniform float enableCore;
      uniform float enableInner;
      uniform float enableDark;
      uniform float enableOutline;

      uniform vec3 coreColor;
      uniform vec3 innerColor;
      uniform vec3 bodyColor;
      uniform vec3 darkColor;
      uniform vec3 outlineColor;

      varying vec2 vUv;
      varying vec3 vNormal;

      // Inigo Quilez Smooth Subtraction with radius k
      float opSmoothSubtraction(float d1, float d2, float k) {
        float h = clamp(0.5 - 0.5 * (d2 + d1) / max(0.0001, k), 0.0, 1.0);
        return mix(d2, -d1, h) + k * h * (1.0 - h);
      }

      // 2D Circle SDF
      float sdCircle(vec2 p, vec2 c, float r) {
        return length(p - c) - r;
      }

      // 2D Uneven Capsule / Teardrop SDF with parametric base curvature along Y
      float sdFlameBody(vec2 p, float width, float height, float bCurve) {
        float curve = max(0.05, bCurve);
        float yNorm = clamp(p.y / max(0.001, height), 0.0, 1.0);
        float shapeFactor = pow(yNorm, 0.5 / curve);
        float r = width * sin(shapeFactor * 3.14159265) * (1.1 - 0.45 * yNorm);
        if (p.y < 0.0) {
          return length(vec2(p.x, p.y / curve)) - r * 0.5;
        }
        if (p.y > height) {
          return length(vec2(p.x, p.y - height)) - 0.001;
        }
        return abs(p.x) - r;
      }

      void main() {
        // Center coordinates: x in [-0.5, 0.5], y in [0.0, 1.0]
        vec2 p = vec2(vUv.x - 0.5, vUv.y - 0.08);

        float t = time;

        // Wave S-curve propagation
        float wave = sin(p.y * waveFrequency - t * waveSpeed) * waveAmplitude * (p.y + 0.15);
        wave += sin(p.y * waveFrequency * 2.3 - t * waveSpeed * 1.6) * (waveAmplitude * 0.35) * p.y;
        vec2 pw = vec2(p.x - wave, p.y);

        // 1. Base Flame Body SDF (Positive Shape)
        float dBody = sdFlameBody(pw, flameWidth, flameHeight, baseCurvature);

        // 2. Negative Cutters (Rising Bubbles)
        // Base Arch Cutter (draws cool air in at bottom, shaped by baseCurvature along Y)
        vec2 cBase = vec2(wave * 0.3 + sin(t * 2.2) * 0.03, 0.04 + sin(t * 1.8) * 0.02);
        vec2 pBaseCut = vec2(pw.x - cBase.x, (pw.y - cBase.y) / max(0.1, baseCurvature));
        float dCutBase = length(pBaseCut) - bubbleScale * 0.95;

        // Left Flank Notch / Tongue Cutter
        float phaseL = fract(t * bubbleSpeed * 0.65);
        float yL = phaseL * flameHeight * 1.25;
        float wL = flameWidth * sin(sqrt(clamp(yL / flameHeight, 0.0, 1.0)) * 3.14159);
        vec2 cL = vec2(-wL * 0.9 + sin(t * 3.1) * 0.02, yL);
        float rL = bubbleScale * (0.65 + 0.45 * sin(phaseL * 3.14159));
        float dCutL = sdCircle(pw, cL, rL);

        // Right Flank Notch / Tongue Cutter (Offset phase)
        float phaseR = fract(t * bubbleSpeed * 0.65 + 0.48);
        float yR = phaseR * flameHeight * 1.25;
        float wR = flameWidth * sin(sqrt(clamp(yR / flameHeight, 0.0, 1.0)) * 3.14159);
        vec2 cR = vec2(wR * 0.9 - cos(t * 2.9) * 0.02, yR);
        float rR = bubbleScale * (0.7 + 0.4 * sin(phaseR * 3.14159));
        float dCutR = sdCircle(pw, cR, rR);

        // Center/Internal Hole Bubble (produces internal negative void in flame body)
        float phaseC = fract(t * bubbleSpeed * 0.52 + 0.22);
        float yC = 0.15 + phaseC * flameHeight * 0.85;
        vec2 cC = vec2(sin(t * 2.4) * 0.04, yC);
        float rC = bubbleScale * 0.55 * sin(phaseC * 3.14159) * clamp(internalHoles, 0.0, 1.0);
        float dCutC = sdCircle(pw, cC, rC);

        // Upper Dissipation Bubble
        float phaseTop = fract(t * bubbleSpeed * 0.8 + 0.75);
        float yTop = 0.35 + phaseTop * flameHeight * 0.8;
        vec2 cTop = vec2(sin(t * 3.5 + 1.2) * 0.06, yTop);
        float rTop = bubbleScale * 0.6 * sin(phaseTop * 3.14159);
        float dCutTop = sdCircle(pw, cTop, rTop);

        // 3. Apply Smooth Subtraction with variable k (smoothness)
        float k = max(0.001, smoothness);
        float d = dBody;
        d = opSmoothSubtraction(dCutBase, d, k);
        d = opSmoothSubtraction(dCutL, d, k);
        d = opSmoothSubtraction(dCutR, d, k);
        d = opSmoothSubtraction(dCutTop, d, k);
        if (internalHoles > 0.05) {
          d = opSmoothSubtraction(dCutC, d, k * 0.7);
        }

        // 4. Inner Flame & White Core SDF
        float waveCore = sin(p.y * waveFrequency * 1.2 - t * waveSpeed * 1.1) * (waveAmplitude * 0.6) * (p.y + 0.1);

        // Yellow inner flame tongue:
        vec2 pwYellow = vec2(p.x - waveCore, p.y - coreOffsetY);
        float dYellow = sdFlameBody(pwYellow, flameWidth * (coreSize * 0.92), flameHeight * (coreSize * 1.25 + 0.05), baseCurvature);
        dYellow = opSmoothSubtraction(dCutBase, dYellow, k * 0.85);
        dYellow = opSmoothSubtraction(dCutL, dYellow, k * 0.5);
        dYellow = opSmoothSubtraction(dCutR, dYellow, k * 0.5);

        // Incandescent white core: positioned lower at the combustion base
        vec2 pwWhite = vec2(p.x - waveCore * 0.65, p.y - (coreOffsetY - 0.05));
        float whiteW = flameWidth * (coreSize * 0.52);
        float whiteH = flameHeight * (coreSize * 0.75);
        float dWhite = sdFlameBody(pwWhite, whiteW, whiteH, baseCurvature);

        // Partially masked / eaten by the base arch cutter:
        if (coreBaseMask > 0.01) {
          vec2 pCoreBaseCut = vec2(pw.x - cBase.x, (pw.y - cBase.y) / max(0.1, baseCurvature));
          float dCutCoreBase = length(pCoreBaseCut) - bubbleScale * 0.95 * coreBaseMask;
          dWhite = opSmoothSubtraction(dCutCoreBase, dWhite, k * 0.6);
        }
        dWhite = opSmoothSubtraction(dCutL, dWhite, k * 0.4);
        dWhite = opSmoothSubtraction(dCutR, dWhite, k * 0.4);

        // 5. Pixel Alpha & Contour Clipping
        float aa = max(0.001, fwidth(d));
        float feather = max(aa, colorSoftness);
        float outW = enableOutline > 0.5 ? max(0.001, outlineWidth) : 0.0;

        if (d > outW) {
          discard;
        }

        float alpha = 1.0 - smoothstep(outW - aa, outW, d);

        // 6. Color Ramp Evaluation (Cel-Shading Bands & Soft Transitions)
        vec3 finalColor = bodyColor;

        // Dark Shadow band
        if (enableDark > 0.5) {
          float darkEdge = -0.01;
          float darkRange = max(0.005, feather * 1.5);
          float isDark = 1.0 - smoothstep(darkEdge - darkRange, darkEdge, d);
          finalColor = mix(finalColor, darkColor, isDark * 0.75);
        }

        // Inner Flame band (Yellow)
        if (enableInner > 0.5) {
          float innerEdge = 0.005;
          float innerRange = max(0.005, feather * 1.2);
          float isInner = 1.0 - smoothstep(innerEdge - innerRange, innerEdge, dYellow);
          finalColor = mix(finalColor, innerColor, isInner);
        }

        // Incandescent Core White band (White, lower and partially masked)
        if (enableCore > 0.5) {
          float coreEdge = 0.005;
          float coreRange = max(0.005, feather * 1.2);
          float isCoreWhite = 1.0 - smoothstep(coreEdge - coreRange, coreEdge, dWhite);
          finalColor = mix(finalColor, coreColor, isCoreWhite);
        }

        // Contour / Outline band
        if (enableOutline > 0.5) {
          float outEdge = min(feather * 0.5, outW * 0.5);
          float isOutline = smoothstep(-aa - outEdge, aa, d);
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
