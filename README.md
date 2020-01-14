# Luna

Luna is a simple, modern, opinionated unit testing framework for testing JavaScript in a browser or with Node.js.

Unlike other testing frameworks, Luna has no configuration options or plugins. This means it will not work for every use case, but it is designed to work very well in many cases.

You can read the [introduction blog post](https://medium.com/@craigiam/introducing-luna-javascript-testing-done-right-437a738cc1ed) to learn a bit more about the motivation for the project.

---

<!-- MarkdownTOC autolink="true" -->

- [Getting Started](#getting-started)
    - [Naming tests](#naming-tests)
    - [Specifying multiple test paths](#specifying-multiple-test-paths)
    - [Using with common js modules](#using-with-common-js-modules)
- [Assumptions](#assumptions)
- [Command line options](#command-line-options)
- [Defining tests](#defining-tests)
    - [Asynchronous tests](#asynchronous-tests)
    - [Skipping tests](#skipping-tests)
    - [Assertions](#assertions)
        - [Object and Array equality](#object-and-array-equality)
        - [Magic transformations](#magic-transformations)
- [Runtime](#runtime)
    - [Concurrency](#concurrency)
    - [Code Coverage](#code-coverage)
    - [Limitations](#limitations)
        - [Browser](#browser)
        - [Node](#node)
            - [Possible Workaround](#possible-workaround)
- [Testing Luna](#testing-luna)

<!-- /MarkdownTOC -->

## Getting Started

It’s as easy as 1, 2, 3…

1. Add Luna to your project

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
    npx luna test/test-something.js
    ```

### Naming tests

Test functions *have* to start with the word `test` in lowercase. For example this will run:

```javascript
export function testSomething(t) {
    t.assert(true);
}
```

But this will **not**:

```javascript
export function somethingTest(t) {
    t.assert(true);
}
```

### Specifying multiple test paths

You can specify a path to a single test file or a directory of files or a combination of both (separated by spaces). For example:

```shell
./node_modules/.bin/luna test src/util.js
```

This would run any tests exported by any file within the `test/` directory or the `src/util.js` file.

### Using with common js modules

If you are testing node code that depends on common js modules then you can import them using require syntax in your test files as you usually would. For example if this is your src file:

```javascript
module.exports = {
    namedExport: function() {}
};
```

You could import it in your test file using:

```javascript
const { namedExport } = require('../path/to/src/file.js');
```

**_Note:_** *Code coverage will [not work properly](#node) when using common js modules with node*

## Assumptions

Luna was partially inspired by the way testing works in golang where it is built into the language itself, and the available options are limited.

Luna makes some assumptions about how your projects and tests should be written. This means it is not going to be a magical tool that works for everybody, but assuming you follow a few best-practices, Luna will stay out of your way and become invisible.

- **Tests need to be written as ES6 modules**

    This is required because of how Luna processes tests. A test runner module is created that imports * from each test file. It then runs each function with a name that begins with lowercase `test`. If a test function is not exported, it will not run.

    Your source code does not need to be ES6 modules, but it is easier if it is because then you can import specific functions to use with specific tests.

- **Your source should not depend on code transpiling**

    Luna uses rollup to resolve the modules and bundle your tests into standalone JavaScript files to run. Unlike other testing frameworks where you have to juggle around a bunch of .babelrc files and configurations, or try out experimental node libraries, Luna does not touch your source code. It keeps everything as ES2017 JavaScript. This means it will **not** work with CoffeeScript or TypeScript or other compile to JavaScript languages out of the box.

    Tests execute by default in Chromium 79. That should support all ES2017 features. Newer versions of Node should also support these features natively. Luna requires Node version 7.6 or later.

    **_Note:_** *There are two exceptions to this. One is that JSX **will** be transpiled into `React.createElement` syntax automatically. This is to make it possible to test React projects. The other is that [svelte](https://svelte.dev/) components will compile if you set a [command line flag](#command-line-options).*

- **Your tests will not be able to run in older browsers**

    This will probably be a deal breaker for a number of projects, but Luna is designed with modern code execution in mind. When running in a browser, it only is able to run in new versions of Chromium. This is a trade-off for making browser access completely painless.

    In theory, it should be possible to get it to work in other browser testing environments, but it is not high on the priority list.

- **You do not need any fancy testing features**

    Out of the box Luna does not have any mocking, monkey patching, setup, teardown, fixture, function wrapping, or other advanced testing capabilities. It does not pollute or clutter the global namespace with a bunch of random variables. In fact, Luna only supports a single `assert` function for test assertions.

    The goal is to make it easy to get up and running as quickly as possible to encourage people who might not otherwise write tests to write some.

    If you have a use case that is not supported, but you think should be, feel free to [open an issue](https://github.com/ccampbell/luna/issues).

- **Your tests need to reference the assert method as `t.assert`**

    Each test that you export gets passed a `Luna` object when it is called. This object contains a single public method `assert`. Luna contains a custom assert function inspired by power-assert which actually rewrites `t.assert` functions in your tests in order to provide better output. For example if your assertion looks like this:

    ```javascript
    export function testGetData(t) {
        // code goes here…
        t.assert(data3.message === 'Something should be false');
    }
    ```

    If that test failed, most frameworks would just say something like “Failed asserting that `false` is `true`” which is not very useful when it comes to debugging. The error output with Luna looks like this:

    ```
    test/test-assert.js

    ❌ testGetData

    24
    25    t.assert(data3.message === 'Something should be false');
    26                   |
                         "Something should be true"
    ```

    Power assert shows you the value of every single part of the comparison, but often that is overkill so Luna focuses on just the information needed to understand what failed.

    In order to rewrite the assert function calls in your tests they have to be named consistently. In this case that means each assertion has to be called `t.assert` and start on a new line.

## Command line options

Even though Luna does not support any configuration options via a config file, it does support a few things via command line flags/arguments.

| Flag | Name | Description | Default |
|  :--- | :--- | :--- | :--- |
| <pre>`-n, --node`</pre> | Node | Run tests in node environment instead of in a browser | false |
| <pre>`-c, --concurrency`</pre> | Concurrency | The number of test files that should be executed in parallel. This is useful if you have long running tests and you do not want to hold up the entire test bundle. | 1 (no concurrency) |
| <pre>`-f, --fast-fail`</pre> | Fast fail | By default all tests running and all failures will show at the end. This flag makes it so that after a test failure, execution stops immediately. | false |
| <pre>`-x, --no-coverage`</pre> | No Coverage | Disables code coverage reporting. Could speed up test execution. | false |
| <pre>`-t, --timeout`</pre> | Timeout | The amount of time in seconds to wait for asynchronous functions to complete | 5 |
| <pre>`-i, --inject`</pre> | Inject | Local path to a script (or comma separated scripts) to inject into the page before the tests run. This is useful if you have a library that is not compatible with ES6 modules. The file path has to be within the current working directory and a relative path. This option is only applicable when running in browser mode. | null |
| <pre>`-d, --debug`</pre> | Debug | Sets debug mode to true. This option will keep the test server running after the tests have completed to allow manual debugging in a browser. It will also print the test URLs to the command line output. | false |
| <pre>`-s, --svelte`</pre> | Svelte | A path or glob to use to compile [svelte](https://svelte.dev/) components at runtime. For example `src/components/**/*.html` would match all components in the src/components directory.  | null |
| <pre>`-p, --port`</pre> | Port | The port to use for the webserver that is used to serve js files to the browser | 5862 |
| <pre>`-h, --help`</pre> | Help | Shows help output | n/a |
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

**_Note:_** *This should not be done for client side code unless you are using treeshaking. Otherwise it is just dead code, but will still be downloaded every time someone visits your site.*

### Asynchronous tests

In addition to regular test functions, Luna also supports tests that run asynchronously. Rather than try to force any magical syntax on you, to run an asynchronous function all you have to do is define the function as `async`:

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

As soon as the function executes, the test is considered to have completed. If you have to execute code that does not use `async`/`await` then you can wrap it in a promise as shown here. If you reject the promise, it will be considered an error instead of a failure. There is also a configurable timeout. If the test does not finish in a certain amount of time (default is five seconds), it will be marked as an error.

### Skipping tests

Since tests are just exported functions, if you want to skip a test just remove the `export` keyword or rename the function so that it does not start with the word `test`.

### Assertions

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

#### Object and Array equality

Luna allows you to easily compare arrays and objects. If you use `==` or `!=` in your test assertion it will automatically perform a deep equals comparing that the Arrays or Objects are equal.

For example you can do:

```javascript
t.assert(fruits == ['Apple', 'Blueberry', 'Strawberry']);
```

or

```javascript
t.assert(position == {line: 5, column: 0});
```

#### Magic transformations

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

Using a single assert function means there is nothing special that you have to learn or remember, and it also reduces the amount of code you have to write, which should make it easier to add tests.

## Runtime

A lot of times if you want to run tests in a browser you have to set up a complicated testing environment using Karma, Mocha, Babel, Webpack, Phantom, jsdom, etc. With Luna everything runs in a browser by default. You do not have to configure anything. Each test module gets dynamically built into a single js file in memory which is loaded and executed in a browser. It uses console messages to relay information back to the node runtime.

Luna uses [puppeteer](https://github.com/GoogleChrome/puppeteer) to launch an instance of headless Chromium, opens each test file in a new tab in the browser, then closes it after the tests complete.

When you specify the `--node` flag, it follows a similar process, but instead of running in a Chromium browser tab, it spawns new child processes for each test group that needs to run.

### Concurrency

In the case of running in a browser, the concurrency manages how many tabs can be open running tests at a given time. When running in node, the concurrency manages how many child processes will be running at a given time.

It uses a backpressure queue to limit the maximum number of tests that can run at the same time. If your concurrency is set to 4 and you have 6 test files, rather than running the first 4 tests in parallel, waiting for them to complete, then running the final 2 tests, it will ensure that there are always up to 4 running. So as soon as 1 of the first 4 finishes, test 5 will start running.

### Code Coverage

Code coverage is tracked and reported automatically after running your tests. In node it uses [istanbul](https://istanbul.js.org/) to instrument your code and then displays a coverage summary to your shell. It will show a text breakdown of the file by file coverage if you are running with the verbose flag. It also creates a `coverage` directory in the root of your project which contains an HTML page you can view in your browser to see the code coverage overlayed on top of the original source code.

When running via the browser it uses the puppeteer JS coverage reporting methods. Unfortunately, they do not seem to match exactly with what istanbul reports, but it is will still give you a pretty good idea. The puppeteer coverage output also [does not support source maps](https://github.com/GoogleChrome/puppeteer/issues/985) so Luna has to do a bunch of work to apply the source maps and then transform it into a format that can be consumed by the istanbul API for actually reporting the coverage.

**_NOTE:_** *The branches and statements coverage reports seem to always return 100% when using browser coverage. This is most likely related to the translation from puppeteer to v8 and istanbul coverage formats.*

### Limitations

#### Browser

According to the [puppeteer documentation](https://github.com/GoogleChrome/puppeteer#q-what-features-does-puppeteer-not-support) there may be issues with regards to certain audio and video formats such as AAC and H.264 since Chromium does not contain the licenses to play them back. Also features specific to Chrome mobile will not work.

#### Node

Code coverage reporting will not work for node modules that are imported using common-js `require` syntax. This is due to the fact that the code coverage for node is done using a rollup plugin, and rollup currently only resolves imports and exports. See [#7](https://github.com/ccampbell/luna/issues/7) for more information about this issue.

##### Possible Workaround

If you are using common js with node you may have some success by using [nyc](https://github.com/istanbuljs/nyc) to run the tests, but I have not tested it extensively. Instead of running

```
npx luna /path/to/tests --node
```

You could try installing nyc

```
npm install nyc
```

And then running

```
npx nyc luna /path/to/tests --node
```

## Testing Luna

Luna uses Luna to run its own tests. At the moment, code coverage is not complete, and more tests will be added over time. To run the tests, clone this project then run:

```
npm test
```

**or** run the command directly:

```
./bin/luna.js test --node
```

You can play around with different command line options too.
