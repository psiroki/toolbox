(s=>{s.src="portals.js";document.body.append(s);})(document.createElement("script"));
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
  constructor(accessor, attr, targetComponentType = WebGLRenderingContext.FLOAT) {
    this.componentType = accessor.componentType;
    this.rawCopy = this.componentType === targetComponentType;
    this.targetType = dataTypes.get(targetComponentType);
    this.sourceType = dataTypes.get(this.componentType);
    this.sourceDims = componentCounts.get(accessor.type);
    this.sourceSize = this.sourceType.size * this.sourceDims;
    this.targetDims = Math.min(3, this.sourceDims);
    this.targetSize = this.targetType.size * this.targetDims;
    this.accessor = accessor;
    this.attr = attr;
  }

  convert(srcView, srcOffset, dstView, dstOffset) {
    if (this.rawCopy && this.targetType.size === 4) {
      for (let i = 0; i < this.targetDims; ++i) {
        let val = srcView.getInt32(srcOffset, true);
        dstView.setInt32(dstOffset, val, true);
        srcOffset += 4;
        dstOffset += 4;
      }
    } else {
      for (let i = 0; i < this.targetDims; ++i) {
        let val = this.sourceType.read.call(srcView, srcOffset, true);
        this.targetType.write.call(dstView, dstOffset, val, true);
        srcOffset += this.sourceType.size;
        dstOffset += this.targetType.size;
      }
    }
    return [this.sourceSize, this.targetSize];
  }

  readDestination(dstView, dstOffset) {
    let values = [];
    for (let i = 0; i < this.targetDims; ++i) {
      values.push(this.targetType.read.call(dstView, dstOffset, true));
      dstOffset += this.targetType.size;
    }
    return values;
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

function pathIs(path, str) {
  let parts = str.split(/\./g);
  if (path.length !== parts.length) return false;
  return parts.every((e, i) => {
    const m = e.split(/:/g);
    const p = path[i];
    if (p.name !== m[0]) return false;
    return m.length === 1 || p.type === m[1];
  });
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
  const meshNodes = [];
  const path = [];
  let lastPathKey = null;
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
            path.push({
              name: lastPathKey ?? "",
              type: attr.replace(/Open$/, ""),
            });
            if (attr === "arrayOpen") {
              lastPathKey = 0;
            }
            const newParent = document.createElement("span");
            newParent.classList.add("selectable", "collapsible");
            parent.appendChild(newParent);
            parent = newParent;
            clickSelect(parent);
            opens.push({ type: attr, name: lastKey });
            newParent.setAttribute("data-path", path.map(e => e.name+":"+e.type).join("."));
            if (pathIs(path.slice(0, -1), ".meshes:array"))
              meshNodes.push(newParent);
          }
          if (attr === "key") {
            try {
              lastPathKey = lastKey = JSON.parse(str.toString());
            } catch (e) {
              lastKey = null;
            }
          }
          if (attr === "arrayComma") {
            ++lastPathKey;
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
            path.pop();
          }
        }
      }
    } else if (chunkType === 0x4e4942) {
      bufferBytes = chunkBodyBytes;
    }
    p += 8 + chunkSize;
  }
  let imageContainer;
  for (let image of gltf.images ?? []) {
    let mime = image.mimeType;
    if (!mime.startsWith("image/")) continue;
    let view = gltf.bufferViews[image.bufferView];
    let bytes = new Uint8Array(bufferBytes.buffer, bufferBytes.byteOffset + view.byteOffset, view.byteLength);
    let data = `data:${mime};base64,${btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(""))}`;
    let img = document.createElement("img");
    img.src = data;
    img.title = img.alt = view.name;
    if (!imageContainer) {
      imageContainer = document.createElement("div");
      infoContent.append(imageContainer);
    }
    imageContainer.append(img);
  }

  let inView = new DataView(bufferBytes.buffer, bufferBytes.byteOffset, bufferBytes.byteLength);
  const attrs = "POSITION,NORMAL,TEXCOORD_0".split(/,/g);
  for (let meshIndex = 0; meshIndex < gltf.meshes.length; ++meshIndex) {
    const mesh = gltf.meshes[meshIndex];
    if (mesh.primitives.length !== 1) throw "Unimplemented: more than 1 primitive per mesh";
    const p = mesh.primitives[0];
    const adapters = attrs.map(a => new VectorAdapter(gltf.accessors[p.attributes[a]], a));
    const indexAdapter = new VectorAdapter(gltf.accessors[p.indices], "indices", WebGLRenderingContext.UNSIGNED_SHORT);
    let vertexCount = -1;
    let stride = 0;
    for (let adapter of adapters) {
      if (vertexCount !== -1 && vertexCount !== adapter.accessor.count) {
        throw "Unexpected: count for "+adapter.attr+" is "+adapter.accessor.count+" and not "+vertexCount;
      }
      vertexCount = adapter.accessor.count;
      stride += adapter.targetSize;
    }
    const vertexBuffer = new ArrayBuffer(stride * vertexCount);
    const vbv = new DataView(vertexBuffer);
    let vbOffset = 0;
    for (let adapter of adapters) {
      let bufferView = gltf.bufferViews[adapter.accessor.bufferView];
      if (bufferView.buffer) throw "Unexpected nonzero buffer index";
      let inPos = bufferView.byteOffset;
      let vbPos = vbOffset;
      for (let i = 0; i < vertexCount; ++i) {
        const [sourceStep, targetStep] = adapter.convert(inView, inPos, vbv, vbPos);
        inPos += sourceStep;
        // we're interleaving the data, stride takes targetStep into account
        vbPos += stride;
      }
      vbOffset += adapter.targetSize;
    }
    let indexBufferView = gltf.bufferViews[indexAdapter.accessor.bufferView];

    const indexCount = indexAdapter.accessor.count;
    const indexBuffer = new ArrayBuffer(indexAdapter.targetSize * indexCount);
    const ibv = new DataView(indexBuffer);

    let srcIndexPos = indexBufferView.byteOffset;
    let dstIndexPos = 0;

    const rawIndex = new Array(indexCount);

    for (let i = 0; i < indexCount; ++i) {
      const [srcStep, dstStep] = indexAdapter.convert(inView, srcIndexPos, ibv, dstIndexPos);
      rawIndex[i] = indexAdapter.readDestination(ibv, dstIndexPos).at(0);
      srcIndexPos += srcStep;
      dstIndexPos += dstStep;
    }

    const rawVertex = new Array(vertexCount);
    vbPos = 0;
    for (let i = 0; i < vertexCount; ++i) {
      rawVertex[i] = adapters[0].readDestination(vbv, vbPos);
      vbPos += stride;
    }

    const bspRoot = buildBSP(rawVertex, rawIndex);
    console.log(bspRoot);

    const headerBuffer = new ArrayBuffer(3 * 4);
    new Uint8Array(headerBuffer).set(Array.from("MDZ0").map(s => s.charCodeAt(0)), 0);
    const hdv = new DataView(headerBuffer);
    hdv.setUint32(4, vertexCount, true);
    hdv.setUint32(8, indexCount, true);

    const createDownloadAnchor = async (blob, meshIndex, meshName, buttonBar, buttonBaseName, rawName, ext) => {
      const crc = crc32hex(new Uint8Array(await blob.arrayBuffer()));
      const saveLink = document.createElement("a");
      const name = meshName;
      saveLink.textContent = name ? buttonBaseName+" "+name : buttonBaseName;
      saveLink.href = URL.createObjectURL(blob);
      saveLink.download = rawName+"_"+crc+"."+ext;
      saveLink.classList.add("saveLink");
      buttonBar.append(saveLink);
      meshNodes[meshIndex]?.querySelector(".json_objectOpen")?.after(saveLink.cloneNode(true));
      return saveLink;
    };

    const modelBlob = new Blob([headerBuffer, vertexBuffer, indexBuffer], { type: "application/octet-stream" });
    let portalBlob = null;
    try {
      portalBlob = new Blob([exportBoundingPortals(bspRoot)], { type: "application/octet-stream" });
    } catch (e) {
      console.error(e, e.stack);
    }

    const rawName = (file?.name || "").replace(/\.[^\.]+$/, "") || "model";
    const portalRawName = rawName === "model" ? "portals" : rawName;
    const buttonBar = document.createElement("div");
    infoContent.append(buttonBar);

    createDownloadAnchor(modelBlob, meshIndex, mesh.name, buttonBar, "Save", rawName, "mdz");
    if (portalBlob)
      createDownloadAnchor(portalBlob, meshIndex, mesh.name, buttonBar, "Portals", portalRawName, "obj");

    if (vertexCount <= 25) {
      let vertices = [];
      for (let i = 0; i < vertexCount; ++i) {
        vertices.push(Array.from({length: stride>>2})
            .map((_, j) => niceFloat(vbv.getFloat32(i*stride + (j<<2), true))));
      }
      thisFile.vertices = vertices;
      thisFile.indices = Array.from({length: indexCount}).map((_, i) => ibv.getUint16(i << 1, true));
    }
  }
}

