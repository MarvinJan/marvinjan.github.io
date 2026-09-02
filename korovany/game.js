import * as THREE from "three";

const HALF = 190;
const VILLAGE = new THREE.Vector3(-92, 0, -22);
const PALACE = new THREE.Vector3(122, 0, 16);
const CAMP = new THREE.Vector3(28, 0, 124);
const ROAD = [
  new THREE.Vector3(118, 0, 8),
  new THREE.Vector3(78, 0, 2),
  new THREE.Vector3(32, 0, -8),
  new THREE.Vector3(-18, 0, -18),
  new THREE.Vector3(-62, 0, -32),
  new THREE.Vector3(-108, 0, -48),
  new THREE.Vector3(-148, 0, -58),
];
const NEAR_3D = 20;
const FAR_2D = 46;
const MAX_DRAW = 150;
const FACTION = { elf: "elf", guard: "guard", villain: "villain" };
const COLORS = {
  elf: 0x48a84e, guard: 0x4e6ec4, villain: 0xb03440,
  tunic: { elf: 0x2a6030, guard: 0x3e4a76, villain: 0x30162c },
  skin: { elf: 0xc4b080, guard: 0xd2a884, villain: 0xa88476 },
};

class Rng {
  constructor(seed) { this.s = seed >>> 0; }
  next() { this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0; return this.s / 0x100000000; }
}

function distXz(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.hypot(dx, dz);
}
function saturate(v) { return Math.min(1, Math.max(0, v)); }
function smooth(t) { t = saturate(t); return t * t * (3 - 2 * t); }
function xz(v) { return new THREE.Vector3(v.x, 0, v.z); }

function distToSeg(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-4) return distXz(p, a);
  const t = saturate(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2);
  return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
}
function distToRoad(p) {
  let best = Infinity;
  for (let i = 0; i < ROAD.length - 1; i++) best = Math.min(best, distToSeg(p, ROAD[i], ROAD[i + 1]));
  return best;
}
function pointOnRoad(t) {
  t = saturate(t);
  const segs = [];
  let total = 0;
  for (let i = 0; i < ROAD.length - 1; i++) {
    const l = distXz(ROAD[i], ROAD[i + 1]);
    segs.push(l); total += l;
  }
  let d = t * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const u = segs[i] < 1e-3 ? 0 : d / segs[i];
      return ROAD[i].clone().lerp(ROAD[i + 1], saturate(u));
    }
    d -= segs[i];
  }
  return ROAD.at(-1).clone();
}

