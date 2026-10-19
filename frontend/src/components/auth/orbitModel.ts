import * as THREE from "three";
import { createTexture, moduleSpecs, paintBoard, paintShadow } from "./orbitArtwork";

export type OrbitModule = {
  mesh: THREE.Group;
  orbit: THREE.Vector3;
  target: THREE.Vector3;
  phase: number;
};

export type OrbitModel = {
  scene: THREE.Scene;
  board: THREE.Group;
  modules: OrbitModule[];
  dispose: () => void;
};

/** Build the presentation objects once; motion only changes their transforms. */
export function createOrbitModel(renderer: THREE.WebGLRenderer, tablet: boolean, lean: boolean): OrbitModel {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.scale.setScalar(tablet ? 0.68 : 1);
  scene.add(root);
  scene.add(new THREE.AmbientLight(0xffffff, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 3.1);
  key.position.set(-3, 5, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffa49f, 1.5);
  rim.position.set(3, -2, -2);
  scene.add(rim);

  const plane = new THREE.PlaneGeometry(1, 1);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edge = new THREE.MeshStandardMaterial({ color: "#bbc9db", roughness: 0.68, metalness: 0.08 });
  const maps: THREE.Texture[] = [];
  const materials: THREE.Material[] = [edge];

  const makeCard = (width: number, height: number, map: THREE.Texture, thickness = 0.065) => {
    maps.push(map);
    const group = new THREE.Group();
    const body = new THREE.Mesh(box, edge);
    body.scale.set(width, height, thickness);
    group.add(body);
    const faceMaterial = new THREE.MeshBasicMaterial({ map, toneMapped: false, transparent: true });
    materials.push(faceMaterial);
    const face = new THREE.Mesh(plane, faceMaterial);
    face.scale.set(width - 0.015, height - 0.015, 1);
    face.position.z = thickness / 2 + 0.002;
    group.add(face);
    return group;
  };

  const board = makeCard(5, 2.8125, createTexture(1280, 720, paintBoard), 0.12);
  board.position.y = 0.08;
  root.add(board);

  const shadowMap = createTexture(512, 320, paintShadow);
  maps.push(shadowMap);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, toneMapped: false });
  materials.push(shadowMaterial);
  const shadow = new THREE.Mesh(plane, shadowMaterial);
  shadow.scale.set(6.6, 4.05, 1);
  shadow.position.set(0, board.position.y - 0.13, -0.2);
  root.add(shadow);

  const modules = moduleSpecs
    .filter((spec) => !lean || !spec.desktopOnly)
    .map((spec) => {
      const resolution = lean ? 440 : 640;
      const map = createTexture(resolution, Math.round(resolution * spec.height / spec.width), spec.paint);
      const mesh = makeCard(spec.width, spec.height, map);
      root.add(mesh);
      return {
        mesh,
        orbit: new THREE.Vector3(...spec.orbit),
        target: new THREE.Vector3(...spec.target),
        phase: spec.phase,
      };
    });
  maps.forEach((map) => { map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); });

  return {
    scene,
    board,
    modules,
    dispose: () => {
      maps.forEach((map) => map.dispose());
      materials.forEach((material) => material.dispose());
      plane.dispose();
      box.dispose();
    },
  };
}
