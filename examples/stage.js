// A small shared stage for the examples: renderer, sky, sun with shadows, grass.
import * as THREE from 'three';
export function stage({ ground = 60, fog = true, sky = 0x9fd0ef } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(sky); if (fog) scene.fog = new THREE.Fog(sky, 30, 90);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300); camera.position.set(0, 4, 10);
  scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6a7a4a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(12, 20, 8); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 }); scene.add(sun);
  const g = new THREE.Mesh(new THREE.CircleGeometry(ground, 64), new THREE.MeshStandardMaterial({ color: 0x7fb069, roughness: 1 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
  const resize = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  const clock = new THREE.Clock();
  return { THREE, renderer, scene, camera, sun, loop(fn) { renderer.setAnimationLoop(() => { const dt = Math.min(0.05, clock.getDelta()); fn(dt, clock.elapsedTime); renderer.render(scene, camera); }); } };
}
