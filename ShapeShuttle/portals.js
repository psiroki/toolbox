const ON_EPSILON = 0.01;

function vorigin() {
  return [0, 0, 0];
}

function vadd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vmad(a, b, f) {
  return [a[0] + f*b[0], a[1] + f*b[1], a[2] + f*b[2]];
}

function vsub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dotProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossProduct(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vlen(a) {
  return Math.sqrt(vlenSq(a));
}

function vlenSq(a) {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

function vscale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vnormalize(v) {
  const s = 1/Math.sqrt(vlenSq(v));
  return Number.isFinite(s) ? vscale(v, s) : v;
}

function vminDim(v) {
  let a = Math.abs(v[0]);
  let idx = 0;
  if (Math.abs(v[1]) < a) {
    a = Math.abs(v[1]);
    idx = 1;
  }
  if (Math.abs(v[2]) < a) {
    a = Math.abs(v[2]);
    idx = 2;
  }
  return idx;
}

function signedDistance(plane, point) {
  return dotProduct(plane, point) - plane[3];
}

function vmin(vectors) {
  if (vectors.length <= 1) return vectors[0];
  let m = Array.from(vectors[0]);
  for (let v of vectors) {
    for (let i = 0; i < 3; ++i) {
      if (v[i] < m[i]) m[i] = v[i];
    }
  }
  return m;
}

function vmax(vectors) {
  if (vectors.length <= 1) return vectors[0];
  let m = Array.from(vectors[0]);
  for (let v of vectors) {
    for (let i = 0; i < 3; ++i) {
      if (v[i] > m[i]) m[i] = v[i];
    }
  }
  return m;
}

function replaceSame(val, ifSame, valueThen) {
  return val === ifSame ? valueThen : val;
}

function normalOf(a, b, c) {
  return vnormalize(crossProduct(vsub(b, a), vsub(c, a)));
}

class Polygon {
  verts;
  normal;
  plane;

  constructor(verts, normal=null) {
    this.verts = Array.from(verts);
    this.normal = normal ?? normalOf(verts[0], verts[1], verts[2]);
    this.plane = [...this.normal, dotProduct(this.normal, verts[0])];
  }

  isValid() {
    // check if planar
    for (let vert of this.verts) {
      if (Math.abs(signedDistance(this.plane, vert)) > ON_EPSILON)
        return false;
    }
    if (vlenSq(this.normal) < 0.5)
      return false;
    return true;
  }

  isCutBy(plane) {
    let hasFront = false;
    let hasBack = false;
    for (let vert of this.verts) {
      let dist = signedDistance(plane, vert);
      if (dist < -ON_EPSILON) {
        if (hasFront)
          return true;
        hasBack = true;
      }
      if (dist > ON_EPSILON) {
        if (hasBack)
          return true;
        hasFront = true;
      }
    }
    return false;
  }

  slice(plane) {
    let front = [];
    let back = [];
    let frontValid = false;
    let backValid = false;
    let lastVert = this.verts.at(-1);
    let lastDist = signedDistance(plane, lastVert);
    for (let vert of this.verts) {
      let dist = signedDistance(plane, vert);
      if (dist < -ON_EPSILON && lastDist > ON_EPSILON ||
        dist > ON_EPSILON && lastDist < -ON_EPSILON) {
        const t = dist / (dist - lastDist);
        const c = vmad(vert, vsub(lastVert, vert), t);
        front.push(c);
        back.push(c);
      } else if (dist <= ON_EPSILON && dist >= -ON_EPSILON) {
        front.push(vert);
        back.push(vert);
      }
      if (dist < -ON_EPSILON) {
        back.push(vert);
        backValid = true;
      } else if (dist > ON_EPSILON) {
        front.push(vert);
        frontValid = true;
      }
      lastDist = dist;
      lastVert = vert;
    }
    let f = frontValid && front.length >= 3 ? new Polygon(front, this.normal) : null;
    let b = backValid && back.length >= 3 ? new Polygon(back, this.normal) : null;
    return [f, b];
  }
}

class Portal {
  poly;
  front;
  back;
  source = null;

  constructor(poly, front, back) {
    this.poly = poly;
    this.front = front;
    this.back = back;
    if (!this.poly.isValid()) {
      throw "Portal poly is invalid";
    }
  }

  otherSide(node) {
    return node === this.front
        ? this.back
        : node === this.back ? this.front : null;
  }

  slice(node) {
    const plane = node.plane;
    const frontNode = node.front;
    const backNode = node.back;
    const [fp, bp] = this.poly.slice(plane);
    if (fp === null && bp === null) {
      // coplanar, this is bad, I think
      throw "Coplanar portal found";
    }
    if (fp === null) {
      // it's in the back
      if (this.front === node) this.#changeFront(backNode);
      if (this.back === node) this.#changeBack(backNode);
      return [null, this];
    }
    if (bp === null) {
      // it's in the front
      if (this.front === node) this.#changeFront(frontNode);
      if (this.back === node) this.#changeBack(frontNode);
      return [this, null];
    }
    const frontPortal = new Portal(fp, replaceSame(this.front, node, frontNode), replaceSame(this.back, node, frontNode));
    const backPortal = new Portal(bp, replaceSame(this.front, node, backNode), replaceSame(this.back, node, backNode));
    frontPortal.source = this.source;
    backPortal.source = this.source;
    this.#removeFromNodes();
    frontPortal.#addToNodes();
    backPortal.#addToNodes();
    return [frontPortal, backPortal];
  }

  #changeFront(newFront) {
    if (this.front) this.front.portals.delete(this);
    this.front = newFront;
    this.front.portals.add(this);
  }

  #changeBack(newBack) {
    if (this.back) this.back.portals.delete(this);
    this.back = newBack;
    this.back.portals.add(this);
  }

  #removeFromNodes() {
    if (this.front) this.front.portals.delete(this);
    if (this.back) this.back.portals.delete(this);
  }

  #addToNodes() {
    if (this.front) this.front.portals.add(this);
    if (this.back) this.back.portals.add(this);
  }

  addToNodes() {
    this.#addToNodes();
  }
}

