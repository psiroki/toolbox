const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('file-input');
const infoContent = document.getElementById('info-content');

function appendInfo(text) {
  const div = document.createElement("div");
  div.textContent = text;
  infoContent.append(text);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

['dragover', 'dragenter'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.remove('dragover');
  }, false);
});

dropArea.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;

  handleFiles(files);
}, false);

fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

dropArea.addEventListener('click', () => {
  fileInput.click();
});

function handleFiles(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.name.endsWith(".gltf") || file.name.endsWith(".glb")) {
      handleModelFile(file);
    } else {
      appendInfo("Unsupported file type: " + file.name + "\n");
    }
  }
}
