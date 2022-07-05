/* @flow */

import { hasOwn } from 'shared/util'
import { warn, hasSymbol } from '../util/index'
import { defineReactive, toggleObserving } from '../observer/index'

// 初始化provide选项：用provide选项的数据初始化vm._provided属性。
export function initProvide (vm: Component) {
  const provide = vm.$options.provide
  if (provide) {
    vm._provided = typeof provide === 'function'
      ? provide.call(vm)
      : provide
  }
}

// 获取inject数据对象；关闭观测，遍历数据对象属性，在组件实例对象上定义同名同值访问器属性（属性值非响应式）。
// 但如果provide提供的数据本身就是响应式的，那么最终定义在组件实例对象上的属性值也是响应式的。
export function initInjections (vm: Component) {
  const result = resolveInject(vm.$options.inject, vm)

  if (result) {
    toggleObserving(false)

    Object.keys(result).forEach(key => {
      if (process.env.NODE_ENV !== 'production') {
        defineReactive(vm, key, result[key], () => {
          warn(
            `Avoid mutating an injected value directly since the changes will be ` +
            `overwritten whenever the provided component re-renders. ` +
            `injection being mutated: "${key}"`,
            vm
          )
        })
      } else {
        defineReactive(vm, key, result[key])
      }
    })

    toggleObserving(true)
  }
}

// 用于根据当前组件的inject选项寻找相应的数据，并返回inject数据对象。
export function resolveInject (inject: any, vm: Component): ?Object {
  if (inject) {
    // inject is :any because flow is not smart enough to figure out cached
    const result = Object.create(null)
    const keys = hasSymbol
      ? Reflect.ownKeys(inject)
      : Object.keys(inject)

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      // #6574 in case the inject object is observed...
      if (key === '__ob__') continue
      const provideKey = inject[key].from
      let source = vm

      // 沿着父子组件关系链向上寻找inject[key].from，找到了则写进result[key]。
      while (source) {
        // 由于inject的初始化在provide初始化之前，所以不会在从当前组件实例的provide中获取inject的数据。
        if (source._provided && hasOwn(source._provided, provideKey)) {
          result[key] = source._provided[provideKey]
          break
        }
        source = source.$parent
      }

      // 没找到，如果有提供inject.default则取默认值；否则发出警告未找到。
      if (!source) {
        if ('default' in inject[key]) {
          const provideDefault = inject[key].default
          result[key] = typeof provideDefault === 'function'
            ? provideDefault.call(vm)
            : provideDefault
        } else if (process.env.NODE_ENV !== 'production') {
          warn(`Injection "${key}" not found`, vm)
        }
      }
    }

    return result
  }
}