function makeTreeTexture(kind) {
  const c = document.createElement("canvas");
  c.width = kind === "oak" ? 160 : 128;
  c.height = kind === "oak" ? 220 : 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, c.width, c.height);
  if (kind === "pine") {
    const layers = [
      [64, 18, 28, 86, "#0c3418"],
      [64, 40, 38, 118, "#145828"],
      [64, 66, 48, 150, "#167030"],
      [64, 96, 56, 186, "#1c8038"],
    ];
    for (const [x, y, half, bot, col] of layers) {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - half, bot); g.lineTo(x + half, bot); g.fill();
    }
    g.fillStyle = "#3a2416"; g.fillRect(56, 188, 16, 62);
    g.fillStyle = "#563620"; g.fillRect(58, 186, 10, 64);
  } else if (kind === "oak") {
    g.fillStyle = "#3a2416"; g.fillRect(72, 128, 16, 86);
    g.fillStyle = "#1c461e";
    g.beginPath(); g.arc(80, 90, 58, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2c6628";
    g.beginPath(); g.arc(58, 78, 36, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3e8c34";
    g.beginPath(); g.arc(104, 82, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#4e9c3a";
    g.beginPath(); g.arc(80, 58, 32, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = "#5c543e"; g.fillRect(55, 40, 10, 170);
    g.fillStyle = "#5c4e3a"; g.fillRect(18, 70, 50, 7); g.fillRect(64, 100, 40, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function billboardMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, opacity: { value: 1 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 world = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sx = length(instanceMatrix[0].xyz);
        float sy = length(instanceMatrix[1].xyz);
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 pos = world + right * position.x * sx + up * (position.y + 0.5) * sy;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.15) discard;
        gl_FragColor = vec4(c.rgb, c.a * opacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.5, 6);
  trunk.translate(0, 1.25, 0);
  const c1 = new THREE.ConeGeometry(1.85, 3.1, 7); c1.translate(0, 2.9, 0);
  const c2 = new THREE.ConeGeometry(1.45, 3.0, 7); c2.translate(0, 3.9, 0);
  const c3 = new THREE.ConeGeometry(1.05, 3.0, 7); c3.translate(0, 4.9, 0);
  return mergeSimple([
    { g: trunk, color: 0x563620 },
    { g: c1, color: 0x0a3018 },
    { g: c2, color: 0x124e24 },
    { g: c3, color: 0x1c602a },
  ]);
}
function oakGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.1, 6); trunk.translate(0, 1.55, 0);
  const a = new THREE.SphereGeometry(1.55, 8, 6); a.translate(0, 3.6, 0);
  const b = new THREE.SphereGeometry(1.05, 7, 5); b.translate(-0.8, 3.9, 0.4);
  const c = new THREE.SphereGeometry(1.0, 7, 5); c.translate(0.75, 3.95, -0.3);
  return mergeSimple([
    { g: trunk, color: 0x563620 },
    { g: a, color: 0x1c461e },
    { g: b, color: 0x2c6628 },
    { g: c, color: 0x3a7a2e },
  ]);
}
function deadGeometry() {
  const trunk = new THREE.CylinderGeometry(0.08, 0.22, 5.4, 5); trunk.translate(0, 2.7, 0);
  const b1 = new THREE.CylinderGeometry(0.03, 0.08, 1.6, 4); b1.rotateZ(1.1); b1.translate(-0.7, 3.4, 0);
  return mergeSimple([{ g: trunk, color: 0x463e30 }, { g: b1, color: 0x463e30 }]);
}

function mergeSimple(parts) {
  const geos = [];
  for (const p of parts) {
    const g = p.g.toNonIndexed ? p.g.toNonIndexed() : p.g;
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(p.color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = geos[0];
  // sequential merge via BufferGeometryUtils isn't imported; concat manually
  return concatGeos(geos);
}
function concatGeos(geos) {
  let count = 0;
  for (const g of geos) count += g.getAttribute("position").count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const c = g.getAttribute("color");
    for (let i = 0; i < p.count; i++, o++) {
      pos[o * 3] = p.getX(i); pos[o * 3 + 1] = p.getY(i); pos[o * 3 + 2] = p.getZ(i);
      if (n) { nrm[o * 3] = n.getX(i); nrm[o * 3 + 1] = n.getY(i); nrm[o * 3 + 2] = n.getZ(i); }
      col[o * 3] = c.getX(i); col[o * 3 + 1] = c.getY(i); col[o * 3 + 2] = c.getZ(i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

class Aabb {
  constructor(cx, cz, hx, hz, pad = 0) {
    this.minx = cx - hx - pad; this.maxx = cx + hx + pad;
    this.minz = cz - hz - pad; this.maxz = cz + hz + pad;
  }
  hits(p, r) { return p.x + r > this.minx && p.x - r < this.maxx && p.z + r > this.minz && p.z - r < this.maxz; }
  push(p, r) {
    const left = p.x + r - this.minx, right = this.maxx - (p.x - r);
    const down = p.z + r - this.minz, up = this.maxz - (p.z - r);
    const m = Math.min(left, right, down, up);
    if (m === left) p.x = this.minx - r;
    else if (m === right) p.x = this.maxx + r;
    else if (m === down) p.z = this.minz - r;
    else p.z = this.maxz + r;
    return p;
  }
}

const keys = new Set();
const pressed = new Set();
const mouse = { dx: 0, dy: 0, wheel: 0, click: false };
window.addEventListener("keydown", e => {
  keys.add(e.code);
  pressed.add(e.code);
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", e => keys.delete(e.code));
window.addEventListener("mousemove", e => { mouse.dx += e.movementX; mouse.dy += e.movementY; });
window.addEventListener("mousedown", e => { if (e.button === 0) mouse.click = true; });
window.addEventListener("wheel", e => { mouse.wheel += Math.sign(-e.deltaY); }, { passive: true });

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x303e3a);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x3e4e46, 38, 155);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 280);
scene.add(new THREE.HemisphereLight(0xc8d4b4, 0x1a241c, 1.05));
const sun = new THREE.DirectionalLight(0xf0e8cc, 0.9);
sun.position.set(-40, 60, 20);
scene.add(sun);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const dummy = new THREE.Object3D();
const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const pineGeo = pineGeometry();
const oakGeo = oakGeometry();
const deadGeo = deadGeometry();
const pine3d = new THREE.InstancedMesh(pineGeo, treeMat, 140);
const oak3d = new THREE.InstancedMesh(oakGeo, treeMat, 70);
const dead3d = new THREE.InstancedMesh(deadGeo, treeMat, 40);
for (const m of [pine3d, oak3d, dead3d]) { m.frustumCulled = false; m.count = 0; scene.add(m); }

const bbPine = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), billboardMaterial(makeTreeTexture("pine")), 900);
const bbOak = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), billboardMaterial(makeTreeTexture("oak")), 400);
const bbDead = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), billboardMaterial(makeTreeTexture("dead")), 200);
for (const m of [bbPine, bbOak, bbDead]) { m.frustumCulled = false; m.count = 0; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }

const trees = [];
const hash = new Map();
function cellKey(x, z) { return `${Math.floor(x / 10)},${Math.floor(z / 10)}`; }
function canPlace(p) {
  if (distXz(p, VILLAGE) < 20) return false;
  if (distXz(p, PALACE) < 38) return false;
  if (distXz(p, CAMP) < 16) return false;
  if (distToRoad(p) < 4.6) return false;
  return true;
}
function density(p) {
  const palace = distXz(p, PALACE);
  if (palace < 55) return saturate((palace - 38) / 20) * 0.35;
  if (distXz(p, VILLAGE) < 28) return 0.2;
  return 0.55 + saturate((-p.x + 20) / 80) * 0.4;
}

(function generateForest() {
  const rng = new Rng(1337);
  for (let x = -HALF + 4; x < HALF - 4; x += 5.0) {
    for (let z = -HALF + 4; z < HALF - 4; z += 5.0) {
      const p = new THREE.Vector3(x + rng.next() * 2.6 - 1.3, 0, z + rng.next() * 2.6 - 1.3);
      if (!canPlace(p) || rng.next() > density(p)) continue;
      let kind = "pine";
      if (distXz(p, CAMP) < 48 && rng.next() < 0.72) kind = "dead";
      else if (distXz(p, VILLAGE) < 55 && rng.next() < 0.45) kind = "oak";
      else if (rng.next() > 0.82) kind = "oak";
      const scale = kind === "oak" ? 0.85 + rng.next() * 0.45 : kind === "dead" ? 0.9 + rng.next() * 0.55 : 0.95 + rng.next() * 0.7;
      const t = { pos: p, scale, kind, hash: rng.next() * 100 };
      trees.push(t);
      const k = cellKey(p.x, p.z);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(trees.length - 1);
    }
  }
})();

function resolveTrees(pos, radius) {
  const cx = Math.floor(pos.x / 10), cz = Math.floor(pos.z / 10);
  for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
    const list = hash.get(`${cx + ix},${cz + iz}`);
    if (!list) continue;
    for (const i of list) {
      const t = trees[i];
      const r = radius + 0.38 * t.scale;
      const d = distXz(pos, t.pos);
      if (d < r && d > 0.001) {
        pos.x = t.pos.x + ((pos.x - t.pos.x) / d) * r;
        pos.z = t.pos.z + ((pos.z - t.pos.z) / d) * r;
      }
    }
  }
  return pos;
}

