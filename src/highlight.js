import chalk from 'chalk';
import { string, operator, constant } from './util';

export function syntaxHighlight(code) {
    let strings = [];
    let stringMap = {};

    if (code === undefined) {
        return chalk.yellow('undefined');
    }

    code = code.replace(string, (match) => {
        const stringName = `__STRING__${strings.length}`;
        strings.push(stringName);
        stringMap[stringName] = match;
        return stringName;
    });

    code = code.replace(operator, (match) => {
        return chalk.magenta(match)
    });

    code = code.replace(constant, (match) => {
        return chalk.yellow(match);
    });

    for (const stringName of strings) {
        code = code.replace(stringName, chalk.green(stringMap[stringName]));
    }

    return code;
}
