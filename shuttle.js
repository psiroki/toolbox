const formatter = new AsyncFormatter();
const scalarFields = new Set("bufferView,count,byteLength,byteOffset,byteStride,buffer,indices,material,mesh,scene,source,sampler,index,metallicFactor".split(/,/g));
const scalarObjects = new Set("attributes".split(/,/g));
const componentCounts = new Map([
  ["SCALAR", 1],
  ["VEC2", 2],
  ["VEC3", 3],
  ["VEC4", 4],
  ["MAT2", 4],
  ["MAT3", 9],
  ["MAT4", 16],
]);
const dataTypes = (() => {
  const result = new Map([]);
  const SIGNED_BYTE = 5120;
  const SIGNED_SHORT = 5122;
  const raw = [
    [SIGNED_BYTE, "Int8", 1],
    [WebGLRenderingContext.UNSIGNED_BYTE, "Uint8", 1],
    [SIGNED_SHORT, "Int16", 2],
    [WebGLRenderingContext.UNSIGNED_SHORT, "Uint16", 2],
    [WebGLRenderingContext.UNSIGNED_INT, "Uint32", 4],
    [WebGLRenderingContext.FLOAT, "Float32", 4, WebGLRenderingContext.UNSIGNED_INT],
  ];
  for (let e of raw) {
    let type = e[0];
    result.set(type, {
      type,
      read: DataView.prototype["get"+e[1]],
      write: DataView.prototype["set"+e[1]],
      size: e[2],
      raw: e.length > 3 ? result.get(e[3]) : null,
    });
  }
  return result;
})();
const enumConstants = (() => {
  const result = new Map([
    ["POINTS", WebGLRenderingContext.POINTS],
    ["LINES", WebGLRenderingContext.LINES],
    ["SIGNED_BYTE", 5120],
    ["SIGNED_SHORT", 5122],
  ]);
  for (let entry of Object.entries(WebGLRenderingContext)) {
    result.set(entry[1], entry[0]);
  }
  result.set(WebGLRenderingContext.POINTS, "POINTS");
  result.set(WebGLRenderingContext.LINES, "LINES");
  return result;
})();

function isNumber(val) {
  return typeof val === "number" && !Number.isNaN(val);
}

const files = [];

function niceFloat(f) {
  return Math.abs(f) < 1e-40 ? 0 : f;
}

class VectorAdapter {
  constructor(accessor, attr) {
    this.componentType = accessor.componentType;
    this.rawCopy = this.componentType === WebGLRenderingContext.FLOAT;
    this.dataType = dataTypes.get(this.componentType);
    this.type = accessor.type;
    this.componentCount = componentCounts.get(this.type);
    this.size = this.dataType.size * this.componentCount;
    this.dims = this.componentCount <= 2 ? 2 : 3;
    this.targetSize = 4 * this.dims;
    if (this.componentCount < 2) throw "Unexpected scalar";
    this.accessor = accessor;
    this.attr = attr;
  }

  convert(srcView, srcOffset, dstView, dstOffset) {
    if (this.rawCopy) {
      for (let i = 0; i < this.dims; ++i) {
        let val = srcView.getInt32(srcOffset, true);
        dstView.setInt32(dstOffset, val, true);
        srcOffset += 4;
        dstOffset += 4;
      }
    } else {
      // It's unlikely this will ever be needed
      throw "Unimplemented: non-float vector types";
    }
    return [this.size, this.targetSize];
  }
};

function clickSelect(element) {
  let lastDown = 0;
  element.addEventListener("mouseenter", (e) => {
    for (let element of Array.from(document.querySelectorAll(".selectable:hover.selectableHot"))) {
      element.classList.remove("selectableHot");
    }
    e.target.classList.add("selectableHot");
  });
  element.addEventListener("mouseout", (e) => {
    Array.from(document.querySelectorAll(".selectableHot"))
      .forEach(e => e.classList.remove("selectableHot"));
    let arr = Array.from(document.querySelectorAll(".selectable:hover"));
    for (let i = arr.length - 1; i >= 0; --i) {
      if (arr[i] === e.target) {
        arr.splice(i, 1);
        break;
      }
    }
    if (arr.length > 0) arr[arr.length - 1].classList.add("selectableHot")
  });
  element.addEventListener("mousedown", (e) => {
    lastDown = Date.now();
  });
  element.addEventListener("mouseup", (e) => {
    let delta = Date.now() - lastDown;
    if (delta < 500 || e.shiftKey) {
      if (!element.classList.contains("collapsible") || e.shiftKey) {
        let r = document.createRange();
        r.selectNodeContents(element);
        let s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      } else {
        element.classList.toggle("collapsed");
      }
      e.stopPropagation();
    }
  });
}

const primitive = new Set(["padding", "indent"]);

function buildStructure(gltf) {
  let result = {};
  result.gltf = gltf;
  let bufferViews = structuredClone(gltf.bufferViews);
  bufferViews.forEach(bv => bv.buffer = gltf.buffers[bv.buffer]);
  let accessors = structuredClone(gltf.accessors);
  accessors.forEach(acc => acc.bufferView = bufferViews[acc.bufferView]);
  let meshes = gltf.meshes.map(mesh => {
    let newMesh = structuredClone(mesh);
    for (let p of newMesh.primitives) {
      if (isNumber(p.indices)) p.indices = accessors[p.indices];
      let va = p.attributes;
      for (let attr in va) {
        if (isNumber(va[attr])) va[attr] = accessors[va[attr]];
      }
      p.material = gltf.materials[p.material];
    }
    return newMesh;
  });
  result.allNodes = gltf.nodes.map(node => {
    let newNode = structuredClone(node);
    if (isNumber(node.mesh)) newNode.mesh = meshes[node.mesh];
    return newNode;
  });
  return result;
}

