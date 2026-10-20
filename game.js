const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    scene: {
        create: create
    }
};

const game = new Phaser.Game(config);

// Настройки сетки
const tileWidth = 64;
const tileHeight = 32;
const gridCols = 10;
const gridRows = 10;

function create() {
    // Графика для рисования линий
    const graphics = this.add.graphics();
    graphics.lineStyle(2, 0x4a4a6a, 1); // Тонкие серо-синие линии

    // Смещение для центрирования сетки на экране
    const startX = 400;
    const startY = 150;

    // Рисуем сетку
    for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
            // Вычисляем экранные координаты для изометрии
            const x = startX + (col - row) * (tileWidth / 2);
            const y = startY + (col + row) * (tileHeight / 2);

            // Рисуем ромб (тайл)
            drawDiamond(graphics, x, y);
        }
    }

    // Обработка кликов мыши
    this.input.on('pointerdown', function (pointer) {
        // При клике рисуем красную точку и пишем текст
        this.add.circle(pointer.x, pointer.y, 5, 0xff0000);
        console.log('Клик по экрану:', pointer.x, pointer.y);
    }, this);
}

// Функция для рисования одного изометрического ромба
function drawDiamond(graphics, x, y) {
    graphics.beginPath();
    graphics.moveTo(x, y - tileHeight / 2); // Верхняя точка
    graphics.lineTo(x + tileWidth / 2, y);   // Правая точка
    graphics.lineTo(x, y + tileHeight / 2);  // Нижняя точка
    graphics.lineTo(x - tileWidth / 2, y);   // Левая точка
    graphics.closePath();
    graphics.strokePath();
}
