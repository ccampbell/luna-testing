import * as tests from 'TEST_FILE_PATH';
import Luna from './classes/Luna';

module.exports = {
    run: async () => {
        const luna = new Luna();
        return luna.runAll(tests);
    }
};
