import test from "node:test";
import assert from "node:assert/strict";
import { cameraTransform, panCamera, zoomCamera } from "../src/camera.js";
test("camera remains fixed independently of player movement; drag pans in screen units", () => {
  const camera = { x: 1000, y: 650, zoom: 3 },
    before = cameraTransform(camera, 800, 600);
  assert.deepEqual(cameraTransform(camera, 800, 600), before);
  panCamera(camera, 100, -50, before.scale);
  const after = cameraTransform(camera, 800, 600);
  assert.ok(Math.abs(after.tx - before.tx - 100) < 1e-8);
  assert.ok(Math.abs(after.ty - before.ty + 50) < 1e-8);
});
test("zoom anchors the point under the cursor and stays within limits", () => {
  const camera = { x: 1000, y: 650, zoom: 2 },
    before = cameraTransform(camera, 800, 600);
  const world = [
    (200 - before.tx) / before.scale,
    (150 - before.ty) / before.scale,
  ];
  zoomCamera(camera, 2, 800, 600, 200, 150);
  const after = cameraTransform(camera, 800, 600);
  assert.ok(Math.abs(world[0] * after.scale + after.tx - 200) < 1e-8);
  assert.ok(Math.abs(world[1] * after.scale + after.ty - 150) < 1e-8);
  zoomCamera(camera, 100, 800, 600);
  assert.equal(camera.zoom, 10);
  zoomCamera(camera, 0.001, 800, 600);
  assert.equal(camera.zoom, 1);
});
