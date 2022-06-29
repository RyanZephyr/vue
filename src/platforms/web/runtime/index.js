/* @flow */
// 对Vue进行web平台化的包装：
// 设置平台化的config；
// 在Vue.options上混合进两个指令，model和show；
// 在Vue.options上混合进两个组件，Transition和TransitionGroup；
// 在Vue.prototype上添加两个方法，__patch__和$mount。

import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
import platformDirectives from './directives/index'
import platformComponents from './components/index'

// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// install platform runtime directives & components
extend(Vue.options.directives, platformDirectives)
extend(Vue.options.components, platformComponents)
// Vue.options变成：
// {
// 	components: {
// 		KeepAlive,
// 		Transition,
// 		TransitionGroup
// 	},
// 	directives: {
// 		model,
// 		show
// 	},
// 	filters: Object.create(null),
// 	_base: Vue
// }

// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method：el参数为字符串或DOM元素，hydrating参数用于VDOM补丁算法。
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && inBrowser ? query(el) : undefined

  // 采用运行时版本的Vue时，需要开发者通过options.render给组件提供渲染函数，从而传给mountComponent方法。
  return mountComponent(this, el, hydrating) 
}

// devtools global hook
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

// 导出完全成型的运行时版本Vue构造函数
export default Vue
