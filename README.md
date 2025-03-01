# Toolbox

A collection of browser-based tools for personal experimentation and prototyping. Hosted on GitHub Pages at `psiroki.github.io/toolbox/`.

This repo contains two main tools:
- **VisuLab**: A console-driven image manipulation playground.
- **ShapeShuttle**: A glTF (.glb) file loader and extractor.

These tools are designed for quick, one-off tasks, primarily for my own use, but feel free to poke around!

## VisuLab

**Location**: `/VisuLab/`

**What it does**:  
VisuLab lets you drop or paste images into a webpage, turning them into canvases you can manipulate via the JavaScript Console. It’s built for programmatic image editing with a global `images` array and a `fromData` function for custom pixel data. Includes a "LabTools" system for extensible functionality.

**How to use**:  
1. Open `psiroki.github.io/toolbox/VisuLab/` in your browser.
2. Drop an image or paste it (Ctrl+V).
3. Open the console and play with `images[0].context` or use `fromData(width, height, pixels)`.
4. Check `tools()` for available LabTools like `cubeFill`.

**Features**:
- Supports `Uint32Array` for efficient 32-bit RGBA manipulation. The `fromData` function accepts any `TypedArray` or `DataView`, creating a `Uint8ClampedArray` view of the same buffer for the `ImageData` constructor.
- LabTools system for adding custom functions (e.g., `cubeFill` for skybox texture prep).

## ShapeShuttle

**Location**: `/ShapeShuttle/`

**What it does**:  
ShapeShuttle loads glTF (.glb) files in the browser and extracts their contents—images and meshes—into usable formats. Meshes are output in "Model Zero," a simple, custom format I made up for my own needs. It’s unstable and subject to change without notice.

**How to use**:  
1. Visit `psiroki.github.io/toolbox/ShapeShuttle/`.
2. Load a `.glb` file (supports drag-and-drop or click-to-select).
3. View the glTF JSON content with syntax highlighting and resolved enum names.
4. Extracted images are displayed and can be saved using standard browser methods.
5. Meshes can be saved via individual `Save` links, exported in Model Zero format—don’t rely on its stability.

## Notes
- These are personal tools—expect rough edges and frequent changes.
- Documentation will trail behind development.

## License
MIT—do whatever you want with it.
