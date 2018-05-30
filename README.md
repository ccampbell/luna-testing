# Luna

Luna is a simple, modern, opinionated unit testing framework for testing JavaScript in a browser or with Node.js.

Unlike other testing frameworks, Luna has no configuration options or files. This means it will not work for every use case, but it is designed to work very well in a majority of cases.

<!-- MarkdownTOC autolink="true" -->

- [Getting Started](#getting-started)
    - [Specifying multiple test paths](#specifying-multiple-test-paths)
    - [Installing globally](#installing-globally)
- [Assumptions](#assumptions)
- [Command line options](#command-line-options)
- [Defining tests](#defining-tests)
    - [Asynchronous tests](#asynchronous-tests)
    - [Skipping tests](#skipping-tests)
- [Assertions](#assertions)
    - [Magic transformations](#magic-transformations)
- [Runtime](#runtime)
    - [Concurrency](#concurrency)

<!-- /MarkdownTOC -->

## Getting Started

It’s as easy as 1, 2, 3…

1. Add Luna to your project

    ```
    yarn add luna-testing
    ```

    **or**

    ```
    npm install luna-testing
    ```

1. Add a test file

    ```javascript
    // Put this file at test/test-something.js
    export function testSomething(t) {
        const something = true;
        t.assert(something === true, 'Make sure something is true');
    }
    ```

1. Run the tests

    ```shell
    ./node_modules/.bin/luna test/test-something.js
    ```

### Specifying multiple test paths

You can specify a path to a single test file or a directory of files or a combination of both (separated by spaces). For example:

```shell
./node_modules/.bin/luna test src/util.js
```

This would run any tests exported by any file within the `test/` directory or the `src/util.js` file.

### Installing globally

If you want to you can also install luna globally so that it will be available in your $PATH

```
yarn global add luna-testing
```

**or**

```
npm install -g luna-testing
```

After this you can use the `luna` command directly.

## Assumptions

Luna was partially inspired by the way testing works in golang where it is built into the language itself, and the available options are limited.

Luna makes some assumptions about how your projects and tests should be written. This means it is not going to be a magical tool that works for everybody, but assuming you follow a few best-practices, Luna will stay out of your way and become invisible.

- Tests will be written as ES6 modules

    This is required because of how Luna processes tests. A test runner module is created that imports * from each test file. It then runs each function with a name that begins with lowercase `test`. If a test function is not exported, it will not run.

    Your source code does not need to be ES6 modules, but it is easier if it is because then you can import specific functions to use with specific tests.

- No code transpiling is needed for your code being tested

    Luna uses rollup to resolve the modules and bundle your tests into standalone JavaScript files to run. Unlike other testing frameworks where you have to juggle around a bunch of babelrc files and configurations, or try out experimental node libraries, Luna does not touch your source code. It keeps everything as ES2017 JavaScript. This means it will **not** work with CoffeeScript or TypeScript out of the box.

    Tests execute by default in Chromium 68. That should support all ES2017 features. Newer versions of Node will also support these features natively. Luna requires Node version 7.6 or later.

    There is one exception to this which is that JSX **will** be transpiled into `React.createElement` syntax automatically. This is to make it possible to test React projects.

- Your tests will not need to run in older browsers

    This will probably be a deal breaker for a number of projects, but Luna is designed with modern code execution in mind. When running in a browser, it only is able to run in new versions of Chromium. This is a trade-off for making browser access completely painless.

- Fancy testing features are not needed

    Out of the box Luna does not have any mocking, monkey patching, setup, teardown, fixture, or function wrapping capabilities. It does not pollute or clutter the global namespace with a bunch of random variables. In fact, Luna only has support for a single `assert` function for test assertions.

    The goal is to make it easy to get up and running as quickly as possible to encourage people who might not otherwise write tests to write some.

    ---

    This may actually be too limiting. If you have a use case that is not supported, but you think should be, feel free to [open an issue](https://github.com/ccampbell/luna/issues).

- Your tests reference the assert method as `t.assert`

    Each test that you export gets passed a `Luna` object when it is called. This object contains a single public method `assert`. Luna contains a custom assert function inspired by power-assert which actually rewrites `t.assert` functions in your tests in order to provide better output. For example if your assertion looks like this:

    ```javascript
    export function testGetData(t) {
        // code goes here…
        t.assert(data3.message === 'Something should be false');
    }
    ```

    If that test failed, most frameworks would just say something like “Failed asserting that `false` is `true`” which is not very useful. The error output with Luna looks like this:

    <img src="https://gateway-testnet.shiftnrg.org/ipfs/QmcwmwLtPw9Vim3Bs6VEBLwA5rXtYRgp4o9YBV7MKaYaMm" width="464">

    Power assert shows you the value of every single part of the comparison, but often that is overkill so Luna focuses on just the important information needed to understand what failed.

    In order to rewrite the assert functions they have to have consistent naming. In this case that means each assertion has to be called `t.assert` and appear on its own line.

## Command line options

Even though Luna does not support any configuration options via a config file, it does support a few things via command line flags/arguments.

| Flag | Name | Description | Default |
|  :--- | :--- | :--- | :--- |
| <pre>`-c, --concurrency`</pre> | Concurrency | The number of test files that should be executed in parallel. This is useful if you have long running tests and you do not want to hold up the entire test bundle. | 1 (no concurrency) |
| <pre>`-l, --coverage`</pre> | Coverage | Show code coverage to see how many lines were executed as part of running your tests | false |
| <pre>`-f, --fast-fail`</pre> | Fast fail | By default all tests running and all failures will show at the end. This flag makes it so that after a test failure, execution stops immediately. | false |
| <pre>`-h, --help`</pre> | Help | Shows help output | n/a |
| <pre>`-n, --node`</pre> | Node | Run tests in node environment instead of in a browser | false |
| <pre>`-p, --port`</pre> | Port | The port to use for the webserver that is used to serve js files to the browser | 5862 |
| <pre>`-v, --verbose`</pre> | Verbose | Show verbose output. This lists the result of each test as it completes. Verbose mode is triggered automatically when running from a continuous integration service such as travis. | false |

## Defining tests

Since tests are nothing more than exported functions you can define your tests anywhere. You could even define tests directly in your source code. For example in `src/util.js`:

```javascript
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export function testCapitalizeFirstLetter(t) {
    t.assert(capitalizeFirstLetter('luna') === 'Luna', 'Luna should be capitalized');
}
```

Now when you run `luna src` or `luna src/util.js`, it will find this test and run it. This is done on purpose because enforcing a specific test structure introduces friction that may prevent some people from writing tests at all. The goal with Luna is to make it as easy as possible to add tests.

**_Note_** *that this should not be done for client side code unless you are using treeshaking. Otherwise it is just dead code, but will still be downloaded every time someone visits your site.*

### Asynchronous tests

In addition to regular test functions, Luna also supports tests that run asynchronously. Rather than try to force any magical syntax on you, to run an asynchronous function all you have to do is define the function as `async` and make sure it returns a promise:

```javascript
export async function testAsyncCode(t) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const thing = true;
            t.assert(thing === true, 'This thing is true');
            resolve();
        }, 10);
    });
}
```

As soon as the promise resolves, the test is considered to have completed. If you reject, it will be considered as an error vs. a failure. There is also a five second timeout. If the test does not finish in five seconds, it will be marked as an error.

### Skipping tests

Since tests are just exported functions, if you want to skip a test just remove the `export` keyword or rename the function so that it does not start with the word `test`.

## Assertions

This was briefly mentioned in the [Assumptions](#assumptions) section, but Luna tests only have a single `assert` method that you can call. It expects a truthy statement. You can put any expression here.

```javascript
t.assert(something === true);
```

Is the same as saying

```javascript
t.assert(something);
```

Assertions can optionally include a second argument with a string that will be presented along with the error if the test fails.

```javascript
t.assert(something, 'Something should be true');
```

### Magic transformations

When you write something like this

```javascript
t.assert(count >= 1);
```

Luna magically transforms it into something like this

```javascript
const _left16 = count;
const _right16 = 1;
t.assert({"source":{"code":"t.assert(count >= 1);","file":"/path/to/test/test-something.js","position":{"line":46,"column":4}},"left":{"code":"count","value":_left16,"range":[9,14]},"value":_left16 >= _right16,"operator":">=","right":{"code":"1","value":_right16,"range":[18,19]}});
```

This allows Luna to show nice error messages when tests fail while still using simple assertions. In other testing libraries you would have to learn a bunch of new methods to do things like:

```javascript
t.greaterThan(count, 1);
```

or

```javascript
expect(count).toBeGreaterThan(1);
```

Using a single assert function means there is nothing special that you have to learn or remember, and also reduces the amount of code you have to write, which should make it easier to write tests.

## Runtime

A lot of times if you want to run tests in a browser you have to set up a complicated testing environment using Karma, Mocha, Babel, Webpack, Phantom, JSDOM, etc. With Luna everything runs in a browser by default. You do not have to configure anything. Each test module gets dynamically built into a single js file in memory which is loaded and executed in a browser.

Luna uses [puppeteer](https://github.com/GoogleChrome/puppeteer) to launch an instance of headless Chromium, opens each test file in a new tab in the browser, then closes it after the tests complete.

When you specify the `--node` flag, it follows a similar process, but instead of running in a Chromium instance, it spawns new child processes for each test group that needs to run.

### Concurrency

In the case of running in a browser, the concurrency manages how many tabs can be open running tests at a given time. When running in node, the concurrency manages how many child processes will be running at a given time.

It uses a backpressure queue to limit the maximum number of tests that can run at the same time. If your concurrency is set to 4 and you have 6 test files, rather than running the first 4 tests in parallel, waiting for them to complete, then running the final 2 tests, it will ensure that there are always up to 4 running. So as soon as 1 of the first 4 finishes, test 5 will be start.
