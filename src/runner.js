import { startServer } from './server';

export function runTests(options) {
    startServer();
    console.log('runTests', options);
}
