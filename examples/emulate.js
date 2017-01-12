webpackJsonp([0,1],[
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	module.exports = __webpack_require__(1);


/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	var _msgQ = __webpack_require__(2);
	
	// ---------------------------------- native
	var realModules = {
	    module1: {
	        method1: function method1(seq) {
	            console.info('[remote] module1 method1 implementation', seq);
	        }
	    },
	    module2: {
	        method2: function method2(seq, callback) {
	            console.info('[remote] module2 method2 implementation', seq);
	            callback(seq + 1);
	        }
	    },
	    timer: {
	        setTimeout: function setTimeout(m, f) {
	            window.setTimeout(f, m);
	        }
	    }
	}; /* tslint:disable:no-console no-bitwise */
	
	var moduleInfo = {};
	Object.keys(realModules).forEach(function (m) {
	    moduleInfo[m] = Object.keys(realModules[m]);
	});
	function nativeFlushQueueImmediate(queue) {
	    if (!queue) {
	        return;
	    }
	    var calls = queue[0].length;
	
	    var _loop = function _loop(i) {
	        var moduleName = queue[0][i];
	        var method = queue[1][i];
	        var params = queue[2][i];
	        var callbacks = queue[3][i];
	        while (callbacks) {
	            (function (num) {
	                var index = params.length - num;
	                var callId = params[index];
	                params[index] = function () {
	                    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
	                        args[_key] = arguments[_key];
	                    }
	
	                    // should send msg instead of call directly
	                    nativeFlushQueueImmediate(mq.invokeCallbackAndReturnFlushedQueue(callId, args));
	                };
	            })(callbacks);
	            callbacks--;
	        }
	        try {
	            realModules[moduleName][method].apply(realModules[moduleName], params);
	        } catch (e) {
	            console.error(e);
	        }
	    };
	
	    for (var i = 0; i < calls; i++) {
	        _loop(i);
	    }
	}
	// -------------------------------- webview/jscore
	// inject nativeFlushQueueImmediate
	// pass moduleInfo to webview/jscore
	window.nativeFlushQueueImmediate = nativeFlushQueueImmediate;
	var mq = new _msgQ.MessageQueue();
	// TODO clearTimeout
	function setTimeout(f, m) {
	    mq.rpc('timer', 'setTimeout', [m, f]);
	}
	var stubModules = {};
	Object.keys(moduleInfo).forEach(function (m) {
	    var methods = {};
	    moduleInfo[m].forEach(function (f) {
	        methods[f] = function run() {
	            for (var _len2 = arguments.length, args = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
	                args[_key2] = arguments[_key2];
	            }
	
	            return mq.rpc(m, f, args);
	        };
	    });
	    stubModules[m] = methods;
	});
	// 1 sync
	stubModules.module1.method1(1);
	// 2 callback
	stubModules.module2.method2(2, function (seq) {
	    console.info('[stub] receive from callback', seq);
	});
	// 3 async
	setTimeout(function () {
	    stubModules.module1.method1(10);
	    stubModules.module2.method2(20, function (seq) {
	        console.info('[stub] receive from async callback', seq);
	    });
	}, 100);
	nativeFlushQueueImmediate(mq.flushedQueue());

/***/ },
/* 2 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	module.exports = __webpack_require__(3);

/***/ },
/* 3 */
/***/ function(module, exports, __webpack_require__) {

	'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	  value: true
	});
	exports.MessageQueue = undefined;
	
	var _MessageQueue = __webpack_require__(4);
	
	var _MessageQueue2 = _interopRequireDefault(_MessageQueue);
	
	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
	
	var MessageQueue = exports.MessageQueue = _MessageQueue2.default;

