/* @flow */
// 类：Watcher
// 只有三个地方新建Watcher类的实例：
// 1. render watcher: mountComponent方法中，带有为true的isRenderWatcher参数
// 2. computed watcher: initComputed方法中，带有lazy: true的options
// 3. user watcher: Vue.prototype.$watch方法中，带有user: true的options

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// 每个Watcher实例都对应一个表达式或函数，一个表达式或函数可以订阅多个数据项（Dep）
// Watcher实例观察对应表达式或函数计算结果的变化：
// computed watcher
// user watcher对应watch配置项对象中的key
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean; // in options，为true时可以发现对象内部值的变化
  user: boolean; // in options
  lazy: boolean; // in options
  sync: boolean; // in options，为true时该watcher的更新会同步执行（默认异步执行）
  dirty: boolean; // 只有computed watcher会用，为true时表示依赖发生了改变，但computed属性尚未更新
  active: boolean; // 为true时表示当前watcher处于激活状态
  deps: Array<Dep>; // Dep列表
  newDeps: Array<Dep>; // 新Dep列表，只用于更新deps
  depIds: SimpleSet; // Dep id集合
  newDepIds: SimpleSet; // 新Dep id集合，只用于更新depIds
  before: ?Function; // in options
  getter: Function; // 只在该类的get()方法中被调用
  value: any;

  // 构造函数只做一件事：对实例属性赋值。其中expOrFn用于设置this.getter。
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm

    // 如果当前Watcher实例是render watcher，则向vm添加_watcher属性指向该watcher
    if (isRenderWatcher) {
      vm._watcher = this
    }

    // 向vm._watchers数组中添加该watcher（vm._watchers在initState方法中被初始化为数组）
    vm._watchers.push(this)

    // options：deep, user, lazy, sync, before
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }

    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    // 只在开发环境下使用this.expression
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''

    // parse expression for getter
    // 设置this.getter
    // 只在该类的get()方法中被调用：this.getter.call(this.vm, this.vm)
    if (typeof expOrFn === 'function') {
      // expOrFn为函数，直接将函数赋给this.getter
      this.getter = expOrFn
    } else {
      // expOrFn为表达式，
      // 但是表达式可能是'a'，也可能是'a.x'这种形式，
      // 通过调用parsePath方法，统一解析并返回一个需要传入vm的getter
      this.getter = parsePath(expOrFn)

      // expOrFn表达式中存在非法字符，无法解析，则this.getter为undefined
      // 这种情况下，设置this.getter为noop
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    // 通过this.lazy判断该watcher是否为computed watcher。
    // 如果是则this.value取undefined，即暂时不获取computed watcher对应的值
    // 否则马上调用this.get()进行求值。
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 在该类的构造函数中会调用
  get () {
    // 调用pushTarget()，把当前Watcher实例入栈，设置当前Watcher实例为Dep.target
    pushTarget(this)

    let value
    const vm = this.vm
    try {
      // 调用this.getter进行求值，同时触发依赖收集dep.depend()。
      // dep.depend()调用该Watcher实例的addDep()方法。
      // addDep()针对性地更新newIds和newDeps。
      // 依赖收集完成后，调用cleanupDeps方法，
      // 交换newDepIds和depIds的值，并清空newDepIds，
      // 交换newDeps和deps的值，并清空newDeps。
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 如果this.deep为true，则触发每个深层属性的依赖收集。
      if (this.deep) {
        traverse(value)
      }

      // 当前Watcher（即Dep.target）的依赖收集完成，
      // 调用popTarget()进行 出栈 和 重设Dep.target。
      popTarget()
      this.cleanupDeps()
    }

    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 基于传入的dep，针对性地更新newDepIds newDeps和dep.subs数组。
  // 只在Dep类的depend方法中被调用。
  addDep (dep: Dep) {
    const id = dep.id

    // 当前Dep已经在新Dep id集合中的话，则不需操作。
    // 当前Dep不在新Dep id集合中，则更新newDepIds和newDeps。
    if (!this.newDepIds.has(id)) { 
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) { 
        // 同时，当前Dep不在旧Dep id集合中，说明未addSub
        // 因此调用dep.addSub(this)方法，
        // 将当前Watcher实例添加到dep的subs数组中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 只在本类的get方法中，依赖收集完成后被调用。
  // 做了两件事：依赖清除；用newDepIds和newDeps更新depIds和deps。
  // 依赖清除的目的：避免无关的依赖发生改变造成组件的重复渲染、watch回调等。
  cleanupDeps () {
    // 依赖清除：遍历deps数组中的Dep，如果newDepIds数组中没有当前Dep的id（订阅关系已不存在），
    // 则从当前Dep的subs数组中移除当前Watcher实例。
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    
    // 交换newDepIds和depIds的值，并清空newDepIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()

    // 交换newDeps和deps的值，并清空newDeps
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 在src/core/observer文件夹下，只在Dep类的notify方法中被调用。
  update () {
    if (this.lazy) { 
      // 当前Watcher实例为computed watcher，将this.dirty设为true，
      // 表示computed属性的依赖发生了变更（脏了），需要重新估值。
      this.dirty = true
    } else if (this.sync) {
      // this.sync为true，表示同步更新，从而直接调用this.run()。
      this.run()
    } else {
      // 将当前Watcher实例放入异步更新队列。
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 只在flushSchedulerQueue方法和本类的update方法中被调用。
  // 如果当前watcher处于激活状态，执行真正的更新变化操作（调用this.get()，更新this.value，调用this.cb）；否则不做任何操作。
  run () {
    if (this.active) {
      // 调用this.get()方法获取新值。
      const value = this.get()

      // 三种情况下执行更新变化操作：新值不等于旧值；新值是个对象；深度观测（this.deep为true）
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value

        // 执行this.cb
        if (this.user) {
          // 当前watcher是user watcher，通过调用invokeWithErrorHandling方法来执行this.cb
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          // 当前watcher不是user watcher，直接使用call方法来执行this.sub
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  // 只在createComputedGetter方法返回的计算属性getter中被调用。
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  // 只在createComputedGetter返回的计算属性getter中被调用。
  // 调用deps数组中所有dep的depend方法，收集该Watcher实例的所有依赖。
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
