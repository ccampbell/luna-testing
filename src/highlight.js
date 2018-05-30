import chalk from 'chalk';
import { string, operator, constant } from './util';

export function syntaxHighlight(code) {
    const strings = [];
    const stringMap = {};

    if (code === undefined) {
        return chalk.yellow('undefined');
    }

    code = code.replace(string, (match) => {
        const stringName = `__STRING__${strings.length}`;
        strings.push(stringName);
        stringMap[stringName] = match;
        return stringName;
    });

    code = code.replace(operator, (match) => chalk.magenta(match));
    code = code.replace(constant, (match) => chalk.yellow(match));

    for (const stringName of strings) {
        code = code.replace(stringName, chalk.green(stringMap[stringName]));
    }

    return code;
}