/***/ },
/* 4 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {'use strict';
	
	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	
	var _invariant = __webpack_require__(6);
	
	var _invariant2 = _interopRequireDefault(_invariant);
	
	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
	
	function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } } /* tslint:disable:no-console no-bitwise */
	
	
	var TO_JS = 0;
	var TO_NATIVE = 1;
	var MODULE_IDS = 0;
	var METHOD_IDS = 1;
	var PARAMS = 2;
	var CALLBACKS = 3;
	var MIN_TIME_BETWEEN_FLUSHES_MS = 5;
	var TRACE_TAG_REACT_APPS = 1 << 17;
	var DEBUG_INFO_LIMIT = 32;
	var __DEV__ = process.env.NODE_ENV !== 'production';
	var guard = function guard(fn) {
	    try {
	        fn();
	    } catch (error) {
	        console.error(error);
	    }
	};
	
	var MessageQueue = function () {
	    MessageQueue.spy = function spy(spyOrToggle) {
	        if (spyOrToggle === true) {
	            MessageQueue.prototype._spy = function (info) {
	                console.debug((info.type === TO_JS ? 'N->JS' : 'JS->N') + ' : ' + ('' + (info.module ? info.module + '.' : '') + info.method) + ('(' + JSON.stringify(info.args) + ')'));
	            };
	        } else if (spyOrToggle === false) {
	            MessageQueue.prototype._spy = null;
	        } else {
	            MessageQueue.prototype._spy = spyOrToggle;
	        }
	    };
	
	    function MessageQueue() {
	        _classCallCheck(this, MessageQueue);
	
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
	        this.callFunctionReturnFlushedQueue = this.callFunctionReturnFlushedQueue.bind(this);
	        this.callFunctionReturnResultAndFlushedQueue = this.callFunctionReturnResultAndFlushedQueue.bind(this);
	        this.flushedQueue = this.flushedQueue.bind(this);
	        this.invokeCallbackAndReturnFlushedQueue = this.invokeCallbackAndReturnFlushedQueue.bind(this);
	    }
	
	    MessageQueue.prototype.callFunctionReturnFlushedQueue = function callFunctionReturnFlushedQueue(module, method, args) {
	        var _this = this;
	
	        guard(function () {
	            _this.__callFunction(module, method, args);
	            _this.__callImmediates();
	        });
	        return this.flushedQueue();
	    };
	
	    MessageQueue.prototype.callFunctionReturnResultAndFlushedQueue = function callFunctionReturnResultAndFlushedQueue(module, method, args) {
	        var _this2 = this;
	
	        var result = void 0;
	        guard(function () {
	            result = _this2.__callFunction(module, method, args);
	            _this2.__callImmediates();
	        });
	        return [result, this.flushedQueue()];
	    };
	
	    MessageQueue.prototype.invokeCallbackAndReturnFlushedQueue = function invokeCallbackAndReturnFlushedQueue(cbID, args) {
	        var _this3 = this;
	
	        guard(function () {
	            _this3.__invokeCallback(cbID, args);
	            _this3.__callImmediates();
	        });
	        return this.flushedQueue();
	    };
	
	    MessageQueue.prototype.flushedQueue = function flushedQueue() {
	        this.__callImmediates();
	        var queue = this._queue;
	        this._queue = [[], [], [], [], this._callID];
	        if (__DEV__) {
	            console.debug('pending_calls_to_native_queue', this._queue[0].length);
	        }
	        return queue[0].length ? queue : null;
	    };
	
	    MessageQueue.prototype.getEventLoopRunningTime = function getEventLoopRunningTime() {
	        return new Date().getTime() - this._eventLoopStartTime;
	    };
	
	    MessageQueue.prototype.registerCallableModule = function registerCallableModule(name, module) {
	        this._callableModules[name] = module;
	    };
	
	    MessageQueue.prototype.rpc = function rpc(moduleID, methodID) {
	        var params = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
	
	        var real = params;
	        var onFail = void 0;
	        var onSuccess = void 0;
	        var l = params.length;
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
	    };
	
	    MessageQueue.prototype.enqueueNativeCall = function enqueueNativeCall(moduleID, methodID, params, onFail, onSucc) {
	        var callbackNum = 0;
	        if (onFail || onSucc) {
	            if (__DEV__) {
	                var callId = this._callbackID >> 1;
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
	        this._queue[CALLBACKS].push(callbackNum);
	        if (__DEV__) {
	            if (typeof nativeTraceBeginAsyncFlow !== 'undefined') {
	                nativeTraceBeginAsyncFlow(TRACE_TAG_REACT_APPS, 'native', this._callID);
	            }
	        }
	        this._callID++;
	        this._queue[MODULE_IDS].push(moduleID);
	        this._queue[METHOD_IDS].push(methodID);
	        this._queue[PARAMS].push(params);
	        var now = new Date().getTime();
	        if (typeof nativeFlushQueueImmediate !== 'undefined' && now - this._lastFlush >= MIN_TIME_BETWEEN_FLUSHES_MS) {
	            nativeFlushQueueImmediate(this._queue);
	            this._queue = [[], [], [], [], this._callID];
	            this._lastFlush = now;
	        }
	        if (__DEV__) {
	            console.debug('pending_calls_to_native_queue', this._queue[0].length);
	        }
	        if (__DEV__ && this._spy) {
	            this._spy({
	                type: TO_NATIVE,
	                module: this._remoteModuleTable[moduleID] || moduleID,
	                method: this._remoteMethodTable[moduleID] && this._remoteMethodTable[moduleID][methodID] || methodID,
	                args: params
	            });
	        }
	    };
	
	    MessageQueue.prototype.createDebugLookup = function createDebugLookup(moduleID, name, methods) {
	        if (__DEV__) {
	            this._remoteModuleTable[moduleID] = name;
	            this._remoteMethodTable[moduleID] = methods;
	        }
	    };
	    /**
	     * "Private" methods
	     */
	
	
	    MessageQueue.prototype.__callImmediates = function __callImmediates() {
	        if (typeof callImmediates !== 'undefined') {
	            if (__DEV__) {
	                console.debug('JSTimersExecution.callImmediates()');
	            }
	            guard(function () {
	                return callImmediates();
	            });
	        }
	    };
	
	    MessageQueue.prototype.__callFunction = function __callFunction(module, method, args) {
	        this._lastFlush = new Date().getTime();
	        this._eventLoopStartTime = this._lastFlush;
	        if (__DEV__) {
	            console.group(module + '.' + method + '()');
	        }
	        if (__DEV__ && this._spy) {
	            this._spy({ type: TO_JS, module: module, method: method, args: args });
	        }
	        var moduleMethods = this._callableModules[module];
	        (0, _invariant2.default)(!!moduleMethods, 'Module %s is not a registered callable module (calling %s)', module, method);
	        (0, _invariant2.default)(!!moduleMethods[method], 'Method %s does not exist on module %s', method, module);
	        var result = moduleMethods[method].apply(moduleMethods, args);
	        if (__DEV__) {
	            console.groupEnd();
	        }
	        return result;
	    };
	
	    MessageQueue.prototype.__invokeCallback = function __invokeCallback(cbID, args) {
	        this._lastFlush = new Date().getTime();
	        this._eventLoopStartTime = this._lastFlush;
	        var callback = this._callbacks[cbID];
	        if (__DEV__) {
	            var debug = this._debugInfo[cbID >> 1];
	            var module = debug && this._remoteModuleTable[debug[0]] || debug[0];
	            var method = debug && this._remoteMethodTable[debug[0]] && this._remoteMethodTable[debug[0]][debug[1]] || debug[1];
	            if (callback == null) {
	                var errorMessage = 'Callback with id ' + cbID + ': ' + module + '.' + method + '() not found';
	                if (method) {
	                    errorMessage = 'The callback ' + method + '() exists in module ' + module + ', ' + 'but only one callback may be registered to a function in a native module.';
	                }
	                (0, _invariant2.default)(callback, errorMessage);
	            }
	            var profileName = debug ? '<callback for ' + module + '.' + method + '>' : cbID;
	            if (callback && this._spy && __DEV__) {
	                this._spy({ type: TO_JS, module: null, method: profileName, args: args });
	            }
	            if (__DEV__) {
	                console.group('MessageQueue.invokeCallback(' + profileName + ', ' + JSON.stringify(args) + ')');
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
	    };
	
	    return MessageQueue;
	}();
	
	exports.default = MessageQueue;
	module.exports = exports['default'];
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(5)))

/***/ },
/* 5 */
/***/ function(module, exports) {

	// shim for using process in browser
	var process = module.exports = {};
	
	// cached from whatever global is present so that test runners that stub it
	// don't break things.  But we need to wrap it in a try catch in case it is
	// wrapped in strict mode code which doesn't define any globals.  It's inside a
	// function because try/catches deoptimize in certain engines.
	
	var cachedSetTimeout;
	var cachedClearTimeout;
	
	function defaultSetTimout() {
	    throw new Error('setTimeout has not been defined');
	}
	function defaultClearTimeout () {
	    throw new Error('clearTimeout has not been defined');
	}
	(function () {
	    try {
	        if (typeof setTimeout === 'function') {
	            cachedSetTimeout = setTimeout;
	        } else {
	            cachedSetTimeout = defaultSetTimout;
	        }
	    } catch (e) {
	        cachedSetTimeout = defaultSetTimout;
	    }
	    try {
	        if (typeof clearTimeout === 'function') {
	            cachedClearTimeout = clearTimeout;
	        } else {
	            cachedClearTimeout = defaultClearTimeout;
	        }
	    } catch (e) {
	        cachedClearTimeout = defaultClearTimeout;
	    }
	} ())
	function runTimeout(fun) {
	    if (cachedSetTimeout === setTimeout) {
	        //normal enviroments in sane situations
	        return setTimeout(fun, 0);
	    }
	    // if setTimeout wasn't available but was latter defined
	    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
	        cachedSetTimeout = setTimeout;
	        return setTimeout(fun, 0);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedSetTimeout(fun, 0);
	    } catch(e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
	            return cachedSetTimeout.call(null, fun, 0);
	        } catch(e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
	            return cachedSetTimeout.call(this, fun, 0);
	        }
	    }
	
	
	}
	function runClearTimeout(marker) {
	    if (cachedClearTimeout === clearTimeout) {
	        //normal enviroments in sane situations
	        return clearTimeout(marker);
	    }
	    // if clearTimeout wasn't available but was latter defined
	    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
	        cachedClearTimeout = clearTimeout;
	        return clearTimeout(marker);
	    }
	    try {
	        // when when somebody has screwed with setTimeout but no I.E. maddness
	        return cachedClearTimeout(marker);
	    } catch (e){
	        try {
	            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
	            return cachedClearTimeout.call(null, marker);
	        } catch (e){
	            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
	            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
	            return cachedClearTimeout.call(this, marker);
	        }
	    }
	
	
	
	}
	var queue = [];
	var draining = false;
	var currentQueue;
	var queueIndex = -1;
	
	function cleanUpNextTick() {
	    if (!draining || !currentQueue) {
	        return;
	    }
	    draining = false;
	    if (currentQueue.length) {
	        queue = currentQueue.concat(queue);
	    } else {
	        queueIndex = -1;
	    }
	    if (queue.length) {
	        drainQueue();
	    }
	}
	
	function drainQueue() {
	    if (draining) {
	        return;
	    }
	    var timeout = runTimeout(cleanUpNextTick);
	    draining = true;
	
	    var len = queue.length;
	    while(len) {
	        currentQueue = queue;
	        queue = [];
	        while (++queueIndex < len) {
	            if (currentQueue) {
	                currentQueue[queueIndex].run();
	            }
	        }
	        queueIndex = -1;
	        len = queue.length;
	    }
	    currentQueue = null;
	    draining = false;
	    runClearTimeout(timeout);
	}
	
	process.nextTick = function (fun) {
	    var args = new Array(arguments.length - 1);
	    if (arguments.length > 1) {
	        for (var i = 1; i < arguments.length; i++) {
	            args[i - 1] = arguments[i];
	        }
	    }
	    queue.push(new Item(fun, args));
	    if (queue.length === 1 && !draining) {
	        runTimeout(drainQueue);
	    }
	};
	
	// v8 likes predictible objects
	function Item(fun, array) {
	    this.fun = fun;
	    this.array = array;
	}
	Item.prototype.run = function () {
	    this.fun.apply(null, this.array);
	};
	process.title = 'browser';
	process.browser = true;
	process.env = {};
	process.argv = [];
	process.version = ''; // empty string to avoid regexp issues
	process.versions = {};
	
	function noop() {}
	
	process.on = noop;
	process.addListener = noop;
	process.once = noop;
	process.off = noop;
	process.removeListener = noop;
	process.removeAllListeners = noop;
	process.emit = noop;
	
	process.binding = function (name) {
	    throw new Error('process.binding is not supported');
	};
	
	process.cwd = function () { return '/' };
	process.chdir = function (dir) {
	    throw new Error('process.chdir is not supported');
	};
	process.umask = function() { return 0; };


