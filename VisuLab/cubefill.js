
function cubeFill(image) {
  if (!image) image = images[images.length - 1];
  const size = image.canvas.width >> 2;
  const data = image.context.getImageData(0, 0, image.canvas.width, image.canvas.height);
  const pixels = new Uint32Array(data.data.buffer, data.data.byteOffset, data.data.length >> 2);
  const newPixels = new Uint32Array(data.width * data.width);
  const yOffset = (data.width - data.height) >> 1;
  const wordOffset = yOffset * data.width;
  newPixels.set(pixels, data.width * yOffset);
  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * y + x;
      if (x > y) {
        newPixels[target] = pixels[data.width * (size + fx) + y];
      } else {
        newPixels[target] = pixels[data.width * x + size + fy];
      }
    }
  }
  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size*2) + x;
      if (x > fy) {
        newPixels[target] = pixels[data.width * (size + x) + fy];
      } else {
        newPixels[target] = pixels[data.width * (size*2 + fx) + size + y];
      }
    }
  }

  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * y + (x + size*2);
      if (fx > y) {
        newPixels[target] = pixels[data.width * (size + x) + fy + size*2];
      } else {
        newPixels[target] = pixels[data.width * fx + y + size];
      }
    }
  }
  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size*2) + (x + size*2);
      if (x > y) {
        newPixels[target] = pixels[data.width * (size*2 + x) + fy + size];
      } else {
        newPixels[target] = pixels[data.width * (size + fx) + y + size*2];
      }
    }
  }

  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * y + (x + size*3);
      newPixels[target] = pixels[data.width * fy + fx + size];
    }
  }
  for (let y = 0; y < size; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size*2) + (x + size*3);
      newPixels[target] = pixels[data.width * (size*2 + fy) + fx + size];
    }
  }

  for (let y = 0; y < yOffset; ++y) {
    const fy = yOffset - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = data.width * y + (x + size);
      newPixels[target] = pixels[data.width * (size + fy) + fx + size*3];
    }
  }

  for (let y = 0; y < yOffset; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size * 3) + (x + size);
      newPixels[target] = pixels[data.width * (size + fy) + fx + size*3];
    }
  }

  for (let y = 0; y < yOffset; ++y) {
    const fy = yOffset - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = data.width * y + x;
      if (x > y + yOffset) {
        newPixels[target] = pixels[data.width * (size + fy) + size - 1 + size*3];
      } else {
        newPixels[target] = pixels[data.width * (size + fx)];
      }
    }
  }
  for (let y = 0; y < yOffset; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size * 3) + x;
      if (fx > y) {
        newPixels[target] = pixels[data.width * (size + x)];
      } else {
        newPixels[target] = pixels[data.width * (size + fy) + size * 3 + size - 1];
      }
    }
  }

  for (let y = 0; y < yOffset; ++y) {
    const fy = yOffset - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = data.width * y + x + size*2;
      if (fx > y + yOffset) {
        newPixels[target] = pixels[data.width * (size + fy) + size*3];
      } else {
        newPixels[target] = pixels[data.width * (size + x) + 3*size - 1];
      }
    }
  }
  for (let y = 0; y < yOffset; ++y) {
    const fy = size - 1 - y;
    for (let x = 0; x < size; ++x) {
      const fx = size - 1 - x;
      const target = wordOffset + data.width * (y + size * 3) + x + size*2;
      if (x > y) {
        newPixels[target] = pixels[data.width * (size + fx) + size * 3 - 1];
      } else {
        newPixels[target] = pixels[data.width * (size + fy) + size * 3];
      }
    }
  }
  return fromData(data.width, data.width, new Uint8ClampedArray(newPixels.buffer));
}

registerLabTool(
  "cubeFill",
  "Transforms a horizontal sword cube texture (1-3-1-1 face column layout) by filling gaps with rotated versions of adjacent faces. Ideal for skybox textures, ensuring seamless blending during mipmapping or asset creation by using relevant pixel data.",
  cubeFill
);
