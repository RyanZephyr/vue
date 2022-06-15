/* @flow */
// 类：Observer
// 方法：toggleObserving、observe、defineReactive、set、del
// 变量：shouldObserve
// 只有一个地方新建Observer类的实例：observe方法
// 每个对象数据项（非VNode实例）都对应一个Observer实例

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

// 获得arrayMethods对象本身的所有非Symbol属性名的数组
// 只用于一处：当前环境不支持__proto__时，将arrayMethods的所有属性赋给数组对象
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
// shouldObserve在两处被直接调用：
// 1. observe方法（本文件中）
// 2. validateProp方法（src/core/util/props.js文件中）
export let shouldObserve: boolean = true

// toggleObserving在四处被完整调用（先toggle到false，再toggle到true）
export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  // 构造函数做两件事：
  // 设置value相应的Observer实例的相关属性
  // 对传入的value的所有属性进行响应式化
  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 在数据对象上定义不可枚举的__ob__属性，指向其对应的Observer（即this）
    def(value, '__ob__', this)

    // 对value进行响应式化：
    // value为数组时，调用observeArray()方法
    // value为纯对象时，调用walk()方法
    if (Array.isArray(value)) {
      // hasProto判断当前JavaScript环境是否支持__proto__属性
      // 根据具体情况使用不同方法，对数组7种可以改变自身的方法提供响应式支持
      if (hasProto) {
        // JS环境支持__proto__属性时，
        // value.__proto__ = arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        // JS环境不支持__proto__属性时，
        // 直接将arrayMethods的所有属性赋给数组对象，
        // 其中包括数组修改拦截方法
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 遍历对象属性，调用defineReactive()方法
  // 递归借助observe()方法实现
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 遍历数组元素，调用observe()方法
  // 递归借助observe()方法实现
  // 实际上Object.defineProperty方法也可以将数组元素转换为getter/setter，
  // 但是出于性能考量，Vue选择提供七种数组原生方法的响应式特化方法，而不是响应式getter/setter。
  // 因此在这里不调用defineReactive(items, i)，而是直接调用observe(items[i])
  // 详见：https://segmentfault.com/a/1190000015783546?_ea=4074035 
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers
// 只在Observer类的构造函数中用到

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  target.__proto__ = src
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 尝试为value创建一个observer实例：new Observer(value)。
// 创建observer实例的过程中会对value的每项属性进行响应式化。
// 最后返回value对应的Observer实例。
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // value 不为对象 或 是VNode实例 时，不进行任何操作，直接return
  if (!isObject(value) || value instanceof VNode) {
    return
  }

  let ob: Observer | void

  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 如果value已经有__ob__属性且__ob__为Observer实例，则说明value已被观察
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 否则，满足上述条件时新建Observer实例，观察value
    ob = new Observer(value)
  }
  
  // 如果value对象为根$data对象，则ob.cmCount++
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 相当于对Object.defineProperty()的一层包裹
// 主要处理getter/setter相关的逻辑，最后调用Object.defineProperty()设置getter/setter
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  // 获取obj[key]的descriptor
  const property = Object.getOwnPropertyDescriptor(obj, key)

  // 如果有configurable: false，则obj[key]无法响应式化，直接return
  // configurable: false无法被撤销
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 尝试从obj[key]的descriptor中获得getter和setter
  const getter = property && property.get
  const setter = property && property.set

  /** 
   * 问题一
   * 下方这个if判断一开始是没有的，这就使得调用defineReactive必须提供val。
   * 但是提供val的话可能会触发getter，如果val本身是一个accessor。
   * 这种情况的触发getter可能会造成一些需求上的偏差（比如程序员决定在getter里发出一些请求，并自主决定什么时候触发getter从而发出这些请求）。
   * 因此，我们希望调用defineReactive不必须提供val，从而避免多余的触发getter。
   * 
   * 为了解决上面的问题，通过增加if语句，区分不提供val的两种情况：
   * 1. obj[key]没有getter，推断是普通类型属性，不会触发额外getter，进入if语句，将obj[key]赋给val，obj[key]初始值具有响应式，最终getter通过val获取值。
   * 2. obj[key]有getter，要避免触发额外getter，跳过if语句，obj[key]初始值不具有响应式，最终getter通过调用原始getter获取值。
   * 
   * 基于上述情况，有了下方的代码：
   * if (!getter && arguments.length === 2) {
   *   val = obj[key]
   * }
   * 
   * 问题二
   * 基于上述改动，有了新的问题：
   * 对于既有getter也有setter的obj[key]，如果不传入val，
   * 则observe(val)时val为undefined，从而obj[key]的初始值不会被响应式化，childOb也会是undefined。
   * 一直到修改obj[key]触发setter，setter中的observe(newVal)才会让obj[key]的新值响应式化。
   * 
   * 为了解决上面的问题，我们区分不提供val的两种用法：
   * 1. 如果想要不触发额外getter，就提供只有getter，没有setter的obj[key]
   * 2. 否则，对于既有getter，也有setter的obj[key]，我们触发getter设置val
   * 用法1作为上方问题一的解决方案，不会有多余的触发getter，但初始值也不会被响应式化（不过好像也不需要响应式化，因为没有提供setter，就不会有修改）。
   * 用法2保证既有getter也有setter的obj[key]和原来一样，初始值会被响应式化。
   * 此外，我们认为没有 没有getter但是有setter 的情况。
   * 
   * 基于上述情况，有了下方的最终代码：
   */
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 如果shallow参数为true，则不进一步深度观测；否则，尝试观测val。
  // 如果val不是对象（null和undefined都不是对象）或是VNode实例，childOb为undefined；
  // 否则，childOb为val对应的Observer实例。
  let childOb = !shallow && observe(val)
  
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 有getter的话调用getter获得value，没有getter则取传入的val
      const value = getter ? getter.call(obj) : val

      // 依赖收集
      if (Dep.target) {
        // 如果当前有正在进行依赖收集的Watcher，则进行当前数据项的依赖收集
        // dep为当前数据项getter的闭包中的Dep类实例
        dep.depend()

        // 如果val有对应的Observer实例，则也进行依赖收集
        if (childOb) {
          childOb.dep.depend()
          // 如果value是数组的话，对数组每项进行依赖收集
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }

      return value
    },
    set: function reactiveSetter (newVal) {
      // 获取旧值
      const value = getter ? getter.call(obj) : val

      // 如果新值等于旧值，或者newVal和value均为NaN（唯一自身不严格等于自身的值），则视为无改动，直接返回
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      // 开发环境下调用customSetter，发出相关警告
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }

      // #7981: for accessor properties without setter
      // 进行必要的赋值操作
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }

      // 如果shallow为true，则不进一步深度观测；否则尝试观测newVal。
      childOb = !shallow && observe(newVal)
      // 派发更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 开发环境下，对未定义的target或原始类型的target发出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // target为数组，key是有效的数组索引，直接修改并返回（会调用数组异化方法）
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val) // remove target[key] and insert val there
    return val
  }

  // 如果key已经在target上，并且不在Object.prototype上，
  // 直接赋值并返回
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  const ob = (target: any).__ob__

  // _isVue为true表示target为Vue实例
  // ob && ob.vmCount为true表示target为根data对象
  // 我们不应在运行时向Vue实例或根data对象上添加响应式属性
  // 因此直接返回，在开发环境下发出警告
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }

  // 如果target没有相应的Observer实例，则target不是响应式对象，直接给其赋值并返回
  if (!ob) {
    target[key] = val
    return val
  }

  // target是响应式对象，调用defineReactive方法设置响应式属性
  defineReactive(ob.value, key, val)
  // 派发更新
  ob.dep.notify()
  // 返回值
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  // 开发环境下，对未定义的target或原始类型的target发出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // target为数组，key是有效的数组索引，直接删除并返回
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }

  const ob = (target: any).__ob__
  // _isVue为true表示target为Vue实例
  // ob && ob.vmCount为true表示target为根data对象
  // 我们不应在运行时向Vue实例或根data对象上添加响应式属性
  // 因此在开发环境下发出警告并直接返回
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 如果要删除的key并不在target对象上，直接返回
  if (!hasOwn(target, key)) {
    return
  }

  // 通过delete操作符删除target对象上的属性；
  // 如果target有observer，则派发更新
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
// 只在defineReactive方法设置的getter中用到
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
