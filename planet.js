export function createPlanet(scene, radius = 10) {
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('moon.jpg');

    // Оптимизация: 64x64 сегментов достаточно
    const globeGeometry = new THREE.SphereGeometry(radius, 64, 64); 
    
    // Оптимизация: MeshLambertMaterial в 10 раз быстрее, чем MeshStandardMaterial
    const globeMaterial = new THREE.MeshLambertMaterial({ map: moonTexture });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);
    
    return { globe };
}
