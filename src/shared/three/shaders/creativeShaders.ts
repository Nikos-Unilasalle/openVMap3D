import * as THREE from "three";

// --- 1. HOLOGRAM SHADER ---
export function createHologramMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(0x00f3ff) },
      rimColor: { value: new THREE.Color(0xff00d4) },
      scanlinesFrequency: { value: 20.0 },
      scanlinesSpeed: { value: 2.0 },
      fresnelPower: { value: 2.5 },
      glitchStrength: { value: 0.05 },
      glitchFrequency: { value: 12.0 },
      flickerIntensity: { value: 0.2 },
      opacity: { value: 0.85 },
      noiseIntensity: { value: 0.15 },
      stripeSharpness: { value: 0.5 },
      enableScanlines: { value: 1.0 },
      enableGlitch: { value: 1.0 },
      enableNoise: { value: 1.0 },
      enableFlicker: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float glitchStrength;
      uniform float glitchFrequency;
      uniform float enableGlitch;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      float hash(float n) {
        return fract(sin(n) * 43758.5453123);
      }

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        
        // Random horizontal slice glitch
        if (enableGlitch > 0.5) {
          float sliceTime = floor(time * max(1.0, glitchFrequency));
          float sliceY = floor(worldPos.y * 4.0);
          float trigger = step(0.92, hash(sliceTime + sliceY * 17.3));
          float glitchOffset = (hash(sliceTime * 3.1 + sliceY) - 0.5) * 2.0 * glitchStrength * trigger;
          worldPos.x += glitchOffset;
        }

        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 color;
      uniform vec3 rimColor;
      uniform float scanlinesFrequency;
      uniform float scanlinesSpeed;
      uniform float fresnelPower;
      uniform float flickerIntensity;
      uniform float opacity;
      uniform float noiseIntensity;
      uniform float stripeSharpness;
      uniform float enableScanlines;
      uniform float enableNoise;
      uniform float enableFlicker;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);
        
        // Fresnel rim effect (silhouette glow)
        float NdotV = max(0.0, dot(normal, viewDir));
        float fresnel = pow(1.0 - NdotV, max(0.1, fresnelPower));

        // 3D world-space moving scanlines
        float scanline = 0.0;
        float fineScan = 0.0;
        if (enableScanlines > 0.5) {
          scanline = sin(vWorldPosition.y * scanlinesFrequency - time * scanlinesSpeed * 3.14159);
          scanline = smoothstep(-0.2, 0.8, scanline);
          scanline = pow(scanline, 1.0 + stripeSharpness * 3.0);
          fineScan = sin(vWorldPosition.y * scanlinesFrequency * 3.0 + time * scanlinesSpeed * 1.5) * 0.15;
        }

        // Cathode TV noise grain
        float noise = 0.0;
        if (enableNoise > 0.5) {
          noise = (fract(sin(dot(vWorldPosition.xy + time * 12.3, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * noiseIntensity;
        }

        // Subtle high-speed flicker
        float flicker = 1.0;
        if (enableFlicker > 0.5) {
          flicker = 1.0 - flickerIntensity * 0.2 * (
            sin(time * 45.0) * 0.5 + sin(time * 23.3) * 0.5
          );
        }

        // Dual-tone chromatic rim
        vec3 activeRim = mix(color, rimColor, 0.75) * (1.0 + fresnel * 1.5);
        vec3 finalColor = (activeRim * fresnel + color * (scanline * 0.7 + fineScan + 0.15)) * flicker;
        finalColor += color * noise;
        float alpha = opacity * clamp(fresnel * 1.2 + scanline * 0.4 + 0.15 + abs(noise) * 0.3, 0.0, 1.0);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- 2. LIQUID METAL SHADER ---
export function createLiquidMetalMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new THREE.Color(0xd0d8e8) },
      reflectionColor: { value: new THREE.Color(0xffffff) },
      specularColor: { value: new THREE.Color(0xffffff) },
      warpScale: { value: 2.5 },
      warpIntensity: { value: 1.0 },
      speed: { value: 0.8 },
      viscosity: { value: 1.2 },
      roughness: { value: 0.15 },
      metalness: { value: 0.8 },
      iridescence: { value: 0.3 },
      fresnelPower: { value: 3.0 },
      enableDisplacement: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      uniform float time;
      uniform float speed;
      uniform float warpScale;
      uniform float warpIntensity;
      uniform float enableDisplacement;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      // 3D Simplex-like noise helper
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i);
        vec4 p = permute(permute(permute(
                  i.z + vec4(0.0, i1.z, i2.z, 1.0))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0) * 2.0 + 1.0;
        vec4 s1 = floor(b1) * 2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m * m, vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      }

      void main() {
        vUv = uv;
        vec3 pos = position;
        float t = time * speed;

        // Multi-stage domain-warped vertex perturbation
        vec3 p = pos * warpScale + vec3(t * 0.5, t * 0.3, t * 0.4);
        vec3 q = vec3(snoise(p), snoise(p + vec3(4.3, 1.2, 7.8)), snoise(p + vec3(1.7, 8.4, 3.1)));
        float displacement = snoise(p + q * warpIntensity) * 0.12;

        if (enableDisplacement > 0.5) {
          pos += normal * displacement;
        }

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 baseColor;
      uniform vec3 reflectionColor;
      uniform vec3 specularColor;
      uniform float roughness;
      uniform float viscosity;
      uniform float fresnelPower;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        vec3 R = reflect(-V, N);

        // Pseudo-environment chrome reflections
        float sky = smoothstep(-0.2, 0.8, R.y) * 0.6 + 0.4;
        float horizon = exp(-abs(R.y) * 6.0 * viscosity) * 0.8;
        vec3 envLight = mix(baseColor, reflectionColor, sky + horizon);

        // Specular sheen
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
        vec3 H = normalize(lightDir + V);
        float NdotH = max(0.0, dot(N, H));
        float spec = pow(NdotH, (1.0 - roughness) * 128.0 + 8.0);

        // Fresnel reflection boost
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), max(0.1, fresnelPower));
        vec3 finalColor = mix(envLight, reflectionColor, fresnel * 0.7) + specularColor * spec;

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

// --- 3. CEL-SHADING & HALFTONE SHADER ---
export function createCelShadeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(0xff4444) },
      shadowColor: { value: new THREE.Color(0x1a0525) },
      halftoneDotColor: { value: new THREE.Color(0x1a0525) },
      bands: { value: 3.0 },
      bandSoftness: { value: 0.02 },
      halftone: { value: 1.0 },
      halftoneScale: { value: 8.0 },
      rimColor: { value: new THREE.Color(0xffffff) },
      rimPower: { value: 3.0 },
      specularHardness: { value: 32.0 },
      specularStrength: { value: 1.0 },
      enableHalftone: { value: 1.0 },
      enableRim: { value: 1.0 },
      enableSpecular: { value: 1.0 },
      lightDirection: { value: new THREE.Vector3(1.0, 2.0, 1.5).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      varying vec4 vScreenPos;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        vScreenPos = projectionMatrix * mvPosition;
        gl_Position = vScreenPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 shadowColor;
      uniform vec3 halftoneDotColor;
      uniform float bands;
      uniform float bandSoftness;
      uniform float halftone;
      uniform float halftoneScale;
      uniform vec3 rimColor;
      uniform float rimPower;
      uniform float specularHardness;
      uniform float specularStrength;
      uniform float enableHalftone;
      uniform float enableRim;
      uniform float enableSpecular;
      uniform vec3 lightDirection;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      varying vec4 vScreenPos;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(lightDirection);
        vec3 H = normalize(L + V);

        // Quantized lighting (Cel bands with optional softness)
        float NdotL = max(0.0, dot(N, L));
        float b = max(1.0, bands);
        float steppedLight = 0.0;
        if (bandSoftness > 0.001) {
          float scaled = NdotL * b;
          float fl = floor(scaled);
          float fr = fract(scaled);
          float smoothFr = smoothstep(0.5 - max(0.001, bandSoftness), 0.5 + max(0.001, bandSoftness), fr);
          steppedLight = (fl + smoothFr) / b;
        } else {
          steppedLight = floor(NdotL * b + 0.1) / b;
        }

        // Palette base
        vec3 shaded = mix(shadowColor, color, clamp(steppedLight, 0.0, 1.0));

        // Comic Halftone Dots in shadow transitions with fwidth antialiasing
        if (enableHalftone > 0.5 && halftone > 0.5) {
          vec2 screenCoord = (vScreenPos.xy / vScreenPos.w * 0.5 + 0.5) * vec2(800.0, 600.0);
          vec2 grid = fract(screenCoord / max(2.0, halftoneScale)) - 0.5;
          float dist = length(grid);
          float dotThreshold = (1.0 - steppedLight) * 0.45;
          float dotDelta = max(0.005, fwidth(dist) * 1.5);
          float dotAlpha = 1.0 - smoothstep(dotThreshold - dotDelta, dotThreshold + dotDelta, dist);
          shaded = mix(shaded, halftoneDotColor, dotAlpha * 0.7);
        }

        // Stepped specular glint with fwidth antialiasing
        if (enableSpecular > 0.5) {
          float NdotH = max(0.0, dot(N, H));
          float specPow = pow(NdotH, specularHardness);
          float specDelta = max(0.005, fwidth(specPow) * 1.5);
          float spec = smoothstep(0.7 - specDelta, 0.7 + specDelta, specPow) * specularStrength;
          shaded += vec3(spec * 0.9);
        }

        // Rim Light with fwidth antialiasing
        if (enableRim > 0.5) {
          float rim = pow(1.0 - max(0.0, dot(N, V)), max(0.5, rimPower));
          float rimDelta = max(0.005, fwidth(rim) * 1.5);
          float rimCut = smoothstep(0.65 - rimDelta, 0.65 + rimDelta, rim);
          shaded += rimColor * (rimCut * 0.7);
        }

        gl_FragColor = vec4(shaded, 1.0);
      }
    `,
  });
}

// --- 4. IRIDESCENT / THIN-FILM SHADER ---
export function createIridescentMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseColor: { value: new THREE.Color(0x222226) },
      specularColor: { value: new THREE.Color(0xffffff) },
      filmThickness: { value: 450.0 },
      refractiveIndex: { value: 1.45 },
      boost: { value: 1.5 },
      roughness: { value: 0.2 },
      rippleSpeed: { value: 0.5 },
      rippleFrequency: { value: 6.28 },
      rainbowMix: { value: 0.75 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 baseColor;
      uniform vec3 specularColor;
      uniform float filmThickness;
      uniform float refractiveIndex;
      uniform float boost;
      uniform float roughness;
      uniform float rippleSpeed;
      uniform float rippleFrequency;
      uniform float rainbowMix;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      // Optical thin film interference calculation
      vec3 thinFilmColor(float cosTheta, float d, float n) {
        float sin2Theta2 = (1.0 - cosTheta * cosTheta) / (n * n);
        float cosTheta2 = sqrt(max(0.0, 1.0 - sin2Theta2));
        float opd = 2.0 * n * d * cosTheta2;

        vec3 lambda = vec3(650.0, 530.0, 440.0);
        vec3 phase = 6.2831853 * opd / lambda;
        vec3 intensity = 0.5 + 0.5 * cos(phase);
        return intensity;
      }

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float cosTheta = max(0.0, dot(N, V));

        // Dynamically modulate film thickness with UVs or time ripple
        float d = filmThickness + sin(vUv.x * rippleFrequency + time * rippleSpeed) * 40.0;
        vec3 rainbow = thinFilmColor(cosTheta, d, refractiveIndex) * boost;

        // Metallic reflection highlight
        vec3 lightDir = normalize(vec3(0.6, 1.2, 0.9));
        vec3 H = normalize(lightDir + V);
        float spec = pow(max(0.0, dot(N, H)), (1.0 - roughness) * 96.0 + 8.0);

        vec3 finalColor = mix(baseColor, rainbow, clamp(rainbowMix, 0.0, 1.0)) + specularColor * (spec * 0.6);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });
}

// --- 5. WIREFRAME PULSE SHADER ---
export function createWireframePulseMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      fillColor: { value: new THREE.Color(0x06060c) },
      fillOpacity: { value: 0.3 },
      edgeColor: { value: new THREE.Color(0x00f3ff) },
      edgeWidth: { value: 1.5 },
      pulseColor: { value: new THREE.Color(0xff007f) },
      pulseSpeed: { value: 2.0 },
      pulseLength: { value: 1.2 },
      pulseFrequency: { value: 3.0 },
      glowIntensity: { value: 1.5 },
      enableFill: { value: 1.0 },
      enablePulse: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 fillColor;
      uniform float fillOpacity;
      uniform vec3 edgeColor;
      uniform float edgeWidth;
      uniform vec3 pulseColor;
      uniform float pulseSpeed;
      uniform float pulseLength;
      uniform float pulseFrequency;
      uniform float glowIntensity;
      uniform float enableFill;
      uniform float enablePulse;

      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;

      void main() {
        // High-precision screen-space UV grid wireframe
        vec2 coord = vUv * 20.0;
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
        float line = min(grid.x, grid.y);
        float isEdge = 1.0 - min(line / max(0.5, edgeWidth), 1.0);

        // Travelling spherical pulse wave
        float dist = length(vWorldPosition);
        float wavePos = mod(time * pulseSpeed, max(1.0, 10.0 / max(0.1, pulseFrequency)));
        float wave = 0.0;
        if (enablePulse > 0.5) {
          wave = smoothstep(pulseLength, 0.0, abs(dist - wavePos)) * glowIntensity;
        }

        // Active edge color
        vec3 glowingEdge = mix(edgeColor, pulseColor, clamp(wave, 0.0, 1.0));

        if (isEdge > 0.05) {
          float edgeAlpha = clamp(isEdge * (1.0 + wave * 1.5), 0.0, 1.0);
          gl_FragColor = vec4(glowingEdge * (1.2 + wave * 2.0), edgeAlpha);
        } else {
          float finalAlpha = enableFill > 0.5 ? fillOpacity : 0.0;
          gl_FragColor = vec4(fillColor, finalAlpha);
        }
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
}
