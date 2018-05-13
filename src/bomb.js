import { runTests } from './runner';
const fs = require('fs');
const argv = require('yargs').argv;

function showUsage() {
    console.log([
        '        ,--.!,',
        '     __/   -*-',
        '   ,d08b.  \'|`',
        '   0088MM          BOMB v1.0.0',
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
    parallel: argv.parallel
};

runTests(options);
