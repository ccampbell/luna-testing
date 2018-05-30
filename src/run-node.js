import * as tests from 'TEST_FILE_PATH';
import Bomb from './classes/Luna';

module.exports = {
    run: async () => {
        const bomb = new Bomb();
        return bomb.runAll(tests);
    }
};
