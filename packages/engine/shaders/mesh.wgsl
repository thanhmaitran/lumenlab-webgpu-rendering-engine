// LumenLab mesh shader: PBR-style shading (GGX), directional shadow mapping, debug views.
// Uniform layouts are mirrored in src/renderer/layout.ts and checked by unit tests.

const PI: f32 = 3.14159265359;

struct PointLight {
  positionRange: vec4<f32>,   // xyz position, w range
  colorIntensity: vec4<f32>,  // rgb colour * intensity
};

struct Frame {
  viewProj: mat4x4<f32>,
  lightViewProj: mat4x4<f32>,
  cameraPos: vec4<f32>,
  dirLightDir: vec4<f32>,     // xyz: normalised direction the light travels
  dirLightColor: vec4<f32>,   // rgb: colour * intensity, w: 1 when the shadow map is valid
  ambient: vec4<f32>,
  background: vec4<f32>,
  params: vec4<f32>,          // x: point light count, y: mode, z: shadow texel size, w: depth bias
  depthRange: vec4<f32>,      // x: near, y: far (for the depth view)
  points: array<PointLight, 4>,
};

struct Instance {
  model: mat4x4<f32>,
  normalMat: mat4x4<f32>,
  baseColorRoughness: vec4<f32>,  // rgb base colour, w roughness
  emissiveMetalness: vec4<f32>,   // rgb emissive, w metalness
  flags: vec4<f32>,               // x: receiveShadow, y: selected, z: checker mix, w: uv scale
};

@group(0) @binding(0) var<uniform> fr: Frame;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(0) @binding(3) var albedoTex: texture_2d<f32>;
@group(0) @binding(4) var albedoSampler: sampler;
@group(1) @binding(0) var<uniform> inst: Instance;

struct VsIn {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) viewW: f32,
};

@vertex
fn vs_main(v: VsIn) -> VsOut {
  var o: VsOut;
  let world = inst.model * vec4<f32>(v.position, 1.0);
  o.worldPos = world.xyz;
  o.worldNormal = (inst.normalMat * vec4<f32>(v.normal, 0.0)).xyz;
  o.uv = v.uv;
  o.clip = fr.viewProj * world;
  o.viewW = o.clip.w;
  return o;
}

@vertex
fn vs_shadow(v: VsIn) -> @builtin(position) vec4<f32> {
  return fr.lightViewProj * inst.model * vec4<f32>(v.position, 1.0);
}

fn srgbEncode(c: vec3<f32>) -> vec3<f32> {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3<f32>(0.0031308));
}