async function handleModelFile(file) {
  const view = new DataView(await file.arrayBuffer());
  if (view.getUint32(0, true) !== 0x46546c67) {
    return appendInfo(`${file.name} doesn't seem to be a valid glTF file`);
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    return appendInfo(`${file.name} doesn't seem to be of a valid glTF version (${version})`);
  }
  const length = view.getUint32(8, true);
  let p = 12;
  let td = new TextDecoder();
  let gltf;
  let bufferBytes;
  let thisFile;
  while (p < length) {
    const chunkSize = view.getUint32(p, true);
    const chunkType = view.getUint32(p + 4, true);
    const chunkBodyBytes = new Uint8Array(view.buffer, view.byteOffset + p + 8, chunkSize);
    console.log(chunkType.toString(16), JSON.stringify(String.fromCodePoint(...new Uint8Array(view.buffer, view.byteOffset + p + 4, 4))));
    if (chunkType === 0x4e4f534a) {
      const json = td.decode(chunkBodyBytes);
      gltf = JSON.parse(json);
      files.push(thisFile = buildStructure(gltf));
      const s = await formatter.formatJson(json, { width: 120, wantAttributed: true }, { });
      if (s instanceof Array) {
        infoContent.textContent = "";
        let parent = infoContent;
        let opens = [];
        let lastKey = null;
        for (let serialized of s) {
          const str = new AttributedString(serialized);
          const attr = str.getAttribute().toString();
          if (/Open$/.test(attr)) {
            const newParent = document.createElement("span");
            newParent.classList.add("selectable", "collapsible");
            parent.appendChild(newParent);
            parent = newParent;
            clickSelect(parent);
            opens.push({ type: attr, name: lastKey });
          }
          if (attr === "key") {
            try {
              lastKey = JSON.parse(str.toString());
            } catch (e) {
              lastKey = null;
            }
          }
          const span = document.createElement("span");
          let text = str.toString();
          if (opens.at(-1)?.type?.startsWith("object") &&
              !scalarFields.has(lastKey?.toString()) &&
              !opens.some(e => scalarObjects.has(e.name)) &&
              attr === "number") {
            let num = +text;
            let name = enumConstants.get(num);
            if (name) {
              span.title = text;
              text = name;
            }
          }
          span.textContent = text;
          span.classList = "json_"+attr;
          if (!primitive.has(attr) && !/^(?:array|object)/.test(attr)) {
            // must be a scalar
            clickSelect(span);
            span.classList.add("selectable");
          }
          parent.appendChild(span);
          if (/Close$/.test(attr)) {
            parent = parent.parentNode;
            opens.pop();
          }
        }
      }
    } else if (chunkType === 0x4e4942) {
      bufferBytes = chunkBodyBytes;
    }
    p += 8 + chunkSize;
  }
  let first = true;
  for (let image of gltf.images) {
    let mime = image.mimeType;
    if (!mime.startsWith("image/")) continue;
    let view = gltf.bufferViews[image.bufferView];
    let bytes = new Uint8Array(bufferBytes.buffer, bufferBytes.byteOffset + view.byteOffset, view.byteLength);
    let data = `data:${mime};base64,${btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""))}`;
    let img = document.createElement("img");
    img.src = data;
    img.title = img.alt = view.name;
    if (first) {
      infoContent.append(document.createElement("hr"));
      first = false;
    }
    infoContent.append(img);
  }

  let inView = new DataView(bufferBytes.buffer, bufferBytes.byteOffset, bufferBytes.byteLength);
  const attrs = "POSITION,NORMAL,TEXCOORD_0".split(/,/g);
  for (let mesh of gltf.meshes) {
    if (mesh.primitives.length !== 1) throw "Unimplemented: more than 1 primitive per mesh";
    const p = mesh.primitives[0];
    const adapters = attrs.map(a => new VectorAdapter(gltf.accessors[p.attributes[a]], a));
    let count = -1;
    let stride = 0;
    for (let adapter of adapters) {
      if (count !== -1 && count !== adapter.accessor.count) {
        throw "Unexpected: count for "+adapter.attr+" is "+adapter.accessor.count+" and not "+count;
      }
      count = adapter.accessor.count;
      stride += adapter.targetSize;
    }
    const vertexBuffer = new ArrayBuffer(stride * count);
    const vbv = new DataView(vertexBuffer);
    let vbOffset = 0;
    for (let adapter of adapters) {
      let bufferView = gltf.bufferViews[adapter.accessor.bufferView];
      if (bufferView.buffer) throw "Unexpected nonzero buffer index";
      let inPos = bufferView.byteOffset;
      let vbPos = vbOffset;
      for (let i = 0; i < count; ++i) {
        const [sourceStep, targetStep] = adapter.convert(inView, inPos, vbv, vbPos);
        inPos += sourceStep;
        // we're interleaving the data, stride takes targetStep into account
        vbPos += stride;
      }
      vbOffset += adapter.targetSize;
    }
    if (count <= 25) {
      let vertices = [];
      for (let i = 0; i < count; ++i) {
        vertices.push(Array.from({length: stride>>2})
            .map((_, j) => niceFloat(vbv.getFloat32(i*stride + (j<<2), true))));
      }
      thisFile.vertices = vertices;
    }
  }
}
