/* tslint:disable:no-console no-bitwise */

import invariant from 'invariant';

declare const process;
declare const callImmediates;
declare const nativeTraceBeginAsyncFlow;
declare const nativeFlushQueueImmediate;

const TO_JS = 0;
const TO_NATIVE = 1;

const MODULE_IDS = 0;
const METHOD_IDS = 1;
const PARAMS = 2;
const CALLBACKS = 3;

const MIN_TIME_BETWEEN_FLUSHES_MS = 5;

const TRACE_TAG_REACT_APPS = 1 << 17;

const DEBUG_INFO_LIMIT = 32;

const __DEV__ = process.env.NODE_ENV !== 'production';

export interface ISpyData {
  type: number;
  module?: string|null;
  method: string|number;
  args: any;
}

const guard = (fn) => {
  try {
    fn();
  } catch (error) {
    console.error(error);
  }
};

class MessageQueue {
  static spy(spyOrToggle: boolean|((data: ISpyData) => void)) {
    if (spyOrToggle === true) {
      MessageQueue.prototype._spy = info => {
        console.debug(`${info.type === TO_JS ? 'N->JS' : 'JS->N'} : ` +
          `${info.module ? (info.module + '.') : ''}${info.method}` +
          `(${JSON.stringify(info.args)})`);
      };
    } else if (spyOrToggle === false) {
      MessageQueue.prototype._spy = undefined;
    } else {
      MessageQueue.prototype._spy = spyOrToggle;
    }
  }

  _callableModules: { [key: string]: any };
  _queue: [any[], any[], any[], any[], number];
  _callbacks: any[];
  _callbackID: number;
  _callID: number;
  _lastFlush: number;
  _eventLoopStartTime: number;

  _debugInfo: Object;
  _remoteModuleTable: Object;
  _remoteMethodTable: Object;

  _spy?: (data: ISpyData) => void;

  constructor() {
    this._callableModules = {};
    this._queue = [[], [], [], [], 0];
    this._callbacks = [];
    this._callbackID = 0;
    this._callID = 0;
    this._lastFlush = 0;
    this._eventLoopStartTime = new Date().getTime();

    if (__DEV__) {
      this._debugInfo = {};
      this._remoteModuleTable = {};
      this._remoteMethodTable = {};
    }

    (this as any).callFunctionReturnFlushedQueue =
      (this as any).callFunctionReturnFlushedQueue.bind(this);
    (this as any).callFunctionReturnResultAndFlushedQueue =
      (this as any).callFunctionReturnResultAndFlushedQueue.bind(this);
    (this as any).flushedQueue = (this as any).flushedQueue.bind(this);
    (this as any).invokeCallbackAndReturnFlushedQueue =
      (this as any).invokeCallbackAndReturnFlushedQueue.bind(this);
  }

  callFunctionReturnFlushedQueue(module: string, method: string, args: any[]) {
    guard(() => {
      this.__callFunction(module, method, args);
      this.__callImmediates();
    });

    return this.flushedQueue();
  }

  callFunctionReturnResultAndFlushedQueue(module: string, method: string, args: any[]) {
    let result;
    guard(() => {
      result = this.__callFunction(module, method, args);
      this.__callImmediates();
    });

    return [result, this.flushedQueue()];
  }

  invokeCallbackAndReturnFlushedQueue(cbID: number, args: any[]) {
    guard(() => {
      this.__invokeCallback(cbID, args);
      this.__callImmediates();
    });

    return this.flushedQueue();
  }

  flushedQueue() {
    this.__callImmediates();

    const queue: any[] = this._queue;
    this._queue = [[], [], [], [], this._callID];
    if (__DEV__) {
      console.debug('pending_calls_to_native_queue', this._queue[0].length);
    }
    return queue[0].length ? queue : null;
  }

  getEventLoopRunningTime() {
    return new Date().getTime() - this._eventLoopStartTime;
  }

  registerCallableModule(name: string, module: Object) {
    this._callableModules[name] = module;
  }

  rpc(moduleID: number|string, methodID: number|string, params: any[] = []) {
    let real = params;
    let onFail;
    let onSuccess;
    let l = params.length;
    if (l) {
      if (typeof params[l - 2] === 'function') {
        onSuccess = params[l - 2];
        onFail = params[l - 1];
        real = params.slice(0, -2);
      } else if (typeof params[l - 1] === 'function') {
        onSuccess = params[l - 1];
        real = params.slice(0, -1);
      }
    }
    this.enqueueNativeCall(moduleID, methodID, real, onFail, onSuccess);
  }

