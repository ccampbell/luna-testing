import * as tests from 'TEST_FILE_PATH';
import { isAsync } from './util.js';
import Bomb from './classes/Bomb';

async function runAll() {
    const bomb = new Bomb();
    await bomb.runAll(tests);
    return Promise.resolve();
}

document.addEventListener('DOMContentLoaded', runAll);