const CRC32_TABLE = (
  "00000000,77073096,ee0e612c,990951ba,076dc419,706af48f,e963a535,9e6495a3," +
	"0edb8832,79dcb8a4,e0d5e91e,97d2d988,09b64c2b,7eb17cbd,e7b82d07,90bf1d91," +
	"1db71064,6ab020f2,f3b97148,84be41de,1adad47d,6ddde4eb,f4d4b551,83d385c7," +
	"136c9856,646ba8c0,fd62f97a,8a65c9ec,14015c4f,63066cd9,fa0f3d63,8d080df5," +
	"3b6e20c8,4c69105e,d56041e4,a2677172,3c03e4d1,4b04d447,d20d85fd,a50ab56b," +
	"35b5a8fa,42b2986c,dbbbc9d6,acbcf940,32d86ce3,45df5c75,dcd60dcf,abd13d59," +
	"26d930ac,51de003a,c8d75180,bfd06116,21b4f4b5,56b3c423,cfba9599,b8bda50f," +
	"2802b89e,5f058808,c60cd9b2,b10be924,2f6f7c87,58684c11,c1611dab,b6662d3d," +
	"76dc4190,01db7106,98d220bc,efd5102a,71b18589,06b6b51f,9fbfe4a5,e8b8d433," +
	"7807c9a2,0f00f934,9609a88e,e10e9818,7f6a0dbb,086d3d2d,91646c97,e6635c01," +
	"6b6b51f4,1c6c6162,856530d8,f262004e,6c0695ed,1b01a57b,8208f4c1,f50fc457," +
	"65b0d9c6,12b7e950,8bbeb8ea,fcb9887c,62dd1ddf,15da2d49,8cd37cf3,fbd44c65," +
	"4db26158,3ab551ce,a3bc0074,d4bb30e2,4adfa541,3dd895d7,a4d1c46d,d3d6f4fb," +
	"4369e96a,346ed9fc,ad678846,da60b8d0,44042d73,33031de5,aa0a4c5f,dd0d7cc9," +
	"5005713c,270241aa,be0b1010,c90c2086,5768b525,206f85b3,b966d409,ce61e49f," +
	"5edef90e,29d9c998,b0d09822,c7d7a8b4,59b33d17,2eb40d81,b7bd5c3b,c0ba6cad," +
	"edb88320,9abfb3b6,03b6e20c,74b1d29a,ead54739,9dd277af,04db2615,73dc1683," +
	"e3630b12,94643b84,0d6d6a3e,7a6a5aa8,e40ecf0b,9309ff9d,0a00ae27,7d079eb1," +
	"f00f9344,8708a3d2,1e01f268,6906c2fe,f762575d,806567cb,196c3671,6e6b06e7," +
	"fed41b76,89d32be0,10da7a5a,67dd4acc,f9b9df6f,8ebeeff9,17b7be43,60b08ed5," +
	"d6d6a3e8,a1d1937e,38d8c2c4,4fdff252,d1bb67f1,a6bc5767,3fb506dd,48b2364b," +
	"d80d2bda,af0a1b4c,36034af6,41047a60,df60efc3,a867df55,316e8eef,4669be79," +
	"cb61b38c,bc66831a,256fd2a0,5268e236,cc0c7795,bb0b4703,220216b9,5505262f," +
	"c5ba3bbe,b2bd0b28,2bb45a92,5cb36a04,c2d7ffa7,b5d0cf31,2cd99e8b,5bdeae1d," +
	"9b64c2b0,ec63f226,756aa39c,026d930a,9c0906a9,eb0e363f,72076785,05005713," +
	"95bf4a82,e2b87a14,7bb12bae,0cb61b38,92d28e9b,e5d5be0d,7cdcefb7,0bdbdf21," +
	"86d3d2d4,f1d4e242,68ddb3f8,1fda836e,81be16cd,f6b9265b,6fb077e1,18b74777," +
	"88085ae6,ff0f6a70,66063bca,11010b5c,8f659eff,f862ae69,616bffd3,166ccf45," +
	"a00ae278,d70dd2ee,4e048354,3903b3c2,a7672661,d06016f7,4969474d,3e6e77db," +
	"aed16a4a,d9d65adc,40df0b66,37d83bf0,a9bcae53,debb9ec5,47b2cf7f,30b5ffe9," +
	"bdbdf21c,cabac28a,53b39330,24b4a3a6,bad03605,cdd70693,54de5729,23d967bf," +
	"b3667a2e,c4614ab8,5d681b02,2a6f2b94,b40bbe37,c30c8ea1,5a05df1b,2d02ef8d"
).split(",").map(e => parseInt(e, 16));

function crc32hex(byteArray) {
	let len = byteArray.length;
	let r = 0xffffffff;
	for (let i = 0; i < len; i++) {
			r = (r >> 8) ^ CRC32_TABLE[byteArray[i] ^ (r & 0x000000FF)];
			r &= 0xffffffff;
	}
	console.log("CRC: ", r.toString(16));
	let result = [];
	for (let i=0; i<8; ++i) {
		result.push(((r>>(28-i*4))&0xf).toString(16));
	}
	return result.join("");
}
