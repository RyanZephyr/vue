/* @flow */
// 类：Dep
// 方法：pushTarget(watcher)、popTarget()
// 只有两个地方新建Dep类的实例：Observer类的构造函数 和 defineReactive方法 中

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// Dep实例对应数据项：一个数据项可以被多个表达式/函数（watcher）订阅
export default class Dep {
  static target: ?Watcher; // 由pushTarget和popTarget方法设置
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }

  // 只在Watcher类的addDep方法中被调用
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  // 只在Watcher类的cleanupDeps和teardown方法中被调用
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 依赖收集
  // 执行Dep.target的addDep方法
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 派发更新：执行subs中所有watcher的update()方法
  // 只有四个地方派发更新：Array异化方法；响应式setter；set方法；del方法
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

// 在Watcher类的get方法中用到
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

// 在Watcher类的get方法中用到
export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
