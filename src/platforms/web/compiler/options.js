/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,
  directives,
  isPreTag, // 检查传入标签是否是pre标签。
  isUnaryTag, // 检查传入标签是否是一元标签。
  mustUseProp, // 检查在传入的tag和type下，传入的attr是否要使用使用元素对象原生的prop进行绑定。
  canBeLeftOpenTag, // 检查传入标签是否是 不是一元标签 但是可以被补全闭合 的标签。
  isReservedTag, // 检查传入tag是否是保留tag（html标签或SVG标签）。
  getTagNamespace, // 返回传入tag的命名空间。
  staticKeys: genStaticKeys(modules) // 由modules选项数组中每项元素的staticKeys生成一个静态键字符串。
}
