import { getData } from '../src/assert';

export function testDeepEqual(t) {
    const fruits = ['Apple', 'Blueberry', 'Strawberry'];
    t.assert(fruits == ['Apple', 'Blueberry', 'Strawberry']);
}

export function testGetData(t) {
    const name = 'Luna';
    const data = getData(`t.assert(name === 'luna');`, 'hogwarts', {line: 7, column: 7});
    t.assert(data.source.file === 'hogwarts');
    t.assert(data.source.position == {line: 7, column: 7});
    t.assert(data.left.code === 'name');
    t.assert(data.left.range == [9, 13]);
    t.assert(data.right.code === '"luna"');
    t.assert(data.right.range == [18, 24]);
    t.assert(data.operator == '===');

    const data2 = getData('t.assert(something);', 'somewhere', {line: 5, column: 10});
    t.assert(data2.left.code === 'something');
    t.assert(data2.hasOwnProperty('right') === false);

    const data3 = getData('t.assert(something, "Something should be true");', 'somewhere', {line: 1, column: 0});
    t.assert(data3.left.code === 'something');
    t.assert(data3.message === 'Something should be true');
}