class BSPNode {
  plane = null;
  polys = [];
  front = null;
  back = null;
  parent = null;
  #portals = null;
  solid = false;
  mins = null;
  maxs = null;

  constructor(parent = null) {
    this.parent = parent;
  }

  get portals() {
    return this.#portals ??= new Set();
  }

  set portals(val) {
    this.#portals = new Set(val);
  }

  get isLeaf() {
    return this.plane === null;
  }

  collectLeaves() {
    if (this.isLeaf) return [this];
    return this.front.collectLeaves().concat(this.back.collectLeaves());
  }

  createPlanePolygon() {
    let center = vscale(vadd(this.maxs, this.mins), 0.5);
    const size = vlen(vsub(this.maxs, this.mins)) * 2.0;
    let helper = vorigin();
    helper[vminDim(this.plane)] = 1;
    let up = vnormalize(crossProduct(this.plane, helper));
    let side = vnormalize(crossProduct(up, this.plane));
    const centerDrop = signedDistance(this.plane, center);
    center = vmad(center, this.plane, -centerDrop);
    up = vscale(up, size);
    side = vscale(side, size);
    const points = [
      vmad(vmad(center, up,  1), side, -1),
      vmad(vmad(center, up, -1), side, -1),
      vmad(vmad(center, up, -1), side,  1),
      vmad(vmad(center, up,  1), side,  1),
    ];
    return new Polygon(points);
  }

