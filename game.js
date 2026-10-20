const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 400 }, // Гравитация (снаряд будет лететь по дуге)
            debug: false
        }
    },
    scene: {
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

const tileWidth = 64;
const tileHeight = 32;
const gridCols = 12; // Сделаем карту чуть больше
const gridRows = 12;

// Сдвигаем карту выше, чтобы внизу было место для кнопок
const startX = 400;
const startY = 50;

// Функция перевода координат сетки (col, row) в экранные пиксели (x, y)
function getIsoCoords(col, row) {
    return {
        x: startX + (col - row) * (tileWidth / 2),
        y: startY + (col + row) * (tileHeight / 2)
    };
}

let hub; // Наш Хаб
let aimGraphics; // Графика для рисования прицела
let isDragging = false;

function create() {
    // 1. Рисуем сетку
    const gridGraphics = this.add.graphics();
    gridGraphics.lineStyle(2, 0x4a4a6a, 1);
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            const pos = getIsoCoords(col, row);
            drawDiamond(gridGraphics, pos.x, pos.y);
        }
    }

    // 2. Ставим Хаб в центр карты (колонка 6, ряд 6)
    const hubPos = getIsoCoords(6, 6);
    
    // Создаем контейнер для Хаба, чтобы к нему было удобно привязывать логику
    hub = this.add.circle(hubPos.x, hubPos.y, 15, 0x00aaff); 
    
    // 3. Графика для линии прицела (создаем один раз)
    aimGraphics = this.add.graphics();

    // 4. Начало прицеливания (клик)
    this.input.on('pointerdown', (pointer) => {
        isDragging = true;
    });

    // 5. Процесс прицеливания (движение мыши)
    this.input.on('pointermove', (pointer) => {
        if (!isDragging) return;
        
        // Очищаем прошлую линию
        aimGraphics.clear();
        
        // Рисуем новую линию от Хаба к курсору
        aimGraphics.lineStyle(2, 0xffff00, 1);
        aimGraphics.lineBetween(hub.x, hub.y, pointer.x, pointer.y);
        
        // Рисуем небольшой кружок на конце, чтобы было похоже на рогатку
        aimGraphics.fillStyle(0xffff00, 1);
        aimGraphics.fillCircle(pointer.x, pointer.y, 5);
    });

    // 6. Выстрел (отпускаем мышь)
    this.input.on('pointerup', (pointer) => {
        if (!isDragging) return;
        isDragging = false;
        
        // Очищаем прицел
        aimGraphics.clear();

        // Вычисляем угол и силу (натяжение как в рогатке)
        // Снаряд полетит в противоположную сторону от курсора
        const angle = Phaser.Math.Angle.Between(hub.x, hub.y, pointer.x, pointer.y);
        const distance = Phaser.Math.Distance.Between(hub.x, hub.y, pointer.x, pointer.y);
        
        // Ограничиваем силу
        const power = Math.min(distance, 200) * 4; 

        // Создаем снаряд (желтый шарик) в позиции Хаба
        const projectile = this.add.circle(hub.x, hub.y, 8, 0xffaa00);
        this.physics.add.existing(projectile);

        // Запускаем в противоположную сторону (angle + Math.PI)
        projectile.body.setVelocity(
            Math.cos(angle + Math.PI) * power,
            Math.sin(angle + Math.PI) * power
        );
        
        // Уничтожаем снаряд через 4 секунды
        this.time.delayedCall(4000, () => { projectile.destroy(); });
    });
}

function update() {
    // Здесь позже мы будем проверять, приземлился ли снаряд на сетку
}

function drawDiamond(graphics, x, y) {
    graphics.beginPath();
    graphics.moveTo(x, y - tileHeight / 2); 
    graphics.lineTo(x + tileWidth / 2, y);   
    graphics.lineTo(x, y + tileHeight / 2);  
    graphics.lineTo(x - tileWidth / 2, y);   
    graphics.closePath();
    graphics.strokePath();
}
