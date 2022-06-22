/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

export function initMixin (Vue: Class<Component>) {
  // _init方法做的事情：
  // 1. 给实例添加唯一表示_uid属性；
  // 2. 给实例添加_isVue属性（取值为true），标记实例对象为Vue实例，避免实例被观测；
  // 3. 合并相关options，给实例添加$options属性；
  // 4. 设置render的代理（开发环境为new Proxy()实例，生产环境为自身）；
  // 5. 初始化生命周期、事件、render，调用beforeCreate生命周期钩子；
  // 6. 初始化injection、state、provide，调用created生命周期钩子；
  // 7. 如果提供了el配置项，则将实例挂载到真实DOM。
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    // 在DevTools-Performance-Timings中对组件初始化进行性能追踪：
    // 分别在组件初始化开始前和完成时调用mark方法打上两个标记startTag和endTag，
    // 然后调用measure方法基于这两个标记点进行性能计算。
    let startTag, endTag
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      // 开发环境下调用initProxy函数设置vm._renderProxy。
      initProxy(vm)
    } else {
      // 生产环境下直接设置vm._renderProxy。
      vm._renderProxy = vm
    }

    // expose real self
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    // 在DevTools-Performance-Timings中对组件初始化进行性能追踪
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果声明了el选项，挂载实例
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 只在_init方法中被调用。
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 从实例的构造函数获取options
export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options // 获取传入的构造函数对象的options属性

  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }

  return options
}

// 只在resolveConstructorOptions方法中被调用。
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
