/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

// proxy代理：劫持getter和setter，允许通过obj.key(例如obj.name)来访问obj.sourceKey.key(例如obj._data.name)
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

// 初始化$options中的props、methods、data、computed、watch。
export function initState (vm: Component) {
  vm._watchers = [] // 向实例添加_watchers属性，一个用于存放实例所有watcher对象的数组。

  const opts = vm.$options
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  if (opts.computed) initComputed(vm, opts.computed)
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

// 主要在for循环中做三件事情：props校验和求值、props响应式、props代理。
function initProps (vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {} // 存放传入组件的props数据的对象
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []  // 存放当前组件实例所有prop key
  const isRoot = !vm.$parent // 标识当前实例是否为根组件实例。

  // root instance props should be converted
  // 如果props来自父组件，那么props数据已经被观察过，因此暂时关闭observe，并在initProps结束时重新开启observe。
  if (!isRoot) {
    toggleObserving(false)
  }

  // 遍历props。
  for (const key in propsOptions) {
    keys.push(key)

    // 校验求值当前prop
    const value = validateProp(key, propsOptions, propsData, vm)

    // 调用defineReactive()方法，使当前prop响应式化
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 开发环境下提供自定义setter，阻止在子组件中直接修改父组件传递的props值
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }

    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    // 调用proxy()方法，设置当前prop的代理
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }

  toggleObserving(true)
}

function initData (vm: Component) {
  let data = vm.$options.data

  // 判断data是否为函数并取值，将获得的数据对象赋给vm._data属性和data变量。
  // 虽然在合并选项时会将$options.data处理成函数，但在beforeCreated钩子中可能修改$options.data，
  // 所以仍需判断$options.data的类型。
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  
  // 如果data不是纯对象，将data设为空对象{}，在开发模式下发出警告。
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }

  // proxy data on instance
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods

  // 遍历数据对象的key，做三件事：
  // 1. 在开发环境下发现有方法和key重名时（实例上的代理会被覆盖为数据项），发出警告信息。
  // 2. 在开发环境下发现有props和key重名时（实例上的代理会被覆盖为数据项），发出警告信息。
  // 3. key不与props重名，且不以_或$开头（避免和Vue实例已有的属性冲突），则在实例上设置vm.key accessor代理vm._data.key。
  let i = keys.length
  while (i--) {
    const key = keys[i]

    // 在开发环境下，有方法和key重名时发出警告。
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }

    // 与props重名时不设置代理，在开发环境下发出警告。
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // key不与props重名，且不以_或$开头，则在实例上设置同名代理accessor。
      proxy(vm, `_data`, key)
    }
  }

  // observe data（观察数据对象）：对数据对象data调用observe方法，并设置asRootData参数为true
  observe(data, true /* asRootData */)
}

// 调用data函数获取数据对象。
export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {} // data函数执行出错，则返回一个空对象作为实例的数据对象。
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }

function initComputed (vm: Component, computed: Object) {
  // 定义vm_computedWatcher属性，初始化为空对象，并定义watchers常量引用该对象。
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 遍历所有的computed属性，初始化每项computed属性。初始化主要包括两件事：
  // 1. 在非服务端渲染的情况下，创建当前computed属性的Watcher实例，并添加到vm._computedWatchers属性对象上。
  // 2. 调用definedComputed函数，在当前组件实例对象上定义computed属性（同名访问器属性）。
  for (const key in computed) {
    // 获取当前computed属性的getter。
    const userDef = computed[key]
    const getter = typeof userDef === 'function' ? userDef : userDef.get

    // 在开发环境下，若getter不存在，则发出警告。
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    // 非服务端渲染下，创建当前computed属性的Watcher实例，并添加到vm._computedWatchers属性对象上。
    // 服务端渲染下，计算属性的实现本质上与methods选项基本一致。
    if (!isSSR) {
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions /* lazy: true */
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 如果当前computed属性名并不存在于组件实例对象上，则调用definedComputed函数在传入的组件实例vm上定义当前computed属性；
    // 否则，在开发环境下判断冲突来源（data、props、methods）并发出相应警告。
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

// 只在上方的initComputed函数和/src/core/global-api/extend.js中的initComputed函数中被调用，
// 用于在target对象上定义计算属性（accessor属性）。
export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 在非服务端渲染的情况下计算属性需要缓存值。
  const shouldCache = !isServerRendering()

  // 设置sharedPropertyDefinition.get和sharedPropertyDefinition.set方法。
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)

    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    
    sharedPropertyDefinition.set = userDef.set || noop
  }

  // 在开发环境下，如果sharedPropertyDefinition.set为noop，则说明开发者未提供当前计算属性的set。
  // 那么，重写sharedPropertyDefinition.set方法，该方法在被调用时发出警告：尝试向当前计算属性赋值，但该计算属性没有setter。
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    // 获取当前计算属性对应的Watcher实例。
    const watcher = this._computedWatchers && this._computedWatchers[key]
    // computed watcher存在，则做三件事：
    // 1. 如果watcher.dirty为真，调用watcher的evaluate方法进行求值（同时进行computed watcher的依赖收集），并将watcher.dirty重设为假；
    // 2. 如果Dep.target存在（一定是render watcher），调用watcher的depend方法，让Dep.target收集computed watcher的所有依赖；
    // 3. 返回watcher的value属性值。
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
    // computed watcher不存在，不做任何事。
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  // 遍历methods，做两件事：
  // 1. 在开发环境下给出相关警告：
  //    · 必须为function类型
  //    · 命名不能和props冲突
  //    · 命名不能和Vue实例预留方法冲突
  // 2. 将方法添加到当前实例上
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  // 遍历vm.$options.watch对象的可枚举键key: handler。
  for (const key in watch) {
    const handler = watch[key]

    // handler可以是一个数组；通过调用createWatcher函数来创建Watcher实例。
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

// 在本文件的initWatch函数和Vue.prototype.$watch方法中被调用：
// 规范化纯对象形式的参数（handler），然后把规范化后的参数传递给vm.$watch方法并返回调用结果。
function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }

  // watch的handler可以直接声明为定义在method中的回调的名称。
  if (typeof handler === 'string') {
    handler = vm[handler]
  }

  return vm.$watch(expOrFn, handler, options)
}

// 在Vue.prototype上定义：$data、$props属性；$set、$delete、$watch方法。
export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }

  const propsDef = {}
  propsDef.get = function () { return this._props }

  // 开发环境下劫持$data和$props的setter，发出不允许修改的警告。
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }

  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 用于观察数据对象的某个属性，当属性变化时执行回调。本质上创建了一个Watcher类实例，并返回unwatchFn()函数。
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this

    // cb为纯对象时，调用createWatcher函数（用于规范化参数，最后调用$watch方法并返回结果）。
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }

    // cb为函数。

    // 创建Watcher类实例。
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)

    // options.immediate为真，则立即执行回调。
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget() // 暂停依赖收集，避免无关依赖被当前render watcher收集。
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info) // 对于在创建时立即执行的回调，其传入参数只有新值，没有旧值。
      popTarget() // 恢复依赖收集。
    }

    // 返回unwatchFn函数，调用watcher.teardown方法解除观察。
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
