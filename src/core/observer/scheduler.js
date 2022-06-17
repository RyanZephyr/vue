/* @flow */

// 导出常量MAX_UPDATE_COUNT，变量currentFlushTimestamp，
// 方法queueWatcher和queueActivatedComponent
// 本文件中除了两个导出方法外，所有方法都只在flushSchedulerQueue方法中被调用；
// flushSchedulerQueue方法只在queueWatcher方法中被调用。

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

const queue: Array<Watcher> = [] // watcher异步更新队列
const activatedChildren: Array<Component> = []
let has: { [key: number]: ?true } = {} // 防止重复添加Watcher的标志对象
let circular: { [key: number]: number } = {}
let waiting = false
let flushing = false // 为true时表示正在对异步更新队列中watcher执行更新
let index = 0 // 当前遍历的Watcher实例索引

/**
 * Reset the scheduler's state.
 */
// 只在flushSchedulerQueue方法中被调用。
function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
// 只在flushSchedulerQueue方法中被调用
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
// 只在queueWatcher方法中被调用，执行异步更新队列。
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  // 按watcher id升序排序
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  // 遍历queue
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index]

    // 如果当前watcher声明了before方法，先执行before方法。
    if (watcher.before) {
      watcher.before()
    }

    id = watcher.id
    // 释放当前watcher在has标志对象中的状态
    has[id] = null
    //调用watcher.run()方法
    watcher.run()

    // in dev build, check and stop circular updates.
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice() // 存放所有更新了的Vue实例
  const updatedQueue = queue.slice() // 存放所有更新了的watcher

  // 异步更新队列执行完毕后，还原相关状态。
  resetSchedulerState()

  // call component updated and activated hooks
  // 触发组件activated和updated钩子函数
  callActivatedHooks(activatedQueue)
  callUpdatedHooks(updatedQueue)

  // devtool hook
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

// 只在flushSchedulerQueue方法中被调用
function callUpdatedHooks (queue) {
  let i = queue.length
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

// 只在flushSchedulerQueue方法中被调用
function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 只在Watcher类的update方法中被调用，将传入watcher放入异步更新队列。
export function queueWatcher (watcher: Watcher) {
  const id = watcher.id

  // 借助has标记对象避免同一watcher重复入队。
  if (has[id] == null) {
    // 根据id判断出传入watcher并不在异步更新队列中，对该id进行标记。
    has[id] = true

    if (!flushing) {
      // 异步更新队列没有在执行更新，直接将传入watcher追加到队列尾部。
      queue.push(watcher)
    } else {
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 在异步更新队列更新中产生的观察者入队行为，
      // 则查找异步更新队列中适当的位置，插入传入watcher。
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }

    // queue the flush
    if (!waiting) {
      // 不处于waiting状态，表示可以执行当前Watcher队列，
      // 先将waiting设为true，然后调用nextTick(flushSchedulerQueue)，
      // 在下一个tick执行flushSchedulerQueue方法。
      waiting = true

      // 如果在开发环境下，且全局配置config.async为false，则同步执行异步更新队列，并直接返回。
      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }

      // 否则，调用nextTick方法来异步执行异步更新队列
      nextTick(flushSchedulerQueue)
    }
  }
}
