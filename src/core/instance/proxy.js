/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

// 声明initProxy变量，并在最后导出
let initProxy

// 只在开发环境执行代码
if (process.env.NODE_ENV !== 'production') {
  // makeMap根据传入参数创建一个map，并返回一个函数用于判断传入参数是否在map中。
  // 只在hasHandler.has方法中被调用。
  const allowedGlobals = makeMap(
    'Infinity,undefined,NaN,isFinite,isNaN,' +
    'parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,' +
    'Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,' +
    'require' // for Webpack/Browserify
  )

  // 警告函数，在hasHandler和getHandler中被调用。
  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
      'referenced during render. Make sure that this property is reactive, ' +
      'either in the data option, or for class-based components, by ' +
      'initializing the property. ' +
      'See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.',
      target
    )
  }

  // 警告函数，在hasHandler和getHandler中被调用。
  // 
  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
      'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
      'prevent conflicts with Vue internals. ' +
      'See: https://vuejs.org/v2/api/#data',
      target
    )
  }

  // 标志变量，标志当前JS环境是否原生支持Proxy。
  const hasProxy =
    typeof Proxy !== 'undefined' && isNative(Proxy)

  if (hasProxy) {
    // 当前JS环境原生支持Proxy。
    // makeMap内建修饰符集合。
    const isBuiltInModifier = makeMap('stop,prevent,self,ctrl,shift,alt,meta,exact')

    // 给config.keyCodes设置set代理，防止开发者在自定义键位别名时，覆盖了内置的修饰符。
    config.keyCodes = new Proxy(config.keyCodes, {
      set (target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(`Avoid overwriting built-in modifier in config.keyCodes: .${key}`)
          return false
        } else {
          target[key] = value
          return true
        }
      }
    })
  }

  // has可以拦截：key in proxy / key in Object.create(proxy) / with(proxy) {key;} / Reflect.has(proxy, key)
  // render function中采用的是with语句块。
  const hasHandler = {
    has (target, key) {
      // has是用in运算符得来的结果，表示key是否为target对象或其原型链上的属性。
      const has = key in target

      // isAllowed在两种情况下为真：
      // 1. key在allowedGlobals创建的map之内，是特殊全局变量；
      // 2. key是以_开头的字符串且不在target.$data中。
      // isAllowed为真时，不发出警告，认为target不has key。
      // 这使得可以在模板中使用全局对象、使用渲染函数的内部方法（_c、_v等）而不得到警告。
      const isAllowed = allowedGlobals(key) ||
        (typeof key === 'string' && key.charAt(0) === '_' && !(key in target.$data))

      // key不在target上，且key不是特殊全局变量，也不是 不在target.$data上的以_开头的字符串。
      if (!has && !isAllowed) {
        if (key in target.$data) {
          // key在target.$data上却不在target上，说明key是$data里声明的以_或$开头的属性名，
          // 它们不会被代理到实例上，需通过target.$data访问。因此发出相关警告。
          warnReservedPrefix(target, key)
        } else {
          // key不在target.$data上也不在target上，且不以_开头，则警告在模板中使用了未声明的变量。
          warnNonPresent(target, key)
        }
      }

      // 两种情况下视为key has target：
      // 1. key in target为真。
      // 2. key in target为假，key不是特殊全局属性，且key是：
      //    不在target.$data上的不以_开头的字符串（对应warnNonPresent） 或 
      //    在target.$data上的以_或$开头的字符串（对应warnReservedPrefix）。
      return has || !isAllowed
    }
  }

  // vue-loader会将template编译为不使用with语句的render function，并设置render._withStripped = true。
  // render通过vm['a']或vm.a形式访问属性，has无法拦截，所以需要使用get拦截。
  // 通过vm['a']/vm.a的形式访问属性，使得访问全局变量不会被get拦截，省去了对全局变量检查的需要（在with中访问全局变量会先被has拦截）。
  const getHandler = {
    get (target, key) {
      if (typeof key === 'string' && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key)
        else warnNonPresent(target, key)
      }
      return target[key]
    }
  }

  // initProxy函数给传入的vm对象添加_renderProxy属性。
  initProxy = function initProxy (vm) {
    if (hasProxy) {
      // 当前JS环境原生支持Proxy，则使用Proxy对vm做一层代理并赋给vm._renderProxy。
      // 目的：在开发环境下更好地提供必要的提示信息。

      // determine which proxy handler to use
      const options = vm.$options
      // options.render._withStripped在 测试代码中/使用vue-loader时 出现，所以一般使用hasHandler作为代理配置。
      const handlers = options.render && options.render._withStripped
        ? getHandler
        : hasHandler

      vm._renderProxy = new Proxy(vm, handlers)
    } else {
      // 当前JS环境不原生支持Proxy，直接设置vm._renderProxy。
      vm._renderProxy = vm
    }
  }
}

export { initProxy }
