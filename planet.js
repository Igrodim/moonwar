export function createPlanet(scene, radius = 10) {
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('moon.jpg');

    // ОПТИМИЗАЦИЯ: Уменьшили 128x128 до 64x64. Визуально не отличить, но легче в 4 раза.
    const globeGeometry = new THREE.SphereGeometry(radius, 64, 64); 
    const globeMaterial = new THREE.MeshStandardMaterial({ map: moonTexture });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // Сетку (wireframe) вообще убрали, так как она скрыта (visible = false), но жрет память
    
    return { globe };
}
