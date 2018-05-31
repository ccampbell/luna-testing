import Luna from '../src/classes/Luna';

export function testTimeoutIsSet(t) {
    let l = new Luna();
    t.assert(l.timeout === 5000);

    l = new Luna({ timeout: 10 });
    t.assert(l.timeout === 10000);
}

export async function testRunWithSuccess(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();

        // Override _log so nothing is logged here
        l._log = () => {};

        function testMeta(t) {
            const something = true;
            t.assert(something === true);
        }

        await l.run('testMeta', testMeta);
        t.assert(l.results.length === 1);
        t.assert(l.results[0].name === 'testMeta');
        t.assert(l.results[0].assertions === 1);
        t.assert(l.results[0].failures === 0);

        resolve();
    })
}

export async function testRunWithFailure(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();
        l._log = () => {};

        function testMeta(t) {
            const something = true;
            t.assert(t instanceof Luna);
            t.assert(something === false, 'Something should be false');
        }

        await l.run('testMeta', testMeta);

        t.assert(l.results.length === 1);
        const result = l.results[0];
        t.assert(result.name === 'testMeta');
        t.assert(result.assertions === 2);
        t.assert(result.failures === 1);
        t.assert(result.error === 'Something should be false');
        t.assert(result.trace !== null);
        t.assert(typeof result.data === 'object');

        resolve();
    });
}

// Timeouts are rejected as a string
export async function testRunWithTimeout(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna({
            timeout: 0.005
        });
        l._log = () => {};

        async function testMetaAsync(t) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    t.assert(true);
                    resolve();
                }, 10);
            })
        }

        let error = null;
        try {
            await l.run('testMetaAsync', testMetaAsync);
        } catch (e) {
            error = e;
        }

        t.assert(error !== null, 'An error should have been thrown');
        t.assert(error === 'Test timed out');
        resolve();
    });
}

// Errors are rejected with the full error object
export async function testRunWithError(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();
        l._log = () => {};

        function testMetaWithError(t) {
            throw new Error('OMG This Test Failed!!');
        }

        let error = null;
        try {
            await l.run('testMetaWithError', testMetaWithError);
        } catch (e) {
            error = e;
        }

        t.assert(error !== null, 'An error should have been thrown');
        t.assert(error instanceof Error);
        t.assert(error.message === 'OMG This Test Failed!!');
        resolve();
    });
}

export async function testRunWithMultipleFailures(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();
        l._log = () => {};

        function testMultipleFailures(t) {
            const name = 'Voldemort';
            t.assert(0 > 1);
            t.assert(false);
            t.assert(name === 'Luna');
        }

        await l.run('testMultipleFailures', testMultipleFailures);

        t.assert(l.results[0].assertions === 1, 'New assertions should be skipped');
        t.assert(l.results[0].failures === 1);

        resolve();
    });
}

export async function testRunWithDeepEquals(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();
        l._log = () => {};

        function testDeepEquals(t) {
            const obj = {line: 140, column: 0};
            t.assert(obj == {column: 0, line: 140});
            t.assert(obj != {line: 141, column: 4});
        }

        await l.run('testDeepEquals', testDeepEquals);

        t.assert(l.results[0].assertions === 2);
        t.assert(l.results[0].failures === 0);
        resolve();
    });
}

export async function testRunAll(t) {
    return new Promise(async(resolve, reject) => {
        let l = new Luna();
        l._log = () => {};

        function test1(t) {
            t.assert(1 > 0);
            t.assert(true);
        }

        function test2(t) {
            t.assert(false);
        }

        function testWithError(t) {
            throw new Error('Yes, it failed');
        }

        function nameThatDoesNotStartWithTest(t) {}

        await l.runAll({
            'test1': test1,
            'test2': test2,
            'testWithError': testWithError,
            'nameThatDoesNotStartWithTest': nameThatDoesNotStartWithTest
        });

        t.assert(l.results.length === 3, 'Fourth test should have been skipped');
        t.assert(l.results[0].assertions === 2);
        t.assert(l.results[0].failures === 0);
        t.assert(l.results[1].assertions === 1);
        t.assert(l.results[1].failures === 1);
        t.assert(l.results[2].assertions === 0);
        t.assert(l.results[2].failures === 1);

        resolve();
    })
}
