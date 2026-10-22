export function createPlanet(scene, radius = 10) {
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('moon.jpg');

    const globeGeometry = new THREE.SphereGeometry(radius, 128, 128); 
    const globeMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    const gridGeometry = new THREE.SphereGeometry(radius + 0.01, 128, 128); 
    const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x4a4a6a, wireframe: true, transparent: true, opacity: 0.3 });
    const gridGlobe = new THREE.Mesh(gridGeometry, gridMaterial);
    gridGlobe.visible = false; 
    scene.add(gridGlobe);
    
    return { globe, gridGlobe };
}
