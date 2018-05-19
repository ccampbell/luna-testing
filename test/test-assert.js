import { findLineAndColumnForPosition, getData } from '../src/assert';

export function testFindLineAndColumnForPosition(t) {
    const someCode = `function something() {
    const something = true;
    return something;
}`;

    const pos = findLineAndColumnForPosition(someCode, 30);

    // @todo create a shortcut for comparing objects
    t.assert(typeof pos === 'object');
    t.assert(pos.hasOwnProperty('line'));
    t.assert(pos.hasOwnProperty('column'));
    t.assert(pos.line === 2);
    t.assert(pos.column === 8);
}

// export function testGetData(t) {
//     const name = 'Luna';
//     const data = getData(`t.assert(name === 'luna');`, 'hogwarts', {line: 7, column: 7});
//     t.assert(data === true);
// }
