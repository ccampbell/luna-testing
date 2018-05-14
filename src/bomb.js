import { runTests } from './runner';
const fs = require('fs');
const argv = require('yargs').argv;
const version = require('./../package.json').version;

function showUsage() {
    console.log([
        '        ,--.!,',
        '     __/   -*-',
        '   ,d08b.  \'|`',
        `   0088MM          BOMB v${version}`,
        '   `9MMP\''].join('\n'));
    console.log('\n\x1B[1mUSAGE\x1B[0m');
    console.log('bomb /path/to/tests');
}

if (argv._.length < 1 || !fs.existsSync(argv._[0])) {
    showUsage();
    process.exit(1);
}

const options = {
    path : argv._[0],
    concurrency: argv.concurrency
};

(async () => {
    try {
        await runTests(options);
    } catch(e) {
        console.error('Error running tests', e);
    }
})()
