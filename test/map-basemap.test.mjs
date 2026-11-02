import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Run the actual map initialization code without starting its network/data loader.
const source = readFileSync(new URL("../docs/app.js", import.meta.url), "utf8");
assert.match(source, /\nstart\(\);\s*$/);
const appWithoutStart = source.replace(/\nstart\(\);\s*$/, "");

function initialize({ plugin = true, pluginThrows = false, maplibre = true } = {}) {
  const layers = [];
  const map = {};
  const L = {
    map: () => map,
    control: { zoom: () => ({ addTo() {} }) },
    canvas: () => ({}),
    layerGroup: () => ({ addTo() { return this; } }),
    tileLayer: (url) => ({
      addTo() { layers.push({ type: "raster", url }); return this; }
    })
  };

  if (plugin) {
    L.maplibreGL = ({ style }) => {
      if (pluginThrows) throw new Error("WebGL initialization failed");
      return {
        addTo() { layers.push({ type: "vector", style }); return this; }
      };
    };
  }

  const window = maplibre ? { maplibregl: { Map: function Map() {} } } : {};
  const context = {
    document: { querySelector: () => ({}) },
    window,
    L,
    console: { warn() {} }
  };
  vm.runInNewContext(`${appWithoutStart}\ninitializeMap();`, context);
  return layers;
}

test("OpenFreeMap initializes without a nonexistent maplibregl.supported()", () => {
  const layers = initialize();
  assert.equal(layers.length, 1);
  assert.equal(layers[0].type, "vector");
  assert.equal(layers[0].style, "https://tiles.openfreemap.org/styles/positron");
});

test("falls back to raster when the Leaflet bridge is unavailable", () => {
  const layers = initialize({ plugin: false });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].type, "raster");
});

test("falls back to raster when MapLibre is unavailable", () => {
  const layers = initialize({ maplibre: false });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].type, "raster");
});

test("falls back to raster when vector layer setup throws", () => {
  const layers = initialize({ pluginThrows: true });
  assert.equal(layers.length, 1);
  assert.equal(layers[0].type, "raster");
});
