import { isAsync, deepEquals } from '../util';

export default class Luna {
    constructor({ timeout = 5 } = {}) {
        this.timeout = timeout * 1000;
        this.results = [];
        this.running = -1;
    }

    _log(...args) {
        console.log(...args);
    }

    async run(testName, test) {
        this._log('Running', testName);

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
                test(this).then(resolve).catch(reject);
                return;
            }

            clearTimeout(timer);
            try {
                test(this);
                resolve();
            } catch (e) {
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

        // Deep equal for objects
        const isNotStrict = assertion.operator === '==' || assertion.operator === '!=';
        if (isNotStrict) {
            assertion.value = deepEquals(assertion.left.value, assertion.right.value);

            if (assertion.operator === '!=') {
                assertion.value = !assertion.value;
            }
        }

        if (assertion.value === false) {
            this._fail(message, assertion);
        }
    }

    _fail(message, extraData) {
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
                this._log('Finished', testName, this.results[this.running].failures);
            } catch (e) {
                this._fail(e);
                this._log('Finished', testName, 1);
            }
        }

        this._log('Results', JSON.stringify(this.results));
    }
}
