// This is the file that is actually loaded into the browser itself to run the
// tests. It is not executed by node.js!
import * as tests from 'TEST_FILE_PATH';
import Luna from './classes/Luna';

async function runAll() {
    const luna = new Luna();
    await luna.runAll(tests);
    const done = document.createElement('div');
    done.classList.add('done');
    document.body.appendChild(done);
    return Promise.resolve();
}

document.addEventListener('DOMContentLoaded', runAll);