  enqueueNativeCall(moduleID: number|string,
                    methodID: number|string, params: any[],
                    onFail?: Function, onSucc?: Function) {
    let callbackNum = 0;
    if (onFail || onSucc) {
      if (__DEV__) {
        const callId = this._callbackID >> 1;
        this._debugInfo[callId] = [moduleID, methodID];
        if (callId > DEBUG_INFO_LIMIT) {
          delete this._debugInfo[callId - DEBUG_INFO_LIMIT];
        }
      }
      if (onFail) {
        callbackNum++;
        params.push(this._callbackID);
      }
      this._callbacks[this._callbackID++] = onFail;
      if (onSucc) {
        callbackNum++;
        params.push(this._callbackID);
      }
      this._callbacks[this._callbackID++] = onSucc;
    }

    (this._queue[CALLBACKS] as any).push(callbackNum);

    if (__DEV__) {
      if (typeof nativeTraceBeginAsyncFlow !== 'undefined') {
        nativeTraceBeginAsyncFlow(TRACE_TAG_REACT_APPS, 'native', this._callID);
      }
    }
    this._callID++;

    (this._queue[MODULE_IDS] as any).push(moduleID);
    (this._queue[METHOD_IDS] as any).push(methodID);
    (this._queue[PARAMS] as any).push(params);

    const now = new Date().getTime();
    if (typeof nativeFlushQueueImmediate !== 'undefined' &&
      now - this._lastFlush >= MIN_TIME_BETWEEN_FLUSHES_MS) {
      nativeFlushQueueImmediate(this._queue);
      this._queue = [[], [], [], [], this._callID];
      this._lastFlush = now;
    }
    if (__DEV__) {
      console.debug('pending_calls_to_native_queue', this._queue[0].length);
    }
    if (__DEV__ && this._spy) {
      this._spy(
        {
          type: TO_NATIVE,
          module: this._remoteModuleTable[moduleID] || moduleID,
          method: this._remoteMethodTable[moduleID] && this._remoteMethodTable[moduleID][methodID] || methodID,
          args: params,
        },
      );
    }
  }

  createDebugLookup(moduleID: number, name: string, methods: string[]) {
    if (__DEV__) {
      this._remoteModuleTable[moduleID] = name;
      this._remoteMethodTable[moduleID] = methods;
    }
  }

  /**
   * "Private" methods
   */

  __callImmediates() {
    if (typeof callImmediates !== 'undefined') {
      if (__DEV__) {
        console.debug('JSTimersExecution.callImmediates()');
      }
      guard(() => callImmediates());
    }
  }

  __callFunction(module: string, method: string, args: any[]) {
    this._lastFlush = new Date().getTime();
    this._eventLoopStartTime = this._lastFlush;

    if (__DEV__) {
      console.group(`${module}.${method}()`);
    }
    if (__DEV__ && this._spy) {
      this._spy({ type: TO_JS, module, method, args });
    }
    const moduleMethods = this._callableModules[module];
    invariant(
      !!moduleMethods,
      'Module %s is not a registered callable module (calling %s)',
      module, method,
    );
    invariant(
      !!moduleMethods[method],
      'Method %s does not exist on module %s',
      method, module,
    );
    const result = moduleMethods[method].apply(moduleMethods, args);
    if (__DEV__) {
      console.groupEnd();
    }
    return result;
  }

  __invokeCallback(cbID: number, args: any[]) {
    this._lastFlush = new Date().getTime();
    this._eventLoopStartTime = this._lastFlush;
    const callback = this._callbacks[cbID];

    if (__DEV__) {
      const debug = this._debugInfo[cbID >> 1];
      const module = debug && this._remoteModuleTable[debug[0]] || debug[0];
      const method = debug && this._remoteMethodTable[debug[0]] &&
        this._remoteMethodTable[debug[0]][debug[1]] || debug[1];
      if (callback == null) {
        let errorMessage = `Callback with id ${cbID}: ${module}.${method}() not found`;
        if (method) {
          errorMessage = `The callback ${method}() exists in module ${module}, `
            + 'but only one callback may be registered to a function in a native module.';
        }
        invariant(
          callback,
          errorMessage,
        );
      }
      const profileName = debug ? '<callback for ' + module + '.' + method + '>' : cbID;
      if (callback && this._spy && __DEV__) {
        this._spy({ type: TO_JS, module: null, method: profileName, args });
      }
      if (__DEV__) {
        console.group(
          `MessageQueue.invokeCallback(${profileName}, ${JSON.stringify(args)})`);
      }
    } else {
      if (!callback) {
        return;
      }
    }

    this._callbacks[cbID & ~1] = null;
    this._callbacks[cbID | 1] = null;
    // $FlowIssue(>=0.35.0) #14551610
    callback.apply(null, args);

    if (__DEV__) {
      console.groupEnd();
    }
  }
}

export default MessageQueue;
