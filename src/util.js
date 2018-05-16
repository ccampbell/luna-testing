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

export function getElapsedTime(startTime, endTime) {
    const elapsed = endTime / 1000 - startTime / 1000;
    const minutes = Math.floor(elapsed / 60);
    const seconds = Math.round((elapsed - (minutes * 60)) * 100) / 100;

    let response = '';
    if (minutes > 0) {
        response += `${minutes} minute${minutes != 1 ? 's' : ''}, `;
    }

    response += `${seconds} second${seconds != 1 ? 's' : ''}`;
    return response
}
