export function createPlanet(scene) {
    const textureLoader = new THREE.TextureLoader();
    // Убедись, что файл moon.jpg лежит в корне репозитория
    const moonTexture = textureLoader.load('moon.jpg');

    const globeGeometry = new THREE.SphereGeometry(10, 128, 128); 
    const globeMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // Сетка (скрыта, но она есть)
    const gridGeometry = new THREE.SphereGeometry(10.01, 128, 128); 
    const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x4a4a6a, wireframe: true, transparent: true, opacity: 0.3 });
    const gridGlobe = new THREE.Mesh(gridGeometry, gridMaterial);
    gridGlobe.visible = false; 
    scene.add(gridGlobe);
}
