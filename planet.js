export function createPlanet(scene) {
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('moon.jpg');

    const globeGeometry = new THREE.SphereGeometry(10, 64, 64);
    const globeMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);
}
