import * as tests from 'TEST_FILE_PATH';
import Bomb from './classes/Bomb';

module.exports = {
    run: async () => {
        const bomb = new Bomb();
        await bomb.runAll(tests);
    }
};
