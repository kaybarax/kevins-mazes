export function cameraTransform(camera, width, height) {
  const scale = Math.min(width / 1910, height / 1240) * camera.zoom;
  return {
    scale,
    tx: width / 2 - camera.x * scale,
    ty: height / 2 - camera.y * scale,
  };
}
export function panCamera(camera, dx, dy, scale) {
  camera.x = Math.max(100, Math.min(1880, camera.x - dx / scale));
  camera.y = Math.max(65, Math.min(1250, camera.y - dy / scale));
}
export function zoomCamera(
  camera,
  factor,
  width,
  height,
  px = width / 2,
  py = height / 2,
) {
  const before = cameraTransform(camera, width, height);
  const x = (px - before.tx) / before.scale,
    y = (py - before.ty) / before.scale;
  camera.zoom = Math.max(1, Math.min(10, camera.zoom * factor));
  const after = cameraTransform(camera, width, height);
  camera.x += x - (px - after.tx) / after.scale;
  camera.y += y - (py - after.ty) / after.scale;
}
