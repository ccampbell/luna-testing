import { runTests, singleRun } from './runner';
import chalk from 'chalk';
const fs = require('fs');
const yargs = require('yargs');
const version = require('./../package.json').version;
const ci = require('ci-info');

function showUsage(message) {
    console.log([
        '            ',
        '     ,/   * ',
        `  _,'/_   |        Luna v${version}`,
        '  \`(")\' ,\'/'].join('\n'));
    console.log('\n\x1B[1mUSAGE\x1B[0m');
    console.log('luna /path/to/tests');
    console.log('\n\x1B[1mOPTIONS\x1B[0m');
    console.log('-c, --concurrency      Number of test files to run at a time (default: 1)');
    console.log('-l, --coverage         Track and show code coverage');
    console.log('-f, --fast-fail        Fail immediately after a test failure');
    console.log('-n, --node             Run unit tests from node environment instead of a browser');
    console.log('-v, --verbose          Show verbose output when tests run');
    console.log('-h, --help             Show usage');
    console.log('--version              Show version');

    if (message) {
        console.log(`\n⚠️  ${chalk.bold(message)}`);
    }
}

// Override default help
const argv = yargs
    .alias('h', 'help')
    .alias('v', 'verbose')
    .alias('c', 'concurrency')
    .alias('f', 'fast-fail')
    .alias('n', 'node')
    .alias('l', 'coverage')
    .help('').argv;

if (argv.help) {
    showUsage();
    process.exit(0);
}

if (argv._.length < 1) {
    showUsage('No test path specified\n');
    process.exit(1);
}

const paths = [];
for (let i = 0; i < argv._.length; i++) {
    if (fs.existsSync(argv._[i])) {
        paths.push(argv._[i]);
    }
}

if (paths.length === 0) {
    showUsage('No files found at provided paths');
    process.exit(1);
}

const options = {
    paths,
    binary: argv.$0,
    coverage: argv.coverage,
    concurrency: argv.concurrency || 1,
    verbose: argv.verbose,
    node: argv.node,
    singleRun: argv['single-run'],
    fastFail: argv['fast-fail']
};

// Force verbose mode from a CI environment
if (ci.isCI) {
    options.verbose = true;
}

(async() => {
    try {
        if (options.singleRun) {
            // There is a limitation on how much output can be captured from a
            // child process:
            //
            // @see https://github.com/nodejs/node/issues/19218
            let fileName;
            if (options.coverage) {
                fileName = `/tmp/coverage-${process.pid}.json`;
                console.log('Coverage', fileName);
            }

            await singleRun(options);

            /* global __coverage__ */
            if (options.coverage) {
                fs.writeFileSync(fileName, JSON.stringify(__coverage__));
            }
            process.exit(0);
            return;
        }
        await runTests(options);
    } catch (e) {
        console.error('Error running tests', e);
        process.exit(1);
    }
})();
