import { canShoot, executeShot } from './combat.js';
import { PLANET_RADIUS } from './entities.js';

export function playAITurn(gameContext) {
    const { scene, bases, currentPlayer, playerEnergy, playerGenerators, onTurnEnd, onGameOver, onGeneratorBuilt, updateUI } = gameContext;

    // Начисляем энергию ОДИН РАЗ за ход
    const minRoll = 5 + playerGenerators[currentPlayer];
    const maxRoll = 8 + playerGenerators[currentPlayer];
    playerEnergy[currentPlayer] += Math.floor(Math.random() * (maxRoll - minRoll + 1)) + minRoll;
    if (updateUI) updateUI();

    // Функция для совершения одного действия
    const makeAction = () => {
        // Если энергии нет, завершаем ход
        if (playerEnergy[currentPlayer] < 1) {
            setTimeout(onTurnEnd, 1000);
            return;
        }

        let myBases = bases.filter(b => b.owner === currentPlayer && (b.type === 'hub' || b.type === 'relay'));
        if (myBases.length === 0) {
            setTimeout(onTurnEnd, 1000);
            return;
        }

        let startBase = myBases[0];
        let module = 'bomb';
        let cost = 1;

        // Выбираем модуль, если хватает энергии
        if (playerEnergy[currentPlayer] >= 7 && Math.random() > 0.5) {
            module = 'relay'; cost = 7;
        } else if (playerEnergy[currentPlayer] >= 3) {
            module = 'homing'; cost = 3;
        }
        
        let randomAngle = Math.random() * 360;
        let check = canShoot(bases, startBase, randomAngle, module);
        
        if (check.allowed) {
            playerEnergy[currentPlayer] -= cost;
            if (updateUI) updateUI();
            
            executeShot(scene, bases, startBase, check.snappedAngle, 8, module, playerGenerators, 
                onGeneratorBuilt,
                onGameOver,
                () => {
                    // После выстрела делаем паузу и пробуем сделать еще одно действие
                    setTimeout(makeAction, 1000); 
                }
            );
        } else {
            // Если угол занят, просто завершаем ход, чтобы не зациклиться
            setTimeout(onTurnEnd, 1000);
        }
    };

    setTimeout(makeAction, 1000);
}
