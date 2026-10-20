const config = {
    type: Phaser.AUTO,
    width: 1920,  // Новое разрешение
    height: 1080, // Новое разрешение
    backgroundColor: '#1a1a2e',
    // Масштабирование под размер окна браузера
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 }, // Увеличили гравитацию, так как экран стал больше
            debug: false
        }
    },
    scene: {
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// Увеличиваем размеры тайлов под Full HD
const tileWidth = 128;
const tileHeight = 64;
const gridCols = 16;
const gridRows = 16;

// Центрируем сетку на экране 1920x1080
const startX = 960; 
const startY = 150;

function getIsoCoords(col, row) {
    return {
        x: startX + (col - row) * (tileWidth / 2),
        y: startY + (col + row) * (tileHeight / 2)
    };
}

let hub;
let aimGraphics;
let isDragging = false;

function create() {
    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(3, 0x4a4a6a, 1); // Линии сделали чуть толще
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const pos = getIsoCoords(col, row);
            drawDiamond(gridGraphics, pos.x, pos.y);
        }
    }

    // Ставим хаб в центр карты (8,8)
    const hubPos = getIsoCoords(8, 8);
    hub = this.add.circle(hubPos.x, hubPos.y, 35, 0x00aaff); // Радиус базы увеличили
    
    aimGraphics = this.add.graphics();

    this.input.on('pointerdown', (pointer) => {
        isDragging = true;
    });

    this.input.on('pointermove', (pointer) => {
        if (!isDragging) return;
        aimGraphics.clear();
        aimGraphics.lineStyle(4, 0xffff00, 1); // Линия прицела стала толще
        aimGraphics.lineBetween(hub.x, hub.y, pointer.x, pointer.y);
        
        aimGraphics.fillStyle(0xffff00, 1);
        aimGraphics.fillCircle(pointer.x, pointer.y, 10); // Точка прицела больше
    });

    this.input.on('pointerup', (pointer) => {
        if (!isDragging) return;
        isDragging = false;
        aimGraphics.clear();

        const angle = Phaser.Math.Angle.Between(hub.x, hub.y, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(hub.x, hub.y, pointer.x, pointer.y);
        
        // Увеличили максимальную силу натяжения
        const power = Math.min(distance, 500) * 4; 

        const projectile = this.add.circle(hub.x, hub.y, 20, 0xffaa00); // Снаряд больше
        this.physics.add.existing(projectile);

        projectile.body.setVelocity(
            Math.cos(angle + Math.PI) * power,
            Math.sin(angle + Math.PI) * power
        );
        
        this.time.delayedCall(4000, () => { projectile.destroy(); });
    });
}

function update() {}

function drawDiamond(graphics, x, y) {
    graphics.beginPath();
    graphics.moveTo(x, y - tileHeight / 2); 
    graphics.lineTo(x + tileWidth / 2, y);   
    graphics.lineTo(x, y + tileHeight / 2);  
    graphics.lineTo(x - tileWidth / 2, y);   
    graphics.closePath();
    graphics.strokePath();
}
