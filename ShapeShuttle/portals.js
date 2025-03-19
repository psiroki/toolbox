const ON_EPSILON = 0.01;

function vadd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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

function lengthSquared(a) {
  return a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
}

function vscale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(v) {
  const s = 1/Math.sqrt(lengthSquared(v));
  return Number.isFinite(s) ? vscale(v, s) : v;
}

function signedDistance(plane, point) {
  return dotProduct(plane, point) - plane[3];
}

class Polygon {
  constructor(verts, normal=null) {
    this.verts = Array.from(verts);
    this.normal = normal ?? normalize(crossProduct(vsub(verts[1], verts[0]), vsub(verts[2], verts[0])));
    this.plane = [...this.normal, dotProduct(this.normal, verts[0])];
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
        const c = vadd(vert, vscale(vsub(lastVert, vert), t));
        front.push(c);
        back.push(c);
      } else if (dist <= ON_EPSILON && dist >= -ON_EPSILON) {
        front.push(vert);
        back.push(vert);
      } else if (dist < -ON_EPSILON) {
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

class BSPNode {
  plane = null;
  polys = [];
  front = null;
  back = null;
  #portals = null;

  constructor() {
  }

  get portals() {
    return Array.from(this.#portals ?? []);
  }

  set portals(val) {
    this.#portals = Array.from(val);
  }

  get isLeaf() {
    return this.plane === null;
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
  let dc = null;
  let sel = null;
  for (let poly of polys) {
    let d = Math.abs(c - poly.plane[3]);
    if (dc === null || dc > d) {
      dc = d;
      sel = poly;
    }
  }
  return sel;
}

function buildNode(polys) {
  let node = new BSPNode();
  if (polys.length) {
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
    node.front = fronts.length ? buildNode(fronts) : new BSPNode();
    node.back = backs.length ? buildNode(backs) : new BSPNode();
  }
  return node;
}

function buildBSP(vertexArray, indexArray) {
  let polys = [];
  for (let i = 0; i < indexArray.length; i += 3) {
    let p = indexArray.slice(i, i + 3).map(e => vertexArray[e]);
    polys.push(new Polygon(p));
  }
  return buildNode(polys);
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
