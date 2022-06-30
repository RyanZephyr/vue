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
  deep: boolean; // in options，为true时深度观测，在该类的get()和run()方法中被使用。
  user: boolean; // in options，为true时表示当前Watcher实例是开发者定义的（user watcher），在该类的get()和run()方法中被使用。
  lazy: boolean; // in options，为true时表示当前Watcher实例是computed watcher。
  sync: boolean; // in options，为true时该watcher的更新（重新求值和执行回调）会同步执行（默认异步执行）。
  dirty: boolean; // 只有computed watcher会用，为true时表示依赖发生了变化，但computed属性尚未更新。
  active: boolean; // 为true时表示当前Watcher实例处于激活状态，在该类的构造函数中被设为true，teardown()方法中被设为false。
  deps: Array<Dep>; // 总是存放 上一次求值 收集到的Dep实例对象。
  newDeps: Array<Dep>; // 总是存放 当次求值 收集到的Dep实例对象。
  depIds: SimpleSet; // 总是存放 上一次求值 收集到的Dep实例对象id。
  newDepIds: SimpleSet; // 总是存放 当次求值 收集到的Dep实例对象id。
  before: ?Function; // in options，在数据变化之后，更新之前被执行（见src/core/observer/scheduler.js）。
  getter: Function; // 在构造函数中被初始化为获取expOrFn的值（同时触发get访问器函数）的函数，只在该类的get()方法中被调用。
  value: any; // 保存Watcher实例观察目标的当前值，在该类的构造函数、run()、evaluate()方法中被赋值。

  // 构造函数只做一件事：对实例属性赋值。其中expOrFn用于设置this.getter。
  // 参数：组件实例对象vm，要观察的表达式或函数expOrFn，观察目标值变化时的回调函数cb，Watcher实例选项options，isRenderWatcher标识。
  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm

    // 如果当前Watcher实例是render watcher，则向组件实例添加_watcher属性指向组件的render watcher。
    if (isRenderWatcher) {
      vm._watcher = this
    }

    // 向vm._watchers数组中添加该watcher（vm._watchers在initState方法中被初始化为空数组）。
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

    // 用于 避免重复收集依赖、移除无用依赖 的支持数据结构。
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()

    // 只在开发环境下使用this.expression，用于在警告中显示当前Watcher实例观察的表达式或函数。
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''

    // parse expression for getter：设置this.getter，只在该类的get()方法中被调用：this.getter.call(this.vm, this.vm)。
    if (typeof expOrFn === 'function') {
      // expOrFn为函数，直接将函数赋给this.getter。
      this.getter = expOrFn
    } else {
      // expOrFn为表达式，但是表达式可能是'c'，也可能是'a.b.c'这种形式，
      // 所以调用parsePath函数，解析表达式并返回一个需要传入组件实例的getter函数。
      this.getter = parsePath(expOrFn)

      // expOrFn表达式中存在非法字符，无法解析，则this.getter为undefined。
      // 这种情况下，设置this.getter为noop，并在开发环境下发出警告。
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

    // 通过this.lazy判断当前Watcher实例是否为computed watcher。
    // 如果是则this.value取undefined，即暂时不获取computed watcher对应的值；否则马上调用this.get()进行求值。
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies. 在该类的构造函数、run()、evaluate()方法中被调用。
   */
  // 对this.getter求值并返回求得值，在求值过程中触发依赖收集。
  get () {
    // 调用pushTarget()，把当前Watcher实例入栈，设置当前Watcher实例为Dep.target。
    pushTarget(this)

    let value // 存放this.getter的最新求值，在最后返回。
    const vm = this.vm
    try {
      // 调用this.getter进行求值，求值过程中触发get访问器函数，进行依赖收集（dep.depend()）。
      // dep.depend()调用Dep.target的addDep方法；addDep方法针对性地更新newIds和newDeps。
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

      // 当前Watcher实例（即Dep.target）的依赖收集完成，
      // 调用popTarget函数进行 出栈 和 重设Dep.target。
      popTarget()
      
      // 调用cleanupDeps方法，分别使用depIds和deps保存newIds和newDeps，然后清空newIds和newDeps。
      this.cleanupDeps()
    }

    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 真正的依赖收集动作：基于传入的dep，针对性地更新newDepIds newDeps和dep.subs数组。只在Dep类的depend()方法中被调用。
  addDep (dep: Dep) {
    const id = dep.id

    // 避免重复收集依赖：传入的Dep实例id已经在newDepIds集合中的话，则无需操作（已收集过同一依赖）；
    // 否则，更新newDepIds和newDeps（收集该依赖）。
    if (!this.newDepIds.has(id)) { 
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) { 
        // 同时，如果传入的Dep实例id不在depIds集合中，则说明该Dep实例的subs数组中没有当前Watcher实例。
        // 因此调用dep.addSub(this)方法，将当前Watcher实例添加到该Dep实例的subs数组中。
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  // 只在本类的get方法中，依赖收集完成后被调用。做了两件事：
  // 依赖清除；将newDepIds和newDeps保存到depIds和deps并清空newDepIds和newDeps。
  cleanupDeps () {
    // 依赖清除：遍历deps数组中的Dep实例，如果newDepIds数组中没有当前Dep的id（订阅关系已不存在），
    // 则从当前Dep实例的subs数组中移除当前Watcher实例。
    // 依赖清除的目的：避免无关的依赖发生改变造成组件的重复渲染、watch回调等。
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    
    // 交换newDepIds和depIds的值，并清空newDepIds。
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()

    // 交换newDeps和deps的值，并清空newDeps。
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  // 只在Vue.prototype.$forceUpdate方法和Dep类的notify()方法中被调用。
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
  // 只在scheduler.js文件的flushSchedulerQueue函数和本类的update方法中被调用。
  // 只在当前Watcher实例处于激活状态时，执行真正的更新操作（调用this.get，更新this.value，调用this.cb）。
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
