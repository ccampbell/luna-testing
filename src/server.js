const express = require('express');
const fs = require('fs');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
import assert from './rollup-assert';

export async function getBundle(filePath, node=false) {
    return new Promise(async (resolve, reject) => {
        try {
            const bundle = await rollup.rollup({
                input: node ? 'src/run-node.js': 'src/run.js',
                treeshake: true, // for testing
                plugins: [
                    replace({
                        TEST_FILE_PATH: `${process.cwd()}/${filePath}`
                    }),
                    buble({
                        target: {
                            chrome: 63
                        },
                        jsx: 'React.createElement'
                    }),
                    assert()
                ]
            });

            let { code, map } = await bundle.generate({
                format: node ? 'cjs': 'iife',
                freeze: true,
                sourcemap: 'inline'
            });

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
        const code = await getBundle(filePath);
        res.set('Content-Type', 'application/javascript');
        res.send(code);
    } catch(e) {
        console.error(e);
        res.status(500).send(e);
        return;
    }
}

function runHandler(req, res) {
    const filePath = req.params[0];
    const bundlePath = `/bundle/${filePath}`;
    res.status(200).send(`<!DOCTYPE html><head><title>${filePath} – Test Runner</title></head><body><script src="${bundlePath}"></script></body>`);
}

export async function startServer(options) {
    const app = express();
    app.get(/\/bundle\/(.*)/, bundleHandler);
    app.get(/\/run\/(.*)/, runHandler);
    return app.listen(2662, () => {
        if (options.verbose) {
            console.log('Server started at http://localhost:2662…')
        }
    });
}
