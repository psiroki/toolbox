const ON_EPSILON = 0.01;

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a, b) {
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

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function normalize(a) {
  const s = 1/Math.sqrt(lengthSquared(a));
  return Number.isFinite(s) ? v : scale(a, s);
}

function signedDistance(plane, point) {
  return dotProduct(plane, point) - plane[3];
}

class Polygon {
  constructor(verts, normal=null) {
    this.verts = Array.from(verts);
    this.normal = normal ?? normalize(crossProduct(sub(b, a), sub(c, a)));
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
        const c = add(vert, scale(sub(lastVert, vert), t));
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
