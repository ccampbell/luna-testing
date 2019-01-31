import { runTests, singleRun } from './runner';
import chalk from 'chalk';
import { PREFIX } from './util';
const fs = require('fs');
const yargs = require('yargs');
const os = require('os');
const path = require('path');
const version = require('./../package.json').version;
const ci = require('ci-info');

function showUsage(message) {
    console.log([
        '            ',
        '     ,/   * ',
        `  _,'/_   |          Luna v${version}`,
        '  \`(")\' ,\'/'].join('\n'));
    console.log('\n\x1B[1mUSAGE\x1B[0m');
    console.log('luna /path/to/tests');
    console.log('\n\x1B[1mOPTIONS\x1B[0m');
    console.log('-n, --node           Run unit tests from node environment instead of a browser');
    console.log('-c, --concurrency    Number of test files to run at a time (default: 1)');
    console.log('-f, --fast-fail      Fail immediately after a test failure');
    console.log('-x, --no-coverage    Disable code coverage');
    console.log('-t, --timeout        Maximum time in seconds to wait for async tests to complete (default: 5)');
    console.log('-i, --inject         JavaScript file(s) to inject into the page');
    console.log('-s, --svelte         Path or glob of svelte components to compile');
    console.log('-p, --port           Port to run webserver on (default: 5862)');
    console.log('-h, --help           Show usage');
    console.log('-v, --verbose        Show verbose output when tests run');
    console.log('--version            Show version');

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
    .alias('x', 'no-coverage')
    .alias('p', 'port')
    .alias('t', 'timeout')
    .alias('i', 'inject')
    .alias('s', 'svelte')
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

// yargv tries to be too smart and when you prefix a flag with --no-{flagName}
// it automatically sets the result to {flagName}: false which was not what I
// was expecting. This makes sure that if the flag is set to false the other
// value comes in too.
if (argv.coverage === false) {
    argv.noCoverage = true;
}

const options = {
    paths,
    binary: argv.$0,
    coverage: !argv.noCoverage,
    concurrency: argv.concurrency || 1,
    port: argv.port || 5862,
    verbose: argv.verbose,
    node: argv.node,
    inject: argv.inject,
    singleRun: argv['single-run'],
    fastFail: argv['fast-fail'],
    svelte: argv.svelte,
    timeout: argv.timeout || 5
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
            const hasCoverage = options.coverage;
            if (hasCoverage) {
                fileName = path.join(os.tmpdir(), `coverage-${process.pid}.json`);
                console.log(PREFIX.coverage, fileName);
            }

            await singleRun(options);

            /* global __coverage__ */
            if (hasCoverage && typeof __coverage__ !== 'undefined') {
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
