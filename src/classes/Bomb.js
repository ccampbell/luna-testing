import { isAsync } from '../util';

export default class Bomb {
    constructor() {
        this.timeout = 5000;
        this.results = [];
        this.running = -1;
    }

    async run(testName, test) {
        console.log('Running', testName);

        const count = this.results.push({
            name: testName,
            assertions: 0,
            failures: 0,
            error: null,
            trace: null
        });

        this.running = count - 1;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject('Test timed out');
            }, this.timeout);

            if (isAsync(test)) {
                test.call(this, this).then(resolve).catch(reject);
                return;
            }

            clearTimeout(timer);
            try {
                test.call(this, this);
                resolve();
            } catch(e) {
                reject(e);
            }
        });
    }

    assert(assertion, message) {
        // If an earlier assertion already failed then skip the rest
        if (this.results[this.running].failures > 0) {
            return;
        }

        this.results[this.running].assertions += 1;
        if (assertion.value === false) {
            this.fail(message, assertion);
        }
    }

    fail(message, extraData) {
        this.results[this.running].failures += 1;
        this.results[this.running].error = message || 'Assertion failed';
        this.results[this.running].trace = new Error(message).stack;
        this.results[this.running].data = extraData;
    }

    async runAll(tests) {
        for (const testName in tests) {
            // If the function name does not start with test then skip it
            if (!/^test/.test(testName)) {
                continue;
            }

            try {
                await this.run(testName, tests[testName]);
                console.log('Finished', testName);
            } catch (e) {
                this.fail(e);
                console.log('Finished', testName);
            }
        }

        console.log('Results', JSON.stringify(this.results));
    }
}
