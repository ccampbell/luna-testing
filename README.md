# Luna

Luna is a simple, modern, opinionated unit testing framework for testing JavaScript in a browser and with Node.js.

Luna has no configuration options or files. This means it will not work for every use case, but it is designed to work very well in a majority of cases. If you have a use case that is not supported, but you think should be, feel free to [open an issue](https://github.com/ccampbell/luna/issues). It is possible that more command line flags or options will be added in the future.

<!-- MarkdownTOC autolink="true" -->

- [Getting Started](#getting-started)
    - [Specifying multiple paths](#specifying-multiple-paths)
    - [Install globally](#install-globally)
- [Assumptions](#assumptions)
- [Command line options](#command-line-options)
- [Defining tests](#defining-tests)

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

### Specifying multiple paths

You can specify a path to a single test file or a directory of files or a combination of both (separated by spaces). For example:

```shell
./node_modules/.bin/luna test src/util.js
```

This would run any tests exported by any file within the `test/` directory or the `src/util.js` file.

### Install globally

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

Luna makes some assumptions about how your projects and tests should be written. That means it is not going to be a magical tool that works for everybody.

- Tests will be written as ES6 modules

    This is required because of how Luna processes tests. A test runner module is created that imports * from each test file. It then runs each function with a name that begins with lowercase `test`. If a test function is not exported, it will not run.

    Your source code does not need to be ES6 modules, but it is easier if it is because then you can import specific functions to use with specific tests.

- No code transpiling is needed for your code being tested

    Luna uses rollup to resolve the modules and bundle your tests into standalone JavaScript files to run. Unlike other testing frameworks where you have to juggle around a bunch of babelrc files and configurations, or try out experimental node libraries, Luna does not touch your source code. It keeps everything as ES2017 JavaScript. This means it will **not** work with CoffeeScript or TypeScript out of the box.

    Tests execute by default in Chromium 68. That should support all ES2017 features. Newer versions of Node will also support these features natively. Luna requires Node version 7.6 or later.

    There is one exception to this which is that JSX **will** be transpiled into `React.createElement` syntax automatically. This is to make it possible to test React projects.

- Fancy testing features are not needed

    Out of the box Luna only supports a single function for tests. It does not have any mocking, monkey patching, or function wrapping capabilities. It also does not pollute and clutter the global namespace with a whole bunch of random variables. In fact, Luna only has support for a single function for test assertions `assert`.

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

| Flag | Name | Description |
|  :--- | :--- | :--- |
| <pre>`-c, --concurrency`</pre> | Concurrency | The number of test files that should be executed in parallel. This is useful if you have long running tests and you do not want to hold up the entire test bundle. |
| <pre>`-l, --coverage`</pre> | Coverage | Show code coverage to see how many lines were run as part of running your tests |
| <pre>`-f, --fast-fail`</pre> | Fast fail | By default all tests running and all failures will show at the end. This flag makes it so that after a test failure, execution stops immediately. |
| <pre>`-n, --node`</pre> | Node | Run tests in node environment instead of in a browser |
| <pre>`-v, --verbose`</pre> | Verbose | Show verbose output. This lists the result of each test as it completes. |
| <pre>`-h, --help`</pre> | Help | Shows help output |

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

Now when you run `luna src` or `luna src/util.js`, it will find this test and run it.

**_Note_** *that this should not be done for client side code unless you are using treeshaking. Otherwise it is just dead code, but will still be downloaded every time someone visits your site.*