const solids = [];
function addCabinCol(c) { solids.push(new Aabb(c.x, c.z, 3.6, 2.8, 0.25)); }
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(-7, 0, -6)));
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(8, 0, -8)));
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(-2, 0, 9)));
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(10, 0, 6)));
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(-11, 0, 3)));
addCabinCol(VILLAGE.clone().add(new THREE.Vector3(4, 0, -12)));
solids.push(new Aabb(PALACE.x, PALACE.z - 2, 10, 8, 0.4));
solids.push(new Aabb(PALACE.x - 16, PALACE.z + 8, 3.2, 3.2, 0.3));
solids.push(new Aabb(PALACE.x + 16, PALACE.z + 8, 3.2, 3.2, 0.3));
solids.push(new Aabb(PALACE.x, PALACE.z + 18, 18, 1.2, 0.2));
solids.push(new Aabb(PALACE.x - 18, PALACE.z + 6, 1.2, 14, 0.2));
solids.push(new Aabb(PALACE.x + 18, PALACE.z + 6, 1.2, 14, 0.2));
solids.push(new Aabb(CAMP.x - 5, CAMP.z + 2, 3.4, 2.6, 0.2));
solids.push(new Aabb(CAMP.x + 6, CAMP.z - 3, 3.0, 2.4, 0.2));
solids.push(new Aabb(CAMP.x + 1, CAMP.z + 7, 2.6, 2.2, 0.2));

function resolveWorld(pos, r) {
  for (const b of solids) if (b.hits(pos, r)) b.push(pos, r);
  pos.x = Math.min(HALF, Math.max(-HALF, pos.x));
  pos.z = Math.min(HALF, Math.max(-HALF, pos.z));
  pos.y = 0;
  return pos;
}

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, color, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  return m;
}

