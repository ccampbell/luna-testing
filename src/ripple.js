const ripple = {
    wrap: (obj) => {
        const callbacks = {};

        obj.on = function(eventName, callback) {
            if (!callbacks[eventName]) {
                callbacks[eventName] = [];
            }

            callbacks[eventName].push(callback);
        };

        obj.off = function(eventName, callback) {
            if (callback === undefined) {
                delete callbacks[eventName];
                return;
            }

            const index = callbacks[eventName].indexOf(callback);
            callbacks[eventName].splice(index, 1);
        };

        obj.fire = function(...args) {
            const eventName = args[0];
            if (callbacks[eventName]) {
                for (let i = 0, len = callbacks[eventName].length, cb; i < len; i++) {
                    cb = callbacks[eventName][i];
                    cb.apply(obj, args.slice(1));
                }
            }
        };
    }
};

export default ripple;
