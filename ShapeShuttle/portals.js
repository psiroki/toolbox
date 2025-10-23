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

function vneg(v) {
  return [-v[0], -v[1], -v[2]];
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
  return dotProduct(plane, point) + plane[3];
}

function flipPlane(plane) {
  return [-plane[0], -plane[1], -plane[2], -plane[3]];
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

class CollisionPrimitive {
  center;
  radius;
  planes;

  constructor(planes, center, radius) {
    this.center = center;
    this.radius = radius;
    this.planes = planes;
  }

  /** Returns the flat array length in number of f32x4s */
  get flatLength() {
    return this.planes.length + 1;
  }

  buildFlatArray() {
    return [...this.center.slice(0, 3), this.radius, ...this.planes.flatMap(e => e.slice(0, 4))];
  }

  toJson() {
    return {
      "boundingSphere": [...this.center.slice(0, 3), this.radius],
      "planes": this.planes.map(e => e.slice(0, 4)),
    };
  }
}

class WavefrontExporter {
  vertLines = [];
  faceLines = [];

  addPoly(poly) {
    return this.addVerts(poly.verts);
  }

  addPolys(polys) {
    for (let poly of polys)
      this.addVerts(poly.verts);
    return this;
  }

  addVerts(verts) {
    const baseIndex = this.vertLines.length;
    this.vertLines.push(...verts.map(coords => "v "+coords.join(" ")));
    this.faceLines.push("f "+verts.map((_, i) => i + baseIndex + 1).join(" "));
    return this;
  }

  toString() {
    return this.vertLines.concat(this.faceLines).join("\n");
  }
}

class VertexSource {
  plane;
  tag;

  constructor(plane, tag) {
    this.plane = plane;
    this.tag = tag;
  }
}

class VertexSliceInfo {
  cutter;
  incidents = [];

  constructor(cutterOrCopyBase) {
    if (cutterOrCopyBase instanceof VertexSliceInfo) {
      this.cutter = cutterOrCopyBase.cutter;
      this.incidents = Array.from(cutterOrCopyBase.incidents);
    } else {
      this.cutter = cutterOrCopyBase;
    }
  }
}

class VertexIncidence {
  vertex = null;
  incidenceIndices = [];

  constructor(vertex, planes) {
    this.vertex = vertex;
    for (let i = 0; i < planes.length; ++i) {
      let p = planes[i];
      let dist = signedDistance(p, vertex);
      if (Math.abs(dist) < ON_EPSILON)
        this.incidenceIndices.push(i);
    }
  }

  toString() {
    return this.incidenceIndices.join(",");
  }
}

class Polygon {
  verts;
  normal;
  plane;

  constructor(verts, normal=null, sourcesOrFill=null) {
    let sources = Array.isArray(sourcesOrFill) ? sourcesOrFill : new Array(verts.length).fill(sourcesOrFill);
    this.verts = Array.from(verts, (vert, i) => {
      let nv = Array.from(vert);
      if (vert.source) nv.source = vert.source;
      if (sources[i]) nv.source = new VertexSliceInfo(sources[i]);
      return nv;
    });
    this.normal = normal ?? normalOf(verts[0], verts[1], verts[2]);
    this.plane = [...this.normal, -dotProduct(this.normal, verts[0])];
  }

  fillSources(source) {
    for (let vert of this.verts)
      vert.source = new VertexSliceInfo(source);
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

  slice(plane, tag = null) {
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
        if (tag) c.source = new VertexSliceInfo(new VertexSource(plane, tag));
        front.push(c);
        back.push(c);
      }
      
      if (dist <= ON_EPSILON && dist >= -ON_EPSILON) {
        let fv = vert, bv = vert;
        if (tag && vert.source) {
          fv = Array.from(vert);
          bv = Array.from(vert);
          fv.source = new VertexSliceInfo(vert.source);
          bv.source = new VertexSliceInfo(vert.source);
          fv.source.incidents.push(new VertexSource(plane, tag));
          bv.source.incidents.push(new VertexSource(plane, tag));
        }
        front.push(vert);
        back.push(vert);
      } else {
        if (dist < 0) {
          back.push(vert);
          backValid = true;
        } else {
          front.push(vert);
          frontValid = true;
        }
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
      throw new Error("Portal poly is invalid");
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
    const [fp, bp] = this.poly.slice(plane, node);
    if (fp === null && bp === null) {
      // coplanar, this is bad, I think
      throw new Error("Coplanar portal found");
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
  index = null;
  plane = null;
  polys = [];
  front = null;
  back = null;
  parent = null;
  root = null;
  #portals = null;
  solid = false;
  mins = null;
  maxs = null;

  constructor(parent = null, root = null) {
    this.parent = parent;
    this.root = root ?? this;
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

  collectPlanes(appendTo=null) {
    appendTo ??= [];
    if (this.plane) {
      appendTo.push(this.plane);
      this.front.collectPlanes(appendTo);
      this.back.collectPlanes(appendTo);
    }
    return appendTo;
  }

  createPlanePolygon() {
    let center = vscale(vadd(this.root.maxs, this.root.mins), 0.5);
    const size = vlen(vsub(this.root.maxs, this.root.mins)) * 2.0;
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
    return new Polygon(points, null, this);
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
  let cs = (max - min) * 5;
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

function calculateMinsMaxs(polys) {
  let mins = polys.reduce((prev, current) => {
    const polyMin = vmin(current.verts);
    return prev ? vmin([prev, polyMin]) : polyMin;
  }, null);
  let maxs = polys.reduce((prev, current) => {
    const polyMin = vmax(current.verts);
    return prev ? vmax([prev, polyMin]) : polyMin;
  }, null);
  return [mins, maxs];
}

function buildNode(polys, node = null, root = null) {
  node ??= new BSPNode(null, root);
  root ??= node.root;
  if (polys.length) {
    if (node === root) {
      let [mins, maxs] = calculateMinsMaxs(polys);
      node.mins = mins;
      node.maxs = maxs;
    }
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
    const frontNode = new BSPNode(node, root);
    const backNode = new BSPNode(node, root);
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
    const bbSource = new VertexSliceInfo(new VertexSource([0, 0, 0, 0], root));
    // all have node in the front and nothing in the back
    this.outerPortals = bb.map(p => {
      p.fillSources(bbSource);
      return new Portal(p, root, null);
    });
    this.outerPlanes = bb.map(e => e.plane);
    const p = this.root.portals;
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
      let front = pp.slice(outerPlane, node.root).at(0);
      if (front) {
        pp = front;
      } else {
        throw new Error("Outer plane cut away new portal");
      }
    }
    for (let n = node; n.parent; n = n.parent) {
      let parent = n.parent;
      let plane = parent.plane;
      let index = parent.front === n ? 0 : 1;
      let sliceResult = pp.slice(plane, parent);
      let remaining = sliceResult[index];
      if (remaining) {
        pp = remaining;
      } else {
        console.log(pp.plane, plane, sliceResult, pp);
        throw new Error("BSP node plane cut away new portal");
      }
    }
    const ownPortal = new Portal(pp, node.front, node.back);
    ownPortal.source = node;
    ownPortal.addToNodes();
    for (let portal of Array.from(node.portals)) {
      portal.slice(node, portal.node);
    }
    this.build(node.front);
    this.build(node.back);
  }
}

function buildPortals(root) {
  new PortalBuilder(root).build();
}

function exportCollisionModel(root) {
  let /** Array<CollisionPrimitive> */ collisionPrimitives = root.collectLeaves()
      .filter(e => e.solid)
      .map(e => generateLeafCollisionPlanes(e));
  let numPlanes = collisionPrimitives.reduce((prev, curr) => prev + curr.planes.length, 0);
  let numPrimitives = collisionPrimitives.length;
  let padding = (3 - numPrimitives) & 3;
  // Allocate a buffer of the correct size
  const buffer = new ArrayBuffer(4 +  // magic
    4 + // size of numPrimitives
    4 + // size of numPlanes (overall)
    4 + // size of padding
    4 * (numPrimitives + 1) + // first plane index for each primitive and an extra entry
    4 * padding +
    4 * 4 * (numPlanes + numPrimitives) // planes (4 floats per plane),
        // and an extra float quadruplet per primitive for the bounding sphere
  );
  // Write magic: CMZ0
  new Uint8Array(buffer).set(Array.from("CMZ0").map(s => s.charCodeAt(0)), 0);
  let dv = new DataView(buffer);
  let pos = 4;
  const writeUint32s = (...values) => {
    for (let val of values.flatMap(e => Array.isArray(e) ? e : [e])) {
      dv.setUint32(pos, val, true);
      pos += 4;
    }
  };
  const writeFloat32s = (...values) => {
    for (let val of values.flatMap(e => Array.isArray(e) ? e : [e])) {
      dv.setFloat32(pos, val, true);
      pos += 4;
    }
  };
  // Write the rest of the header
  writeUint32s(numPrimitives, numPlanes, padding);
  // First primitive always starts with plane index 0
  let planeIndex = 0;
  writeUint32s(planeIndex);
  // We mark the end index of each primitive (measured in number of f32x4s)
  for (let prim of collisionPrimitives) {
    planeIndex += prim.flatLength;
    writeUint32s(planeIndex);
  }
  // Write padding number of zeros
  writeUint32s(Array(padding).fill(0));
  writeFloat32s(collisionPrimitives
    .flatMap(e => e.buildFlatArray()));
  return buffer;
}

function generateLeafCollisionPlanes(leaf, debugExporter=null) {
  // Build a separate BSP from just this leaf
  let leafRoot = buildLeafBSP(leaf);
  const leafPlanes = leafRoot.collectPlanes();
  // Collect all the vertices from the solid leaves (it should be just one).
  // Just a vertex soup.
  const effectiveLeafVerts = leafRoot.collectLeaves()
      .filter(e => e.solid)
      .flatMap(e => Array.from(e.portals))
      .flatMap(e => e.poly.verts);
  let mins = Array.from(effectiveLeafVerts[0]), maxs = Array.from(effectiveLeafVerts[0]);
  for (let vert of effectiveLeafVerts) {
    for (let i = 0; i < 3; ++i) {
      mins[i] = Math.min(mins[i], vert[i]);
      maxs[i] = Math.max(mins[i], vert[i]);
    }
  }
  let center = vscale(vadd(mins, maxs), 0.5);
  let rSq = 0;
  for (let vert of effectiveLeafVerts) {
    let d = vlenSq(vsub(vert, center));
    rSq = Math.max(d, rSq);
  }
  // Collect the vertices (vectors) that are in the incidence of 3 or more planes
  // The key is a string representation of the inciding plane indices
  // (in strictly monotonically increasing order), the value is a VertexIncidence
  // object which contains this index list as an array and the position as well.
  // The key is the vertex identity, if it overlaps
  const vertexByIdentity = new Map();
  for (let vert of effectiveLeafVerts) {
    let value = new VertexIncidence(vert, leafPlanes);
    vertexByIdentity.set(value.toString(), value);
  }
  // This is just a simple optimization: I need those plane incidences, and
  // the key will guarantee that one of them will be among them
  const vertsByPlane = new Map();
  for (let vi of vertexByIdentity.values()) {
    for (let planeIndex of vi.incidenceIndices) {
      let arr = vertsByPlane.get(planeIndex);
      if (!arr) vertsByPlane.set(planeIndex, arr = []);
      arr.push(vi);
    }
  }
  // Vertex chamfer planes
  let chamferPlanes = Array.from(vertexByIdentity.values(), vi => {
    let n = vnormalize(vi.incidenceIndices
        .map(i => leafPlanes[i])
        .reduce((prev, curr) => prev ? vadd(prev, curr) : curr, null));
    return [...n, -dotProduct(n, vi.vertex)];
  });
  let edgePairs = [];
  // Edge chamfer planes
  for (let i = 0; i < leafPlanes.length - 1; ++i) {
    let incidences = vertsByPlane.get(i);
    if (incidences) {
      for (let j = i + 1; j < leafPlanes.length; ++j) {
        for (let vi of incidences) {
          if (vi.incidenceIndices.indexOf(j) >= 0) {
            // i and j make an edge at vi
            edgePairs.push(i+","+j);
            let n = vnormalize(vadd(leafPlanes[i], leafPlanes[j]));
            let newPlane = [...n, -dotProduct(n, vi.vertex)];
            chamferPlanes.push(newPlane);
            break;
          }
        }
      }
    }
  }
  let collisionPlanes = leafPlanes.concat(chamferPlanes);
  if (debugExporter) {
    console.log("collisionPlanes", Array.from(collisionPlanes, e => Array.from(e)));
    // Export a fattened version of the leaf for now to check if it's working
    let fatPlanes = collisionPlanes.map(plane => {
      let newPlane = Array.from(plane);
      newPlane[3] -= 0.3;
      return newPlane;
    });
    console.log("fatPlanes", fatPlanes);
    let center = vscale(vadd(leafRoot.mins, leafRoot.maxs), 0.5);
    // it should be half, but we don't multiply it, so it will grow double
    let halfNewSize = vadd(vsub(leafRoot.maxs, leafRoot.mins), Array(3).fill(1));
    let chamferedRoot = buildLeafNodes(fatPlanes, vsub(center, halfNewSize), vadd(center, halfNewSize));
    buildPortals(chamferedRoot);
    const debugPolys = chamferedRoot.collectLeaves()
        .filter(e => e.solid)
        .flatMap(e => Array.from(e.portals))
        .map(e => e.poly);
    debugExporter.addPolys(debugPolys);
    console.log(debugPolys.map(poly => Array.from(poly.plane)));
    console.log(debugPolys.map(poly => poly.verts.map(v => Array.from(v.source))));
  }
  return new CollisionPrimitive(collisionPlanes, center, Math.sqrt(rSq));
}

function buildLeafBSP(leaf) {
  if (!leaf.solid) throw Error("Leaf is expected to be solid");
  let portals = Array.from(leaf.portals);
  let [mins, maxs] = calculateMinsMaxs(portals.map(e => e.poly));
  let nodesEncountered = new Set();
  let planes = [];
  for (let portal of portals) {
    let node = portal.source;
    if (nodesEncountered.has(node)) continue;
    nodesEncountered.add(node);
    // The plane should be pointing away from the solid leaf
    if (portal.front === leaf) {
      planes.push(flipPlane(node.plane));
    } else {
      planes.push(node.plane);
    }
  }
  let leafRoot = buildLeafNodes(planes, mins, maxs);
  buildPortals(leafRoot);
  return leafRoot;
}

function buildLeafNodes(planes, mins, maxs) {
  let root = null;
  let parent = null;
  let last = null;
  let index = 0;
  for (let plane of planes) {
    last = new BSPNode(parent, root);
    last.index = index++;
    last.solid = false;
    last.mins = mins;
    last.maxs = maxs;
    last.front = new BSPNode(last, root);
    last.plane = plane;
    last.front.solid = false;
    if (parent) parent.back = last;
    root ??= last;
    parent = last;
  }
  last.back = new BSPNode(last, root);
  last.back.solid = true;
  return root;
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
