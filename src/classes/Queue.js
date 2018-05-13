import { isAsync } from '../util';
import ripple from '../ripple';

class Task {
    constructor(fn, name) {
        this.fn = fn;
        this.name = name;
    }
}

export default class Queue {
    constructor({ concurrency = 1 } = {}) {
        this.tasks = [];
        this.running = false;
        this.concurrency = concurrency;
        this._active = [];
        ripple.wrap(this);
    }

    addTask(task, name) {
        if (!(task instanceof Promise)) {
            throw new Error('Task needs to be a promise!');
        }

        this.tasks.push(new Task(task, name));
    }

    _run() {
        if (!this.running) {
            return;
        }

        if (this.tasks.length === 0) {
            this.fire('complete');
            return;
        }

        while (this._active.length < this.concurrency && this.tasks.length > 0) {
            const toRun = this.tasks.shift();
            this._active.push(toRun);

            this.fire('taskstart', toRun.name);
            toRun.fn.then((response) => {
                this.fire('taskend', toRun.name);
                const index = this._active.indexOf(toRun);
                this._active.splice(index, 1);
                this._run();
            }).catch((e) => {
                this.fire('taskerror', toRun.name);
                this._run();
            })
        }
    }

    start() {
        this.running = true;
        this.fire('start');
        this._run();
    }

    stop() {
        this.running = false;
        this.fire('stop');
    }
}
