import { runTests, singleRun } from './runner';
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
    console.log('\n\x1B[1mARGUMENTS\x1B[0m');
    console.log('--concurrency    number of test files to run at a time (default: 1)')
    console.log('--verbose        show verbose output when tests run')
}

if (argv._.length < 1) {
    showUsage();
    process.exit(1);
}

const paths = [];
for (let i = 0; i < argv._.length; i++) {
    if (fs.existsSync(argv._[i])) {
        paths.push(argv._[i]);
    }
}

if (paths.length === 0) {
    showUsage();
    process.exit(1);
}

const options = {
    paths,
    binary: argv.$0,
    concurrency: argv.concurrency || 1,
    verbose: argv.verbose,
    node: argv.node,
    singleRun: argv['single-run']
};

(async () => {
    try {
        if (options.singleRun) {
            await singleRun(options);
            process.exit(0);
            return;
        }
        await runTests(options);
    } catch(e) {
        console.error('Error running tests', e);
        process.exit(1);
    }
})()
