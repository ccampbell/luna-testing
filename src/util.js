export function lower(string) {
    return string.toLowerCase();
}

export function extractFunctionNames(source) {
    const re = /export(?: async)?\s+function\s+(test.*?)\(/g;
    let match;
    const names = [];
    while (match = re.exec(source)) {
        names.push(match[1]);
    }

    return names;
}

export function namesToArray(names) {
    let string = '[\n    \'';
    string += names.join('\',\n    \'');
    string += '\'\n];\n';
    return string;
}

export function isAsync(fn) {
    const AsyncFunction = (async () => {}).constructor;
    return fn instanceof AsyncFunction;
}
