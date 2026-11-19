// Tiny event emitter that works both in Node and inside the phone app.
export class Emitter {
  constructor() {
    this._handlers = {};
  }
  on(event, fn) {
    (this._handlers[event] ||= []).push(fn);
    return this;
  }
  off(event, fn) {
    this._handlers[event] = (this._handlers[event] || []).filter((h) => h !== fn);
    return this;
  }
  emit(event, ...args) {
    for (const fn of this._handlers[event] || []) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[${event}]`, err);
      }
    }
    return this;
  }
  removeAllListeners() {
    this._handlers = {};
    return this;
  }
}
