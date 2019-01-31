const express = require('express');
const fs = require('fs');
const path = require('path');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const coverage = require('rollup-plugin-istanbul');
const svelte = require('rollup-plugin-svelte');
import assert from './rollup-assert';
import chalk from 'chalk';

let runOptions;

export async function getBundle(filePath, options) {
    return new Promise(async(resolve, reject) => {
        try {
            // This is somewhat confusing, but on Windows since this is a
            // straight string replacement any path that has \test\something in
            // it will end up rendering the \t as a tab characters. We have to
            // make sure that any \ are replaced with \\
            const fullTestPath = path.join(process.cwd(), filePath).replace(/\\/g, '\\\\');
            const plugins = [
                replace({
                    TEST_FILE_PATH: fullTestPath,
                    TEST_TIMEOUT: options.timeout
                }),
                buble({
                    target: {
                        chrome: 63
                    },
                    jsx: 'React.createElement'
                }),
                assert()
            ];

            if (options.node && options.coverage) {
                plugins.push(coverage({
                    exclude: [filePath, 'node_modules/**']
                }));
            }

            if (options.svelte) {
                plugins.unshift(svelte({
                    include: options.svelte,
                    dev: true,
                    css: true
                }));
            }

            const bundle = await rollup.rollup({
                input: path.resolve(`${__dirname}/../src`, options.node ? 'run-node.js' : 'run-browser.js'),
                external: ['chalk'],
                treeshake: true,
                plugins
            });

            const { output } = await bundle.generate({
                format: options.node ? 'cjs' : 'iife',
                freeze: true,
                sourcemap: 'inline'
            });

            /* eslint-disable prefer-const */
            let { code, map } = output[0];
            /* eslint-enable prefer-const */

            code += `\n//# sourceMappingURL=${map.toUrl()}\n`;
            resolve(code);
        } catch (e) {
            reject(e);
        }
    });
}

async function bundleHandler(req, res) {
    const filePath = req.params[0];

    const exists = fs.existsSync(filePath);
    if (!exists) {
        res.status(404).send('File does not exist');
        return;
    }

    try {
        const code = await getBundle(filePath, runOptions);
        res.set('Content-Type', 'application/javascript');
        res.send(code);
    } catch (e) {
        res.set('Error', JSON.stringify(e.toString())).status(500).send({ message: e.toString() });
        return;
    }
}

function runHandler(req, res) {
    const filePath = req.params[0];
    const bundlePath = `/bundle/${filePath}`;

    let inject = '';
    if (runOptions.inject) {
        const extra = runOptions.inject.split(',');
        for (const script of extra) {
            inject += `<script src="/static/${script}"></script>`;
        }
    }

    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body>${inject}<script src="${bundlePath}"></script></body>`);
}

export async function startServer(options) {
    runOptions = options;

    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    app.use('/static', express.static(process.cwd()));

    return app.listen(options.port, () => {
        if (options.verbose) {
            console.log(`🔌  Server started at ${chalk.bold(`http://localhost:${options.port}`)}…`);
        }
    });
}
