import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

// 向Vue函数对象添加静态属性和方法（Vue本身可以直接调用，Vue实例无法调用）。
initGlobalAPI(Vue)

// 向Vue.prototype添加只读属性$isServer，代理isServerRendering
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

// 向Vue.prototype添加只读属性$ssrContext
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    return this.$vnode && this.$vnode.ssrContext
  }
})

// 向Vue函数对象添加只读静态属性FunctionalRenderContext，在Server-Side Rendering时使用。
// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

// 向Vue函数对象添加属性version，'__VERSION__'会被rollup替换为version的值（见scripts/config.js）。
Vue.version = '__VERSION__'

export default Vue
