const formatter = new AsyncFormatter();
const scalarFields = new Set("bufferView,count,byteLength,byteOffset,byteStride,buffer,indices,material,mesh,scene,source,sampler,index,metallicFactor".split(/,/g));
const scalarObjects = new Set("attributes".split(/,/g));
const enumConstants = (() => {
  const result = new Map([
    ["POINTS", WebGLRenderingContext.POINTS],
    ["LINES", WebGLRenderingContext.LINES]
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

async function handleModelFile(/** File */ file) {
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
  while (p < length) {
    const chunkSize = view.getUint32(p, true);
    const chunkType = view.getUint32(p + 4, true);
    console.log(chunkType.toString(16), JSON.stringify(String.fromCodePoint(...new Uint8Array(view.buffer, view.byteOffset + p + 4, 4))));
    if (chunkType === 0x4e4f534a) {
      const jsonBytes = new Uint8Array(view.buffer, view.byteOffset + p + 8, chunkSize);
      const json = td.decode(jsonBytes);
      files.push(buildStructure(JSON.parse(json)));
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
    }
    p += 8 + chunkSize;
  }
}
