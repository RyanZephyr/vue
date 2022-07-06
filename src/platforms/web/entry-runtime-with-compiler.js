/* @flow */
// 在运行时版本的Vue构造函数的基础上：重写Vue.prototype.$mount方法；向Vue函数对象添加compile静态方法。

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index' // 导入运行时版本Vue构造函数
import { query } from './util/index'
import { compileToFunctions } from './compiler/index' // 导入compileToFunctions
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

// 根据id获取相应DOM元素的innerHTML，只在下方重写$mount实例方法时被调用。
const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 缓存运行时版本的$mount实例方法，然后重写$mount实例方法，基于运行时版的$mount方法增加编译模板的能力。
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 根据el获取挂载点元素。
  el = el && query(el)

  // 挂载点为<body>或<html>元素时，直接返回，在开发环境下发出警告。
  // 不允许将Vue实例挂载到<body>或<html>元素上，因为挂载点的本意是组件挂载的占位，
  // 它会被组件自身的模板替换掉，而<body>或<html>元素是不能被替换掉的。
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  // 未通过options.render选项提供渲染函数时，使用template（优先）或el选项构建渲染函数，主要分为两步：
  // 1. 基于template或el选项获取模板字符串；2. 将模板字符串编译成渲染函数。
  if (!options.render) {
    let template = options.template
    if (template) {
      // 提供了options.template选项，尝试将template编译成渲染函数。有三种情况：
      // 1. options.template为字符串类型，分两种子情况：
      //    1.1 options.template以#开头，则认为options.template为CSS选择器，用选中元素的innerHTML作为模板字符串；
      //    1.2 options.template不以#开头，则不作任何处理，直接用options.template的值作为模板字符串。
      // 2. options.template为元素节点类型，直接使用该节点的innerHTML作为模板字符串；
      // 3. options.template既不是字符串也不是元素节点，直接返回实例，在开发环境下发出警告：无效template选项。
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 未提供options.template选项，但提供了options.el选项，则使用el.outerHTML作为template的值。
      template = getOuterHTML(el)
    }

    // template不为空，则存在有效模板字符串，尝试将模板字符串编译为渲染函数。
    if (template) {
      // 在DevTools-Performance-Timings中对编译进行性能追踪。
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // 调用compileToFunctions函数将模板字符串编译成渲染函数render，并赋给options.render。
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      // 在DevTools-Performance-Timings中对编译进行性能追踪。
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // 如果通过options.render选项提供了渲染函数，就跳过上面的if语句，直接调用mount函数并返回。
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
// 获取传入元素的outerHTML，只在上方重写$mount实例方法时被调用。
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 一个DOM元素的outerHTML属性不一定存在，例如在IE9-11中SVG标签元素没有innerHTML和outerHTML属性。
    // 将这类元素放进一个新创建的div元素中，div元素的innerHTML就等价于这类元素的outerHTML。
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

// 向Vue函数对象添加将模板字符串编译成渲染函数的静态方法。
Vue.compile = compileToFunctions

// 导出运行时+编译器版本的Vue构造函数
export default Vue