(function buildWorld() {
  scene.add(box(HALF * 2, 0.4, HALF * 2, 0x26482a, 0, -0.2, 0));
  const rng = new Rng(9);
  for (let i = 0; i < 70; i++) {
    const s = 8 + rng.next() * 14;
    scene.add(box(s, 0.04, s, i % 2 ? 0x1a3420 : 0x2c542e, (rng.next() * 2 - 1) * 170, 0.02, (rng.next() * 2 - 1) * 170));
  }
  for (let i = 0; i < ROAD.length - 1; i++) {
    const a = ROAD[i], b = ROAD[i + 1];
    const steps = Math.max(4, Math.floor(distXz(a, b) / 3.2));
    for (let s = 0; s <= steps; s++) {
      const p = a.clone().lerp(b, s / steps);
      scene.add(box(5.4, 0.1, 5.4, 0x5c442a, p.x, 0.05, p.z));
    }
  }
  const cabinAt = [[-7, -6, 18], [8, -8, -12], [-2, 9, 40], [10, 6, -55], [-11, 3, 80], [4, -12, 8]];
  for (const [x, z, yaw] of cabinAt) {
    const g = new THREE.Group();
    g.add(box(6.4, 2.7, 5.0, 0x764a28, 0, 1.35, 0));
    g.add(box(1.1, 1.8, 0.12, 0x4e301a, 2.6, 0.9, 2.56));
    const roof = new THREE.ConeGeometry(4.4, 2.4, 4);
    roof.rotateY(Math.PI / 4);
    const rm = new THREE.Mesh(roof, new THREE.MeshLambertMaterial({ color: 0x562e1c }));
    rm.position.y = 3.4;
    g.add(rm);
    g.position.copy(VILLAGE).add(new THREE.Vector3(x, 0, z));
    g.rotation.y = yaw * Math.PI / 180;
    scene.add(g);
  }
  const fire = new THREE.PointLight(0xff7a20, 12, 16);
  fire.position.copy(VILLAGE).add(new THREE.Vector3(0.5, 1.2, 0.2));
  scene.add(fire);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff8c20 })));
  scene.children.at(-1).position.copy(fire.position);

  const keep = new THREE.Group();
  keep.position.copy(PALACE);
  keep.add(box(38, 0.08, 32, 0x76766c, 0, 0.04, 4));
  keep.add(box(20, 6.8, 14, 0x94949c, 0, 3.4, -2));
  keep.add(box(8, 3.2, 8, 0x5c5c66, 0, 7.4, -2));
  keep.add(cyl(2.8, 3.3, 9, 0x94949c, -16, 4.5, 8));
  keep.add(cyl(2.8, 3.3, 9, 0x94949c, 16, 4.5, 8));
  keep.add(box(36, 4.4, 2.2, 0x5c5c66, 0, 2.2, 18));
  keep.add(box(2.2, 4.4, 26, 0x5c5c66, -18, 2.2, 6));
  keep.add(box(2.2, 4.4, 26, 0x5c5c66, 18, 2.2, 6));
  keep.add(box(5.5, 4.0, 1.4, 0x3a2416, 0, 2.0, 17.2));
  keep.add(box(1.1, 1.6, 0.08, 0x243e96, -8, 5.4, 17.4));
  keep.add(box(1.1, 1.6, 0.08, 0x243e96, 8, 5.4, 17.4));
  scene.add(keep);

  const camp = new THREE.Group();
  camp.position.copy(CAMP);
  camp.add(box(22, 0.08, 20, 0x2a201c, 0, 0.03, 0));
  for (const [x, z] of [[-5, 2], [6, -3], [1, 7]]) {
    camp.add(box(5.2, 2.2, 4.2, 0x201222, x, 1.1, z));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.0, 4), new THREE.MeshLambertMaterial({ color: 0x1c101e }));
    roof.position.set(x, 2.8, z); roof.rotation.y = Math.PI / 4;
    camp.add(roof);
  }
  camp.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1e })));
  camp.children.at(-1).position.set(0, 0.8, 0);
  camp.add(box(1.8, 1.1, 0.1, 0x941620, 0.8, 2.8, 0));
  scene.add(camp);
})();

