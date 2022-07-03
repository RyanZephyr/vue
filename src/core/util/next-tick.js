/* @flow */
/* globals MutationObserver */
// 三个变量：isUsingMicroTask、callbacks、pending
// 三个函数：flushCallbacks、timerFunc、nextTick

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []
let pending = false // 为true表示回调队列正在等待刷新，不为空。

// 只在timerFunc方法中被调用。当flushCallbacks函数执行时，callbacks队列中包含了本次事件循环中所有通过nextTick函数注册的callback。
// 将pending状态重置为false，取callbacks队列的copy，清空callbacks队列，执行copy中的所有callback。
// 借助copy，使得 回调中的nextTick调用 注册新的micro/macrotask来执行新的回调。
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc // 只在nextTick函数中被调用，用于将flushCallbacks函数注册为microtask或macrotask。

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
// 首选Promise，然后是用MutationObserver、setImmediate、setTimeout，来实现timerFunc。
// 使用Promise或MutationObserver时（均借助microtask队列），标记isUsingMicroTask为true。
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  // timerFunc改变textNode.data从而触发MutationObserver的callback
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout. （setImmediate无需做超时检测，比setTimeout性能更好）
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// ctx: context
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve

  // 用一个函数包裹传入的cb，将该函数添加到callbacks队列中。
  callbacks.push(() => {
    if (cb) {
      // 如果有传入cb，则在ctx作用域下执行cb。
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 没有传入cb，直接调用_resolve函数（在下方被设为Promise实例对象的resolve函数）。
      _resolve(ctx)
    }
  })

  // pending为false，表示当前callbacks队列未被计划执行，则将pending设为true，然后调用timerFunc函数来计划执行callbacks队列。
  if (!pending) {
    pending = true
    timerFunc()
  }

  // 如果没有传入cb并且当前环境支持Promise，则返回一个Promise，来支持下面这种用法：
  // Vue.nextTick().then(function() {
  //   // 此时DOM已更新，做一些事情
  // })
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