/***/ },
/* 6 */
/***/ function(module, exports, __webpack_require__) {

	/* WEBPACK VAR INJECTION */(function(process) {/**
	 * Copyright 2013-2015, Facebook, Inc.
	 * All rights reserved.
	 *
	 * This source code is licensed under the BSD-style license found in the
	 * LICENSE file in the root directory of this source tree. An additional grant
	 * of patent rights can be found in the PATENTS file in the same directory.
	 */
	
	'use strict';
	
	/**
	 * Use invariant() to assert state which your program assumes to be true.
	 *
	 * Provide sprintf-style format (only %s is supported) and arguments
	 * to provide information about what broke and what you were
	 * expecting.
	 *
	 * The invariant message will be stripped in production, but the invariant
	 * will remain to ensure logic does not differ in production.
	 */
	
	var invariant = function(condition, format, a, b, c, d, e, f) {
	  if (process.env.NODE_ENV !== 'production') {
	    if (format === undefined) {
	      throw new Error('invariant requires an error message argument');
	    }
	  }
	
	  if (!condition) {
	    var error;
	    if (format === undefined) {
	      error = new Error(
	        'Minified exception occurred; use the non-minified dev environment ' +
	        'for the full error message and additional helpful warnings.'
	      );
	    } else {
	      var args = [a, b, c, d, e, f];
	      var argIndex = 0;
	      error = new Error(
	        format.replace(/%s/g, function() { return args[argIndex++]; })
	      );
	      error.name = 'Invariant Violation';
	    }
	
	    error.framesToPop = 1; // we don't care about invariant's own frame
	    throw error;
	  }
	};
	
	module.exports = invariant;
	
	/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(5)))

/***/ }
]);
//# sourceMappingURL=emulate.js.map