function makeHuman(faction, isPlayer) {
  const g = new THREE.Group();
  const tunic = COLORS.tunic[faction];
  const skin = COLORS.skin[faction];
  g.add(box(0.2, 0.84, 0.2, 0x1a281c, -0.14, 0.42, 0.05));
  g.add(box(0.2, 0.84, 0.2, 0x1a281c, 0.14, 0.42, -0.05));
  g.add(box(0.56, 0.72, 0.34, tunic, 0, 1.05, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.set(0, 1.58, 0); g.add(head);
  if (faction === "elf") {
    g.add(cyl(0.01, 0.05, 0.28, skin, -0.18, 1.78, 0, 4));
    g.add(cyl(0.01, 0.05, 0.28, skin, 0.18, 1.78, 0, 4));
  } else if (faction === "guard") {
    g.add(box(0.42, 0.2, 0.42, 0xa0a4b0, 0, 1.74, 0));
    g.add(box(0.5, 0.28, 0.08, 0x243e96, 0, 1.18, 0.2));
  } else {
    g.add(cyl(0, 0.04, 0.28, 0x111, -0.16, 1.84, 0, 4));
    g.add(cyl(0, 0.04, 0.28, 0x111, 0.16, 1.84, 0, 4));
  }
  const steel = faction === "elf" ? 0xb4d296 : faction === "guard" ? 0xbec3cd : 0x782828;
  const weapon = box(0.07, 0.07, 1.15, steel, 0.38, 1.18, 0.55);
  g.add(weapon);
  if (isPlayer) {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    marker.position.set(0, 2.15, 0); g.add(marker);
  }
  scene.add(g);
  return g;
}

function spawnPos(f) {
  if (f === "elf") return VILLAGE.clone().add(new THREE.Vector3(2, 0, 4));
  if (f === "guard") return PALACE.clone().add(new THREE.Vector3(-8, 0, 6));
  return CAMP.clone().add(new THREE.Vector3(3, 0, -4));
}

let state = "select";
let faction = "elf";
let gold = 0, kills = 0;
let camYaw = 1.1, camPitch = -0.32, camDist = 8.4;
let actors = [];
let wagons = [];
let toasts = [];
let player = null;
const tmp = new THREE.Vector3();

function toast(text) { toasts.unshift({ text, age: 0 }); }
function makeActor(f, pos, isPlayer = false) {
  return {
    faction: f, pos: pos.clone(), yaw: 0, hp: isPlayer ? 140 : f === "guard" ? 115 : f === "elf" ? 85 : 100,
    maxHp: isPlayer ? 140 : f === "guard" ? 115 : f === "elf" ? 85 : 100,
    alive: true, isPlayer, speed: isPlayer ? 7.2 : 6.2, radius: 0.42,
    attackCd: 0, attackAnim: 0, patrolA: pos.clone(), patrolB: pos.clone().add(new THREE.Vector3(5, 0, -3)),
    patrolDir: 1, moving: false, mesh: makeHuman(f, isPlayer),
  };
}

function start(f) {
  faction = f;
  gold = 0; kills = 0; toasts = [];
  for (const a of actors) scene.remove(a.mesh);
  for (const w of wagons) scene.remove(w.mesh);
  actors = []; wagons = [];
  player = makeActor(f, spawnPos(f), true);
  actors.push(player);
  const spots = {
    elf: [[5, 3], [-6, 5], [3, -7], [-4, -4], [9, 1], [-8, -1], [1, 12], [-14, 8]],
    guard: [[-6, 10], [6, 10], [0, 12], [-12, 4], [12, 4], [-8, -8], [8, -8], [0, 22]],
    villain: [[4, 4], [-6, -4], [8, -6], [-3, 8], [2, -8], [-8, 3], [10, 6]],
  };
  const home = { elf: VILLAGE, guard: PALACE, villain: CAMP };
  for (const fac of ["elf", "guard", "villain"]) {
    for (const [x, z] of spots[fac]) {
      const p = home[fac].clone().add(new THREE.Vector3(x, 0, z));
      if (distXz(p, player.pos) < 2.5) continue;
      const a = makeActor(fac, p);
      a.patrolA.copy(p); a.patrolB.copy(p).add(new THREE.Vector3(6, 0, -4));
      actors.push(a);
    }
  }
  actors.push(Object.assign(makeActor("guard", ROAD[1].clone()), { patrolA: ROAD[1].clone(), patrolB: ROAD[3].clone() }));
  actors.push(Object.assign(makeActor("guard", ROAD[4].clone()), { patrolA: ROAD[2].clone(), patrolB: ROAD[5].clone() }));
  spawnWagon(0.12, 80); spawnWagon(0.55, 120);
  camYaw = f === "elf" ? 1.1 : f === "guard" ? 3.5 : 0.2;
  camPitch = -0.32; camDist = 8.4;
  state = "play";
  toast(f === "elf" ? "Чаща шепчет. Караваны идут по дороге — берите своё."
    : f === "guard" ? "Двор стоит. Лес полон клинков. Караваны должны пройти."
    : "Пусть горят дома и знамёна. Золото само приползёт.");
  show("menu", false); show("playHud", true); show("pause", false); show("dead", false);
  renderer.domElement.requestPointerLock();
}

function spawnWagon(t, gld) {
  const mesh = new THREE.Group();
  mesh.add(box(2.4, 1.5, 4.2, 0x7c562e, 0, 1.15, 0));
  mesh.add(box(2.6, 0.18, 4.4, 0x4e301a, 0, 2.05, 0));
  mesh.add(box(2.2, 1.1, 0.12, 0xd4b040, 0, 1.3, 2.2));
  mesh.add(box(0.5, 0.9, 1.4, 0x60462a, 0.45, 0.7, 3.1));
  mesh.add(box(0.5, 0.9, 1.4, 0x60462a, -0.45, 0.7, 3.1));
  scene.add(mesh);
  const pos = pointOnRoad(t);
  const ga = makeActor("guard", pos.clone().add(new THREE.Vector3(2.4, 0, 1.2)));
  const gb = makeActor("guard", pos.clone().add(new THREE.Vector3(-2.2, 0, -1)));
  actors.push(ga, gb);
  wagons.push({ t, dir: 1, gold: gld, looted: false, loot: 0, pos, yaw: 0, mesh, ga, gb });
}

function nearestEnemy(self, range) {
  let best = null, bestD = range;
  for (const o of actors) {
    if (!o.alive || o.faction === self.faction) continue;
    const d = distXz(self.pos, o.pos);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
function hurt(v, dmg, knock) {
  if (!v.alive) return;
  v.hp -= dmg;
  v.pos.add(knock);
  if (v.hp <= 0) { v.hp = 0; v.alive = false; }
}
function playerAttack(look) {
  if (!player.alive || player.attackCd > 0) return;
  player.attackCd = 0.46; player.attackAnim = 1;
  look.y = 0; if (look.lengthSq() < 1e-4) look.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  look.normalize(); player.yaw = Math.atan2(look.x, look.z);
  const before = actors.filter(a => a.alive && a.faction !== faction).length;
  for (const o of actors) {
    if (!o.alive || o.faction === player.faction) continue;
    const to = xz(o.pos.clone().sub(player.pos));
    const d = to.length();
    if (d > 2.7 || d < 0.05) continue;
    if (to.normalize().dot(look) < 0.28) continue;
    hurt(o, 28, look.clone().multiplyScalar(1.6));
  }
  const after = actors.filter(a => a.alive && a.faction !== faction).length;
  if (after < before) {
    const n = before - after;
    kills += n; gold += 12 * n;
    toast(n === 1 ? "Враг пал. +12 золота" : `Срублено ${n}. +${12 * n} золота`);
  }
}

function updateAi(dt) {
  for (const a of actors) {
    if (a.isPlayer || !a.alive) continue;
    a.attackCd = Math.max(0, a.attackCd - dt);
    a.attackAnim = Math.max(0, a.attackAnim - dt * 2.2);
    const prey = nearestEnemy(a, 24);
    let want = a.pos.clone();
    if (prey) {
      const d = distXz(a.pos, prey.pos);
      const dir = xz(prey.pos.clone().sub(a.pos)).normalize();
      a.yaw = Math.atan2(dir.x, dir.z);
      if (d > 2.05) { want.add(dir.multiplyScalar(a.speed * dt)); a.moving = true; }
      else {
        a.moving = false;
        if (a.attackCd <= 0) {
          a.attackCd = 0.7; a.attackAnim = 1;
          const push = xz(prey.pos.clone().sub(a.pos)).normalize().multiplyScalar(1.1);
          hurt(prey, a.faction === "elf" ? 14 : a.faction === "guard" ? 18 : 20, push);
        }
      }
    } else {
      const goal = a.patrolDir > 0 ? a.patrolB : a.patrolA;
      const d = distXz(a.pos, goal);
      if (d < 1.2) a.patrolDir *= -1;
      const dir = d < 0.05 ? new THREE.Vector3(0, 0, 1) : xz(goal.clone().sub(a.pos)).normalize();
      a.yaw = Math.atan2(dir.x, dir.z);
      want.add(dir.multiplyScalar(a.speed * 0.55 * dt));
      a.moving = true;
    }
    a.pos.copy(resolveWorld(resolveTrees(want, a.radius), a.radius));
  }
}

function updateWagons(dt) {
  for (const w of wagons) {
    const down = (!w.ga.alive) && (!w.gb.alive);
    if (!w.looted && !down) {
      w.t += dt * 0.018 * w.dir;
      if (w.t > 0.98) { w.t = 0.98; w.dir = -1; }
      if (w.t < 0.02) { w.t = 0.02; w.dir = 1; }
    }
    const next = pointOnRoad(Math.min(1, Math.max(0, w.t + w.dir * 0.01)));
    w.pos.copy(pointOnRoad(w.t));
    const d = xz(next.sub(w.pos));
    if (d.lengthSq() > 1e-3) w.yaw = Math.atan2(d.x, d.z);
    w.mesh.position.copy(w.pos);
    w.mesh.rotation.y = w.yaw;
    if (w.looted || faction === "guard") continue;
    const can = distXz(player.pos, w.pos) < 3.4 && down && player.alive;
    if (can && keys.has("KeyE")) {
      w.loot += dt;
      if (w.loot >= 1.6) {
        w.looted = true; w.loot = 0; gold += w.gold;
        player.hp = Math.min(player.maxHp, player.hp + 18);
        toast(`Караван ограблен! +${w.gold} золота`);
      }
    } else if (!can) w.loot = Math.max(0, w.loot - dt);
  }
}

function nearLoot() {
  if (faction === "guard") return null;
  for (const w of wagons) {
    if (w.looted) continue;
    if (!w.ga.alive && !w.gb.alive && distXz(player.pos, w.pos) < 3.4) return w;
  }
  return null;
}

function updateForest(camPos) {
  const counts = { pine: 0, oak: 0, dead: 0 };
  const d3 = { pine: 0, oak: 0, dead: 0 };
  const bb = { pine: bbPine, oak: bbOak, dead: bbDead };
  const m3 = { pine: pine3d, oak: oak3d, dead: dead3d };
  const maxBb = { pine: 900, oak: 400, dead: 200 };
  const max3 = { pine: 140, oak: 70, dead: 40 };
  const h = { pine: 8.4, oak: 7.2, dead: 8.0 };
  const w = { pine: 4.6, oak: 5.4, dead: 4.2 };
  for (const t of trees) {
    tmp.copy(t.pos).sub(camPos);
    const dist = tmp.length();
    if (dist > MAX_DRAW) continue;
    const k = saturate((FAR_2D - dist) / (FAR_2D - NEAR_3D));
    const fade = 1 - smooth(k);
    if (fade > 0.04 && counts[t.kind] < maxBb[t.kind]) {
      dummy.position.copy(t.pos);
      dummy.scale.set(w[t.kind] * t.scale, h[t.kind] * t.scale, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bb[t.kind].setMatrixAt(counts[t.kind]++, dummy.matrix);
    }
    if (k > 0.08 && d3[t.kind] < max3[t.kind]) {
      const appear = 0.42 + 0.58 * smooth(k);
      dummy.position.copy(t.pos);
      dummy.scale.setScalar(t.scale * appear);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      m3[t.kind].setMatrixAt(d3[t.kind]++, dummy.matrix);
    }
  }
  for (const k of ["pine", "oak", "dead"]) {
    bb[k].count = counts[k];
    m3[k].count = d3[k];
    bb[k].instanceMatrix.needsUpdate = true;
    m3[k].instanceMatrix.needsUpdate = true;
  }
}

function syncActors(time) {
  for (const a of actors) {
    a.mesh.position.copy(a.pos);
    if (!a.alive) {
      a.mesh.rotation.set(0, a.yaw, 1.2);
      a.mesh.position.y = 0.2;
    } else {
      a.mesh.rotation.set(0, a.yaw, 0);
      a.mesh.position.y = a.moving ? Math.sin(time * 11) * 0.05 : 0;
    }
  }
}

function show(id, on) { document.getElementById(id).style.display = on ? (id === "playHud" ? "block" : "flex") : "none"; }

const titles = { elf: "Лесные эльфы", guard: "Стража дворца", villain: "Злодей" };
const objectives = {
  elf: "Набегите на стражу и злодеев. Грабьте караваны в чаще.",
  guard: "Защитите дорогу и дворец. Не дайте эльфам и тьме пройти.",
  villain: "Сожгите покой чащи. Бейте эльфов, стражу и тащите золото.",
};

function drawHud() {
  document.getElementById("factionTitle").textContent = titles[faction];
  document.getElementById("factionTitle").style.color = faction === "elf" ? "#48a84e" : faction === "guard" ? "#4e6ec4" : "#b03440";
  document.getElementById("hpBar").style.width = `${100 * saturate(player.hp / player.maxHp)}%`;
  const lootN = wagons.filter(w => w.looted).length;
  document.getElementById("stats").textContent = `Золото  ${gold}     Убийств  ${kills}     Караваны  ${lootN}/2`;
  document.getElementById("objective").textContent = objectives[faction];
  document.getElementById("nav").textContent =
    `деревня ${distXz(player.pos, VILLAGE) | 0}м   дворец ${distXz(player.pos, PALACE) | 0}м   лагерь ${distXz(player.pos, CAMP) | 0}м`;
  const w = nearLoot();
  const pr = document.getElementById("prompt");
  if (w) {
    pr.style.display = "block";
    pr.textContent = w.loot > 0.05 ? `Грабим караван... ${w.loot / 1.6 * 100 | 0}%` : "Удерживайте E — ограбить караван";
  } else pr.style.display = "none";
  const box = document.getElementById("toasts");
  box.innerHTML = toasts.slice(0, 6).map(t => `<div style="opacity:${t.age < 0.2 ? t.age / 0.2 : saturate((4.2 - t.age) / 0.6)}">${t.text}</div>`).join("");
  const mm = document.getElementById("minimap");
  const g = mm.getContext("2d");
  g.fillStyle = "rgba(8,14,10,0.9)"; g.fillRect(0, 0, 168, 168);
  g.strokeStyle = faction === "elf" ? "#48a84e" : faction === "guard" ? "#4e6ec4" : "#b03440";
  g.strokeRect(0, 0, 168, 168);
  const dot = (p, col, s = 3) => {
    const u = saturate((p.x - player.pos.x) / 90 * 0.5 + 0.5);
    const v = saturate((p.z - player.pos.z) / 90 * 0.5 + 0.5);
    g.fillStyle = col; g.fillRect(u * 168 - s / 2, v * 168 - s / 2, s, s);
  };
  for (const t of trees) if (distXz(t.pos, player.pos) < 80) dot(t.pos, t.kind === "dead" ? "#5a5032" : "#1c4620", 2);
  dot(VILLAGE, "#5aa046", 6); dot(PALACE, "#506ec8", 6); dot(CAMP, "#b43232", 6);
  for (const wgn of wagons) dot(wgn.pos, wgn.looted ? "#666" : "#d4b040", 5);
  for (const a of actors) if (a.alive) dot(a.pos, a.isPlayer ? "#fff" : (a.faction === "elf" ? "#48a84e" : a.faction === "guard" ? "#4e6ec4" : "#b03440"), a.isPlayer ? 6 : 3);
}

document.querySelectorAll(".card").forEach(card => {
  card.addEventListener("click", () => start(card.dataset.faction));
});
window.addEventListener("keydown", e => {
  if (state === "select") {
    if (e.code === "Digit1") start("elf");
    if (e.code === "Digit2") start("guard");
    if (e.code === "Digit3") start("villain");
    if (e.code === "Enter" || e.code === "Space") start("elf");
  } else if (state === "pause") {
    if (e.code === "Escape" || e.code === "KeyP") { state = "play"; show("pause", false); renderer.domElement.requestPointerLock(); }
    if (e.code === "KeyQ") backToMenu();
  } else if (state === "dead") {
    if (e.code === "KeyR" || e.code === "Enter") backToMenu();
  } else if (state === "play") {
    if (e.code === "Escape" || e.code === "KeyP") { state = "pause"; document.exitPointerLock(); show("pause", true); }
  }
});
document.getElementById("resumeBtn").onclick = () => { state = "play"; show("pause", false); renderer.domElement.requestPointerLock(); };
document.getElementById("againBtn").onclick = backToMenu;
renderer.domElement.addEventListener("click", () => {
  if (state === "play") renderer.domElement.requestPointerLock();
});

function backToMenu() {
  state = "select";
  document.exitPointerLock();
  show("menu", true); show("playHud", false); show("pause", false); show("dead", false);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === "select") {
    camera.position.set(-70 + Math.sin(now * 0.00015) * 8, 11, 18);
    camera.lookAt(-90, 2, -20);
    updateForest(camera.position);
  } else if (state === "play" && player) {
    camYaw -= mouse.dx * 0.0032;
    camPitch = Math.min(0.18, Math.max(-1.05, camPitch - mouse.dy * 0.0032));
    camDist = Math.min(14, Math.max(5.2, camDist - mouse.wheel * 0.8));
    player.attackCd = Math.max(0, player.attackCd - dt);
    player.attackAnim = Math.max(0, player.attackAnim - dt * 2.4);
    const look = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), 0, Math.cos(camYaw) * Math.cos(camPitch)).normalize();
    const right = new THREE.Vector3().crossVectors(look, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3();
    if (keys.has("KeyW") || keys.has("ArrowUp")) move.add(look);
    if (keys.has("KeyS") || keys.has("ArrowDown")) move.sub(look);
    if (keys.has("KeyA") || keys.has("ArrowLeft")) move.sub(right);
    if (keys.has("KeyD") || keys.has("ArrowRight")) move.add(right);
    const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
    player.moving = move.lengthSq() > 0.01;
    if (player.moving && player.alive) {
      move.y = 0; move.normalize();
      const want = player.pos.clone().add(move.multiplyScalar(player.speed * (sprint ? 1.55 : 1) * dt));
      player.pos.copy(resolveWorld(resolveTrees(want, player.radius), player.radius));
      player.yaw = Math.atan2(move.x, move.z);
    }
    if (player.alive && (mouse.click || pressed.has("Space"))) playerAttack(look.clone());
    updateAi(dt);
    updateWagons(dt);
    for (const t of toasts) t.age += dt;
    toasts = toasts.filter(t => t.age < 4.2);
    if (!player.alive) { state = "dead"; document.exitPointerLock(); show("dead", true); }
    const target = player.pos.clone().add(new THREE.Vector3(0, 1.55, 0));
    camera.position.set(
      target.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
      Math.max(1.2, target.y - Math.sin(camPitch) * camDist),
      target.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
    );
    camera.lookAt(target);
    updateForest(camera.position);
    syncActors(now / 1000);
    drawHud();
  } else if (player) {
    updateForest(camera.position);
    syncActors(now / 1000);
    drawHud();
  }
  mouse.dx = mouse.dy = 0; mouse.wheel = 0; mouse.click = false;
  pressed.clear();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
