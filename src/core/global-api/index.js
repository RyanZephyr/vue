/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// 向Vue函数对象添加静态（Vue本身可以直接调用，Vue实例无法调用）
// 属性：config、options、cid
// 方法：set、delete、nextTick、observable、use、extend、component、directive、filter
export function initGlobalAPI (Vue: GlobalAPI) {
  // 向Vue函数对象添加config只读属性，代理/src/core/config.js文件导出的对象。
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // </T>
  // 向Vue函数对象添加options属性
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  extend(Vue.options.components, builtInComponents)
  // Vue.options最终如下：
  // {
  //   components: {
  //     KeepAlive
  //   },
  //   directives: Object.create(null),
  //   filters: Object.create(null),
  //   _base: Vue
  // }

  // 四个方法分别对应同目录下的另外四个文件。
  initUse(Vue) // 向Vue函数对象添加use方法
  initMixin(Vue) // 向Vue函数对象添加mixin方法
  initExtend(Vue) // 向Vue函数对象添加cid静态属性和extend方法
  initAssetRegisters(Vue) // 向Vue函数对象添加component、directive、filter方法
}
