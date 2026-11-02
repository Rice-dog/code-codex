/** Reuse scratch geometry: the intro moves/zooms the camera over the z=0 sea. */
export function createWaterPointerProjection(THREE, camera, worldToUv) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const surface = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  return (u, v) => {
    ndc.set(u * 2 - 1, v * 2 - 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(surface, hit) ? worldToUv(hit.x, hit.y) : {u, v};
  };
}