fn tonemap(c: vec3<f32>) -> vec3<f32> {
  // Narkowicz ACES approximation.
  let a = 2.51;
  let b = 0.03;
  let cc = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((c * (a * c + b)) / (c * (cc * c + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn distributionGGX(nh: f32, alpha: f32) -> f32 {
  let a2 = alpha * alpha;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-6);
}

fn geometrySchlickGGX(nx: f32, k: f32) -> f32 {
  return nx / (nx * (1.0 - k) + k);
}

fn fresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn brdf(n: vec3<f32>, vw: vec3<f32>, l: vec3<f32>, albedo: vec3<f32>, roughness: f32, metalness: f32) -> vec3<f32> {
  let h = normalize(vw + l);
  let nl = max(dot(n, l), 0.0);
  let nv = max(dot(n, vw), 1e-4);
  let nh = max(dot(n, h), 0.0);
  let hv = max(dot(h, vw), 0.0);
  let alpha = max(roughness * roughness, 0.02);
  let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
  let f0 = mix(vec3<f32>(0.04), albedo, metalness);
  let f = fresnelSchlick(hv, f0);
  let dterm = distributionGGX(nh, alpha);
  let g = geometrySchlickGGX(nl, k) * geometrySchlickGGX(nv, k);
  let spec = (dterm * g * f) / (4.0 * nv * max(nl, 1e-4));
  let kd = (vec3<f32>(1.0) - f) * (1.0 - metalness);
  return (kd * albedo / PI + spec) * nl;
}

// 3x3 PCF over a hardware comparison sampler. textureSampleCompareLevel has no uniform-control-flow
// requirement, so early-outs are allowed.
fn shadowVisibility(worldPos: vec3<f32>, n: vec3<f32>, l: vec3<f32>) -> f32 {
  let slope = 1.0 - clamp(dot(n, -l), 0.0, 1.0);
  let offsetPos = worldPos + n * (0.01 + 0.04 * slope);
  let lp = fr.lightViewProj * vec4<f32>(offsetPos, 1.0);
  let proj = lp.xyz / lp.w;
  let uv = vec2<f32>(proj.x * 0.5 + 0.5, 0.5 - proj.y * 0.5);
  if (proj.z > 1.0 || proj.z < 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 1.0;
  }
  var sum = 0.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let o = vec2<f32>(f32(x), f32(y)) * fr.params.z;
      sum = sum + textureSampleCompareLevel(shadowMap, shadowSampler, uv + o, proj.z - fr.params.w);
    }
  }
  return sum / 9.0;
}

fn baseColorAt(uv: vec2<f32>) -> vec3<f32> {
  var base = inst.baseColorRoughness.rgb;
  let checkerMix = inst.flags.z;
  if (checkerMix > 0.0) {
    let t = textureSample(albedoTex, albedoSampler, uv * inst.flags.w).rgb;
    base = mix(base, base * t * 1.6, checkerMix);
  }
  return base;
}

@fragment
fn fs_main(f: VsOut) -> @location(0) vec4<f32> {
  let mode = i32(fr.params.y + 0.5);
  var n = normalize(f.worldNormal);
  let vw = normalize(fr.cameraPos.xyz - f.worldPos);
  // Flip for back faces is unnecessary (back-face culling), but guard degenerate normals.
  if (dot(n, n) < 0.5) { n = vec3<f32>(0.0, 1.0, 0.0); }

  if (mode == 1) {
    // Normals view: world-space normal remapped to [0, 1]. Output is written as-is (no gamma).
    return vec4<f32>(n * 0.5 + vec3<f32>(0.5), 1.0);
  }
  if (mode == 2) {
    let range = max(fr.depthRange.y - fr.depthRange.x, 1e-4);
    let d = clamp((f.viewW - fr.depthRange.x) / range, 0.0, 1.0);
    return vec4<f32>(vec3<f32>(1.0 - d), 1.0);
  }

  let albedo = baseColorAt(f.uv);
  let roughness = clamp(inst.baseColorRoughness.w, 0.04, 1.0);
  let metalness = clamp(inst.emissiveMetalness.w, 0.0, 1.0);

  var visibility = 1.0;
  let l = normalize(fr.dirLightDir.xyz);
  if (fr.dirLightColor.w > 0.5 && inst.flags.x > 0.5) {
    visibility = shadowVisibility(f.worldPos, n, l);
  }
  if (mode == 4) {
    // Shadow visualisation: lit areas white, shadowed areas blue-ish.
    let c = mix(vec3<f32>(0.08, 0.12, 0.35), vec3<f32>(0.95, 0.93, 0.85), visibility);
    return vec4<f32>(c * (0.35 + 0.65 * max(dot(n, -l), 0.0)), 1.0);
  }

  var color = albedo * fr.ambient.rgb * (1.0 - metalness * 0.8);
  color = color + brdf(n, vw, -l, albedo, roughness, metalness) * fr.dirLightColor.rgb * visibility;

  let count = i32(fr.params.x + 0.5);
  for (var i = 0; i < 4; i = i + 1) {
    if (i >= count) { break; }
    let pl = fr.points[i];
    let toLight = pl.positionRange.xyz - f.worldPos;
    let dist = length(toLight);
    let ratio = dist / max(pl.positionRange.w, 1e-3);
    let window = clamp(1.0 - ratio * ratio * ratio * ratio, 0.0, 1.0);
    let atten = window * window / (dist * dist + 1.0);
    color = color + brdf(n, vw, toLight / max(dist, 1e-4), albedo, roughness, metalness) * pl.colorIntensity.rgb * atten;
  }

  color = color + inst.emissiveMetalness.rgb;

  if (inst.flags.y > 0.5) {
    let rim = pow(1.0 - clamp(dot(n, vw), 0.0, 1.0), 3.0);
    color = color + vec3<f32>(0.95, 0.72, 0.25) * rim * 0.9;
  }
  return vec4<f32>(srgbEncode(tonemap(color)), 1.0);
}

@fragment
fn fs_wire_fill(f: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(srgbEncode(fr.background.rgb * 1.15 + vec3<f32>(0.01)), 1.0);
}

@fragment
fn fs_wire_line(f: VsOut) -> @location(0) vec4<f32> {
  var c = inst.baseColorRoughness.rgb * 0.6 + vec3<f32>(0.35);
  if (inst.flags.y > 0.5) { c = vec3<f32>(0.95, 0.72, 0.25); }
  return vec4<f32>(srgbEncode(c), 1.0);
}
