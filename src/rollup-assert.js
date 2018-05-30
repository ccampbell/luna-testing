import { transform } from './assert';

export default function assert() {
    return {
        name: 'assert',
        transform(code, id) {
            return transform(code, id);
        }
    };
}
