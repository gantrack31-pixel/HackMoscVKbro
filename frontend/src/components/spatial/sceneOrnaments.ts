import * as THREE from "three";

export function createSceneOrnaments(scene: THREE.Scene, enabled: boolean) {
  const orbitGroup = new THREE.Group();
  const ornaments: THREE.BufferGeometry[] = [];
  const ornamentMaterials: THREE.Material[] = [];
  if (enabled) {
    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: "#0077ff",
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const orbitGeometry = new THREE.TorusGeometry(2.75, 0.009, 4, 72);
    const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
    orbit.rotation.set(0.66, -0.18, 0.12);
    orbit.position.set(0.2, 0.05, -1.75);
    orbitGroup.add(orbit);
    const orbitAccentGeometry = new THREE.TorusGeometry(3.15, 0.006, 4, 72);
    const orbitAccent = new THREE.Mesh(orbitAccentGeometry, orbitMaterial);
    orbitAccent.rotation.set(-0.48, 0.31, -0.16);
    orbitAccent.position.set(0.2, 0.05, -2.15);
    orbitGroup.add(orbitAccent);
    const nodeGeometry = new THREE.SphereGeometry(0.035, 8, 6);
    const nodeMaterial = new THREE.MeshBasicMaterial({
      color: "#54a6ff",
      transparent: true,
      opacity: 0.7,
    });
    const nodes = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, 8);
    const nodeMatrix = new THREE.Object3D();
    for (let index = 0; index < nodes.count; index++) {
      const angle = (index / nodes.count) * Math.PI * 2;
      nodeMatrix.position.set(
        Math.cos(angle) * 2.75,
        Math.sin(angle) * 1.85,
        Math.sin(angle * 2) * 0.25,
      );
      nodeMatrix.updateMatrix();
      nodes.setMatrixAt(index, nodeMatrix.matrix);
    }
    nodes.instanceMatrix.needsUpdate = true;
    orbitGroup.add(nodes);
    scene.add(orbitGroup);
    ornaments.push(orbitGeometry, orbitAccentGeometry, nodeGeometry);
    ornamentMaterials.push(orbitMaterial, nodeMaterial);
  }
  return { orbitGroup, ornaments, ornamentMaterials };
}
