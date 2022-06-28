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
// 只负责响应式化相应数据对象的所有属性。
export class Observer {
  value: any;
  dep: Dep; // 属于相应数据对象/数组的Dep实例。
  vmCount: number; // number of vms that have this object as root $data

  // 构造函数做两件事：设置value相应的Observer实例的相关属性；对传入的value的所有属性进行响应式化。
  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    
    // 在数据对象上定义不可枚举的__ob__属性，指向其对应的Observer实例（即this），
    // 主要用于对数据对象增删属性（使用数组变异方法或Vue.set/del）时通过__ob__.dep派发更新。
    def(value, '__ob__', this)

    // 对value的元素/属性进行响应式化：
    // value为数组时，为value提供变异方法，并调用observeArray()方法观测数组元素；
    // value为纯对象时，调用walk()方法响应式化对象属性。
    if (Array.isArray(value)) {
      // hasProto判断当前JavaScript环境是否支持__proto__属性。
      // 根据具体情况使用不同方法，对数组7种变异方法（可以改变数组自身的方法）提供响应式支持。
      if (hasProto) {
        // JS环境支持__proto__属性时，value.__proto__ = arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        // JS环境不支持__proto__属性时，在value上定义arrayMethods的所有属性的 同名 同值 不可枚举 属性，
        // 即7种数组变异方法的拦截方法。
        copyAugment(value, arrayMethods, arrayKeys)
      }

      // 遍历数组元素，进行观测。
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
  // 只在Observer类的构造函数中被调用：遍历对象可枚举属性，调用defineReactive()方法。
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 只在Observer类的构造函数 和 Array异化方法中被调用
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

// helpers：只在Observer类的构造函数中用到。
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
// 尝试为value创建一个observer实例（观测value）：new Observer(value)，并在最后返回。
// 创建observer实例会对value的每项属性进行响应式化。
// asRootData为true时，表示观测的数据为根数据对象data。
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // value 不为对象 或 是VNode实例 时，不进行任何操作，直接return。
  if (!isObject(value) || value instanceof VNode) {
    return
  }

  let ob: Observer | void

  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    // 如果value已经有__ob__属性且__ob__为Observer实例，则说明value已被观测。
    // 将value.__ob__赋给ob，避免重复观测。
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 五个条件：观测未被临时关闭；不是服务端渲染；value是数组或纯对象；
    // value是可扩展的对象（未被Object.preventExtensions/freeze/seal(value)）；
    // value不为Vue实例对象。

    // value未被观测过，则在满足上述条件时新建Observer实例，观测value。
    ob = new Observer(value)
  }
  
  // 如果value对象为根数据对象data，则ob.vmCount++
  if (asRootData && ob) {
    ob.vmCount++
  }

  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 用于将数据对象的数据属性转换为访问器属性。
// 相当于对Object.defineProperty()的一层包裹，主要处理getter/setter相关的逻辑，
// 最后调用Object.defineProperty()设置getter/setter。
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 属于相应数据属性的Dep实例，用于收集该数据属性的依赖和派发该数据属性的更新。

  // 获取obj[key]的descriptor
  const property = Object.getOwnPropertyDescriptor(obj, key)

  // 如果有configurable: false，则obj[key]无法响应式化，直接return（configurable: false无法被撤销）。
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters：尝试从obj[key]的descriptor中获得getter和setter。
  const getter = property && property.get
  const setter = property && property.set

  // 注释见文件末尾。
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 如果shallow参数为true，则不进一步深度观测；否则，尝试观测val并获得返回值（默认进行深度观测）。
  // 如果val不是对象（null和undefined都不是对象）或是VNode实例，childOb为undefined；
  // 否则，childOb为val对应的Observer实例。
  // 通过observe(val)递归地定义响应式。
  let childOb = !shallow && observe(val)
  
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 1. 正确地返回属性值：有原有getter的话调用获得value，没有原有getter则取传入的val。
      const value = getter ? getter.call(obj) : val

      // 2. 依赖收集
      // Dep.target为当前处理的Watcher实例，在Watcher类的get方法中通过调用pushTarget和popTarget方法设置
      if (Dep.target) {
        // 如果当前有正在进行处理的Watcher实例，则进行当前数据项的依赖收集。
        // dep为当前数据项getter的闭包中的Dep实例。
        dep.depend()

        // 如果val有对应的Observer实例（obj[key].__ob__），则也进行相同的依赖收集。
        if (childOb) {
          // 在没有Proxy之前，Vue没有办法拦截到给对象增删属性的操作。
          // 在childOb.dep上收集相同的依赖，使得调用Vue.set和Vue.del增删属性时能够通过__ob__.dep来派发更新。
          childOb.dep.depend()

          // 如果value是数组的话，在每项数组元素的__ob__.dep上进行依赖收集，
          // 使得使用变异方法或Vue.set/del对数组元素进行操作时，也能够通过__ob__.dep派发更新。
          // （Vue不会将数组的索引变成访问器属性，而是在拦截变异方法或Vue.set/del中通过数组的__ob__.dep来派发更新，
          // 所以我们需要在数组的__ob__.dep上收集相应依赖。）
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }

      return value
    },
    set: function reactiveSetter (newVal) {
      // 1. 正确地设置新属性值。
      // 获取旧值。
      const value = getter ? getter.call(obj) : val

      // 如果新值等于旧值，或者newVal和value均为NaN（唯一自身不严格等于自身的值），则视为无改动，直接返回。
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      // 开发环境下如果提供了customSetter，调用customSetter来发出相关警告（辅助信息）。
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }

      // #7981: for accessor properties without setter：进行必要的赋值操作。
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }

      // 如果shallow为true，则不进一步深度观测；否则尝试观测newVal并重写childOb的值。
      childOb = !shallow && observe(newVal)

      // 2. 派发更新。
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 问题：直接使用赋值操作符向一个响应式对象添加新属性，新属性不会具有响应式，也不会触发任何更新。
// 解决方案：Vue提供set方法，用于向一个响应式对象（有相应Observer实例）
// 添加新响应式属性（确保defineReactive过），并通过__ob__.dep派发更新。
// 添加多个新属性可以这样写（写成赋值新对象）：this.obj = Object.assign({}, this.obj, {a: 'a', ...});
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 开发环境下，target值为undefined/null/primitive value时发出警告。
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // target为数组，key是有效的数组索引，使用异化方法修改并返回（如果target是响应式的，会调用拦截异化方法派发更新）。
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val) // remove target[key] and insert val there
    return val
  }

  // 上方的if语句未进入有两种情况：
  // 1. target不是数组，则target是纯对象；
  // 2. target是数组，则key不是有效的数组索引，我们认为是将target作为对象来添加属性。

  // 如果key已经在target或target的原型链上，并且不在Object.prototype上（set方法不改动Object.prototype），
  // 直接赋值并返回。
  // Vue并不会对原型链上的数据进行响应式化。
  // key in target的判断是为了尊重原型链上的属性（https://github.com/vuejs/vue/issues/6845）。
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  // 代码运行到这里，说明正在给对象target添加一个全新的属性。

  // 通过__ob__属性获取target对应的Observer实例。
  const ob = (target: any).__ob__

  // 两类行为不被允许，直接返回，并在开发环境下发出警告：
  // 1. 不允许用set方法向Vue实例对象添加属性（target._isVue为真），以避免出现属性覆盖问题；
  // 2. 不允许用set方法向根data对象添加属性（ob && ob.vmCount为真），因为根data对象本身并不是响应式的，
  // data.__ob__并不会收集到任何依赖，从而向根data对象上添加属性也无法触发任何更新。
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }

  // 如果target没有相应的Observer实例，则target未被观察，那么就简单赋值并返回。
  if (!ob) {
    target[key] = val
    return val
  }

  // target已被观察过，则调用defineReactive方法设置新的响应式属性。
  defineReactive(ob.value, key, val)
  // 派发更新。
  ob.dep.notify()
  // 返回值。
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
// 问题：直接使用delete删除一个响应式对象的已有属性，不会触发任何更新。
// 解决方案：Vue提供del方法，用于删除对象的属性。如果对象是被观测过的，则通过__ob__.dep派发更新。
export function del (target: Array<any> | Object, key: any) {
  // 开发环境下，target值为undefined/null/primitive value时发出警告。
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // target为数组，key是有效的数组索引，使用异化方法来删除（如果target是响应式的，会调用拦截异化方法派发更新）。
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }

  // 通过__ob__属性获取target对应的Observer实例。
  const ob = (target: any).__ob__

  // 我们不应在运行时在 Vue实例或根data对象上 删除响应式属性。
  // 对于上述行为不予删除，直接返回，在开发环境下发出警告。
  // _isVue为true表示target为Vue实例；
  // ob && ob.vmCount为true表示target为根data对象。
  // 不允许删除Vue实例上的属性是出于安全考虑；
  // 不允许删除根data对象上的属性是因为触发不了根data对象的依赖的更新（根data对象没有闭包Dep实例）

  // 两类行为不被允许，直接返回，并在开发环境下发出警告：
  // 1. 不允许用del方法删除Vue实例对象的属性（target._isVue为真），出于安全因素考虑；
  // 2. 不允许用del方法删除根data对象的属性（ob && ob.vmCount为真），因为根data对象本身不是响应式的，
  // data.__ob__并不会收集到任何依赖，从而删除根对象的属性无法触发任何更新。
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 要删除的key并不在target对象自身上，直接返回。
  if (!hasOwn(target, key)) {
    return
  }

  // 通过delete操作符删除target对象自身上的属性；如果target被观测过，则通过target.__ob__.dep派发更新。
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
// 只在defineReactive方法设置的getter中用到：遍历数组元素，递归进行依赖收集。
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]

    // 数组元素存在且有observer的话，通过observer进行依赖收集。
    e && e.__ob__ && e.__ob__.dep.depend()
    
    // 如果e是数组，递归调用dependArray方法进行依赖收集。
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}


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
 * 则observe(val)时val为undefined，从而obj[key]的初始值不会观测，childOb也会是undefined。
 * 一直到修改obj[key]触发setter，setter中的observe(newVal)才会让obj[key]的新值被观测。
 * 
 * 为了解决上面的问题（初始值不被观测），我们区分不提供val的两种用法：
 * 1. 对于 有getter没有setter 的obj[key]，不设置val；
 * 2. 对于 有setter 或 没有getter 的obj[key]，触发getter设置val。
 * 用法1作为问题一的解决方案，不会有多余的触发getter，但初始值也不会被观测；
 * 用法2保证 有setter 或 没有getter 的obj[key]和原来一样，初始值会被观测。
 * 
 * 基于上述情况，有了下方的最终代码：
 * if ((!getter || setter) && arguments.length === 2) {
 *   val = obj[key]
 * }
 */