  createScaledBoundingBox(s) {
    // Calculate center point
    let center = vscale(vadd(this.maxs, this.mins), 0.5);
    
    // Calculate half-size of original box
    let halfSize = vscale(vsub(this.maxs, this.mins), 0.5);
    
    // Scale the half-size
    let scaledHalfSize = vscale(halfSize, s);
    
    // Calculate new min and max points from center and scaled half-size
    let scaledMins = vsub(center, scaledHalfSize);
    let scaledMaxs = vadd(center, scaledHalfSize);
    
    // Create the 6 faces of the box as Polygons
    let polygons = [
        // Front face (z max)
        [
            [scaledMins[0], scaledMins[1], scaledMaxs[2]],
            [scaledMaxs[0], scaledMins[1], scaledMaxs[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMaxs[2]],
            [scaledMins[0], scaledMaxs[1], scaledMaxs[2]]
        ],
        // Back face (z min)
        [
            [scaledMins[0], scaledMins[1], scaledMins[2]],
            [scaledMins[0], scaledMaxs[1], scaledMins[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMins[2]],
            [scaledMaxs[0], scaledMins[1], scaledMins[2]]
        ],
        // Top face (y max)
        [
            [scaledMins[0], scaledMaxs[1], scaledMins[2]],
            [scaledMins[0], scaledMaxs[1], scaledMaxs[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMaxs[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMins[2]]
        ],
        // Bottom face (y min)
        [
            [scaledMins[0], scaledMins[1], scaledMins[2]],
            [scaledMaxs[0], scaledMins[1], scaledMins[2]],
            [scaledMaxs[0], scaledMins[1], scaledMaxs[2]],
            [scaledMins[0], scaledMins[1], scaledMaxs[2]]
        ],
        // Right face (x max)
        [
            [scaledMaxs[0], scaledMins[1], scaledMins[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMins[2]],
            [scaledMaxs[0], scaledMaxs[1], scaledMaxs[2]],
            [scaledMaxs[0], scaledMins[1], scaledMaxs[2]]
        ],
        // Left face (x min)
        [
            [scaledMins[0], scaledMins[1], scaledMins[2]],
            [scaledMins[0], scaledMins[1], scaledMaxs[2]],
            [scaledMins[0], scaledMaxs[1], scaledMaxs[2]],
            [scaledMins[0], scaledMaxs[1], scaledMins[2]]
        ],
    ].map(points => new Polygon(points));
    
    return polygons;
  }
}

function choosePolygon(polys) {
  let min = null, max = null;
  for (let poly of polys) {
    let d = poly.plane[3];
    if (min === null || d < min) min = d;
    if (max === null || d > max) max = d;
  }
  let c = (min + max) * 0.5;
  let cs = (max - min) * 0.05;
  let dc = null;
  let sel = null;

  let lcsel = null;
  let lcc = null;
  for (let poly of polys) {
    let d = Math.abs(c - poly.plane[3]);
    if (d < cs) {
      let cutCount = 0;
      for (let other of polys) {
        if (other !== poly && other.isCutBy(poly.plane))
          ++cutCount;
      }
      if (lcc === null || lcc > cutCount) {
        lcsel = poly;
        lcc = cutCount;
      }
    }
    if (dc === null || dc > d) {
      dc = d;
      sel = poly;
    }
  }
  return lcsel ?? sel;
}

function buildNode(polys, node = null) {
  node ??= new BSPNode(null);
  if (polys.length) {
    let mins = polys.reduce((prev, current) => {
      const polyMin = vmin(current.verts);
      return prev ? vmin([prev, polyMin]) : polyMin;
    }, null);
    let maxs = polys.reduce((prev, current) => {
      const polyMin = vmax(current.verts);
      return prev ? vmax([prev, polyMin]) : polyMin;
    }, null);
    node.mins = mins;
    node.maxs = maxs;
    const sp = choosePolygon(polys);
    const plane = sp.plane;
    node.plane = plane;
    node.polys.push(sp);
    let fronts = [];
    let backs = [];
    for (let poly of polys) {
      if (poly === sp) continue;
      let [front, back] = poly.slice(plane);
      if (front === null && back === null) {
        node.polys.push(poly);
      }
      if (front) fronts.push(poly);
      if (back) backs.push(poly);
    }
    const frontNode = new BSPNode(node);
    const backNode = new BSPNode(node);
    frontNode.solid = false;
    backNode.solid = true;
    node.front = fronts.length ? buildNode(fronts, frontNode) : frontNode;
    node.back = backs.length ? buildNode(backs, backNode) : backNode;
  }
  return node;
}

class PortalBuilder {
  outerPlanes;
  outerPortals;
  root;

  constructor(root) {
    this.root = root;
    // turn it inside out, I need the polygons to point inwards
    const bb = root.createScaledBoundingBox(-1.1);
    // all have node in the front and nothing in the back
    this.outerPortals = bb.map(e => new Portal(e, root, null));
    this.outerPlanes = bb.map(e => e.plane);
    const p = this.root.portals;
    console.log(this.outerPortals);
    for (let portal of this.outerPortals)
      p.add(portal);
  }

  build(node=null) {
    node ??= this.root;
    if (node.isLeaf) return;
    const front = node.front;
    const back = node.back;
    let pp = node.createPlanePolygon();
    for (let outerPlane of this.outerPlanes) {
      let front = pp.slice(outerPlane).at(0);
      if (front) {
        pp = front;
      } else {
        throw "Outer plane cut away new portal";
      }
    }
    for (let n = node; n.parent; n = n.parent) {
      let plane = n.parent.plane;
      let index = n.parent.front === n ? 0 : 1;
      let remaining = pp.slice(plane).at(index);
      if (remaining) {
        pp = remaining;
      } else {
        throw "BSP node plane cut away new portal";
      }
    }
    const ownPortal = new Portal(pp, node.front, node.back);
    ownPortal.source = node;
    ownPortal.addToNodes();
    for (let portal of Array.from(node.portals)) {
      portal.slice(node);
    }
    this.build(node.front);
    this.build(node.back);
  }
}

function buildPortals(root) {
  new PortalBuilder(root).build();
}

function exportBoundingPortals(root) {
  let allPortals = root.collectLeaves()
      .filter(e => e.solid)
      .flatMap(e => Array.from(e.portals));
  console.log(allPortals.filter(p => !p.poly.isValid()));
  const boundingPortalVerts = allPortals.filter(e => e.front && e.back && (e.front.solid || e.back.solid))
      .map(e => e.poly.verts);
  const verts = [], faces = [];
  for (let portalVerts of boundingPortalVerts) {
    const baseIndex = verts.length;
    verts.push(...portalVerts.map(coords => "v "+coords.join(" ")));
    faces.push("f "+portalVerts.map((_, i) => i + baseIndex + 1).join(" "));
  }
  return verts.concat(faces).join("\n");
}

function buildBSP(vertexArray, indexArray) {
  let polys = [];
  for (let i = 0; i < indexArray.length; i += 3) {
    let p = indexArray.slice(i, i + 3).map(e => vertexArray[e]);
    polys.push(new Polygon(p));
  }
  let root = buildNode(polys);
  buildPortals(root);
  return root;
}

function createEdgeKey(a, b) {
  return a < b ? a+","+b : b+","+a;
}

function checkManifold(indexes) {
  let edges = new Map();
  for (let i = 0; i < indexes.length; i += 3) {
    for (let j = 0; j < 3; ++j) {
      let a = indexes[i + j];
      let b = indexes[i + (j + 1) % 3];
      let key = createEdgeKey(a, b);
      if (edges.has(key)) {
        let arr = edges.get(key);
        arr.push(i);
        if (arr.length > 2) {
          throw new Error(`Edge between vertex ${a} and ${b} is shared between more than 2 triangles`);
        }
      } else {
        edges.set(key, [i]);
      }
    }
  }
  for (let entry of edges.entries()) {
    if (entry[1].length !== 2) {
      throw new Error(`Edge between vertex ${entry[0].replace(/,/, " and ")} is shared between ${entries[1].length} triangles`);
    }
  }
}
