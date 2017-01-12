/* tslint:disable:no-console no-bitwise */

import { MessageQueue } from 'msg-q';

// ---------------------------------- native
const realModules = {
  module1: {
    method1(seq) {
      console.info('[remote] module1 method1 implementation', seq);
    },
  },

  module2: {
    method2(seq, callback) {
      console.info('[remote] module2 method2 implementation', seq);
      callback(seq + 1);
    },
  },

  timer: {
    setTimeout(m, f) {
      window.setTimeout(f, m);
    },
  },
};

const moduleInfo = {};

Object.keys(realModules).forEach(m => {
  moduleInfo[m] = Object.keys(realModules[m]);
});

function nativeFlushQueueImmediate(queue) {
  if (!queue) {
    return;
  }
  const calls = queue[0].length;
  for (let i = 0; i < calls; i++) {
    const moduleName = queue[0][i];
    const method = queue[1][i];
    const params = queue[2][i];
    let callbacks = queue[3][i];
    while (callbacks) {
      ((num) => {
        const index = params.length - num;
        const callId = params[index];
        params[index] = (...args) => {
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
  }
}

// -------------------------------- webview/jscore

// inject nativeFlushQueueImmediate
// pass moduleInfo to webview/jscore
(window as any).nativeFlushQueueImmediate = nativeFlushQueueImmediate;

const mq = new MessageQueue();

// TODO clearTimeout
function setTimeout(f, m) {
  mq.rpc('timer', 'setTimeout', [m, f]);
}

const stubModules: any = {};

Object.keys(moduleInfo).forEach(m => {
  const methods = {};
  moduleInfo[m].forEach((f) => {
    methods[f] = function run(...args) {
      return mq.rpc(m, f, args);
    };
  });
  stubModules[m] = methods;
});

// 1 sync
stubModules.module1.method1(1);

// 2 callback
stubModules.module2.method2(2, (seq) => {
  console.info('[stub] receive from callback', seq);
});

// 3 async
setTimeout(() => {
  stubModules.module1.method1(10);
  stubModules.module2.method2(20, (seq) => {
    console.info('[stub] receive from async callback', seq);
  });
}, 100);

nativeFlushQueueImmediate(mq.flushedQueue());
