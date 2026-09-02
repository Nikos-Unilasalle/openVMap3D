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
      uniform float invert;

      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      // Classic FLIR thermal palette function
      vec3 thermalPalette(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.02, 0.02, 0.1);  // Cold black-blue
        vec3 c1 = vec3(0.3, 0.0, 0.5);    // Purple
        vec3 c2 = vec3(0.9, 0.1, 0.1);    // Red
        vec3 c3 = vec3(1.0, 0.6, 0.0);    // Orange
        vec3 c4 = vec3(1.0, 0.95, 0.2);   // Yellow
        vec3 c5 = vec3(1.0, 1.0, 1.0);    // White hot

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
        float heat = NdotV * 0.7 + (sin(vWorldPos.y * heatScale + time) * 0.5 + 0.5) * 0.3;
        heat += sin(vWorldPos.x * 2.0 + vWorldPos.z * 2.0 + time * 1.5) * distortion * 0.2;
        heat = smoothstep(minTemp, maxTemp, heat);
        if (invert > 0.5) {
          heat = 1.0 - heat;
        }

        vec3 color = thermalPalette(heat);
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
      edgeIntensity: { value: 2.0 },
      interiorOpacity: { value: 0.15 },
      rimPower: { value: 2.0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float edgeIntensity;
      uniform float interiorOpacity;
      uniform float rimPower;

      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewDir);
        float NdotV = abs(dot(N, V)); // Double-sided X-Ray penetration

        // Inverted Fresnel: edges accumulate density, facing surfaces transmit
        float edge = pow(1.0 - NdotV, max(0.1, rimPower));
        float alpha = clamp(interiorOpacity + edge * edgeIntensity, 0.0, 1.0);
        vec3 finalColor = color * (1.0 + edge * 2.0);

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
      pulseSpeed: { value: 2.5 },
      pulseIntensity: { value: 1.5 },
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
      uniform float pulseSpeed;
      uniform float pulseIntensity;

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
        float fresnel = pow(1.0 - max(0.0, dot(N, V)), 2.5);

        // Hex grid
        vec4 hc = hexCoords(vUv * hexScale);
        float hexDist = max(abs(hc.x) * 1.5 + abs(hc.y) * 0.866025, abs(hc.y) * 1.7320508);
        float edge = smoothstep(0.85, 0.98, hexDist);

        // Pulsating spherical wave
        float dist = length(vWorldPos);
        float pulse = sin(dist * 3.0 - time * pulseSpeed) * 0.5 + 0.5;
        pulse = pow(pulse, 4.0) * pulseIntensity;

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
