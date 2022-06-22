/* @flow */

import config from '../config'
import { warn } from './debug'
import { set } from '../observer/index'
import { unicodeRegExp } from './lang'
import { nativeWatch, hasSymbol } from './env'

import {
  ASSET_TYPES,
  LIFECYCLE_HOOKS
} from 'shared/constants'

import {
  extend,
  hasOwn,
  camelize,
  toRawType,
  capitalize,
  isBuiltInTag,
  isPlainObject
} from 'shared/util'

// start - 对config.optionMergeStrategies进行设置
// strats.el/propsData/data/lifecycle_hooks/assets(components/directives/filters)/
// watch/props/methods/inject/computed/provide

/**
 * Option overwriting strategies are functions that handle
 * how to merge a parent option value and a child option
 * value into the final value.
 */
const strats = config.optionMergeStrategies

/**
 * Options with restrictions
 */
// 开发环境下设置strats.el、strats.propsData，实际上就是包裹默认strat，在没有提供vm时发出警告：
// el选项或propsData选项只能在使用new操作符创建实例时可用。
// 没有提供vm说明正在处理的是子组件的选项。
if (process.env.NODE_ENV !== 'production') {
  strats.el = strats.propsData = function (parent, child, vm, key) {
    if (!vm) {
      warn(
        `option "${key}" can only be used during instance ` +
        'creation with the `new` keyword.'
      )
    }
    return defaultStrat(parent, child)
  }
}


// strats.data - start

/**
 * Helper that recursively merges two data objects together.
 */
// 只在mergeDataOrFn方法中被调用（child, parent），真正进行两个纯对象的合并。
// 具体地，该方法将parent对象（from）的属性混合到child对象（to）中，最后返回child对象（最终数据对象）。
function mergeData (to: Object, from: ?Object): Object {
  if (!from) return to
  let key, toVal, fromVal

  // 获取from对象的所有key，如果环境支持Symbol则一并获取Symbol key。
  // Reflect.ownKeys方法获取传入对象上的所有属性名（包括不可枚举的属性，包括Symbol属性）。
  // Object.keys方法只获取传入对象上的所有可枚举属性名。
  const keys = hasSymbol
    ? Reflect.ownKeys(from)
    : Object.keys(from)

  // 遍历from对象的所有key。
  for (let i = 0; i < keys.length; i++) {
    key = keys[i]

    // in case the object is already observed...
    if (key === '__ob__') continue // 跳过__ob__
    toVal = to[key]
    fromVal = from[key]

    if (!hasOwn(to, key)) {
      // to对象中没有key：调用set函数为to对象设置key及相应的值fromVal。
      set(to, key, fromVal)
    } else if (
      toVal !== fromVal &&
      isPlainObject(toVal) &&
      isPlainObject(fromVal)
    ) {
      // to对象中有key，且toVal和fromVal均为纯对象：调用递归调用mergeData函数进行深度合并。
      mergeData(toVal, fromVal)
    }
  }

  return to
}

/**
 * Data
 */
// 在strats.data中被调用；被赋给strats.provide。
// 该方法一定会返回一个函数（parentVal/childVal/mergedDataFn/mergedInstanceDataFn）。
export function mergeDataOrFn (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  if (!vm) {
    // 没有提供vm，说明处理的是子组件的选项。

    // in a Vue.extend merge, both should be functions
    // 没有提供vm时，childVal和parentVal只要存在，就一定是函数：
    // 1. 二者均不存在，不会调用该方法，因此调用该方法时，两者必有其一；
    // 2. childVal存在，则childVal（即子组件的options中的data）一定是函数。
    // 3. Vue.options中没有data；因此parentVal（即父类的options中的data）如果存在，就一定来自某个组件类，从而一定是函数。

    // childVal和parentVal至少有一个存在。
    // 只有一个存在时，返回存在的值（值为函数）。
    if (!childVal) {
      return parentVal
    }
    if (!parentVal) {
      return childVal
    }

    // 二者均存在时，返回函数mergedDataFn；调用该函数会调用mergeData函数并返回结果。
    // when parentVal & childVal are both present,
    // we need to return a function that returns the
    // merged result of both functions... no need to
    // check if parentVal is a function here because
    // it has to be a function to pass previous merges.
    return function mergedDataFn () {
      return mergeData(
        typeof childVal === 'function' ? childVal.call(this, this) : childVal,
        typeof parentVal === 'function' ? parentVal.call(this, this) : parentVal
      )
    }
  } else {
    // 提供了vm，说明是在使用new操作符创建实例时合并options，直接返回函数mergedInstanceDataFn。
    return function mergedInstanceDataFn () {
      // instance merge
      const instanceData = typeof childVal === 'function'
        ? childVal.call(vm, vm)
        : childVal
      const defaultData = typeof parentVal === 'function'
        ? parentVal.call(vm, vm)
        : parentVal

      if (instanceData) {
        return mergeData(instanceData, defaultData)
      } else {
        return defaultData
      }
    }
  }
}

// strats.data要么返回undefined（父类为Vue且子组件提供的data选项值不为函数），
// 要么返回一个函数（调用mergeDataOrFn返回的结果）。
strats.data = function (
  parentVal: any,
  childVal: any,
  vm?: Component
): ?Function {
  // 没有提供vm，说明正在处理子组件的data选项。
  if (!vm) {
    // 子组件提供了data选项，但选项值不为函数，则：
    // 1. 在开发环境下发出警告：子组件的data选项值必须为函数。
    // 2. 返回parentVal。
    if (childVal && typeof childVal !== 'function') {
      process.env.NODE_ENV !== 'production' && warn(
        'The "data" option should be a function ' +
        'that returns a per-instance value in component ' +
        'definitions.',
        vm
      )

      return parentVal
    }

    // 不属于上面的特殊情况，则不传vm地 调用mergeDataOrFn并返回结果。
    return mergeDataOrFn(parentVal, childVal)
  }

  // 提供了vm，说明正在处理的不是子组件的data选项，而是使用new操作符创建实例时的data选项。
  // 传vm地 调用mergeDataOrFn并返回结果。
  return mergeDataOrFn(parentVal, childVal, vm)
}

// strats.data - end


// strats.hooks - start

/**
 * Hooks and props are merged as arrays.
 */
// 只作为所有生命周期钩子的合并策略函数，返回数组或undefined。
function mergeHook (
  parentVal: ?Array<Function>,
  childVal: ?Function | ?Array<Function>
): ?Array<Function> {
  // Vue.options中没有任何生命周期钩子选项。
  // 因此如果parentVal存在，那么它一定已经经过mergeHook处理，从而一定是数组。
  // 合并parentVal和childVal为数组并赋给res。
  const res = childVal
    ? parentVal
      ? parentVal.concat(childVal)
      : Array.isArray(childVal)
        ? childVal
        : [childVal]
    : parentVal

  // 如果res存在，调用dedupeHooks函数来剔除res中的重复项。
  return res
    ? dedupeHooks(res)
    : res
}

// 只在mergeHook函数中被调用，剔除多余的重复hook。
function dedupeHooks (hooks) {
  const res = []
  for (let i = 0; i < hooks.length; i++) {
    if (res.indexOf(hooks[i]) === -1) {
      res.push(hooks[i])
    }
  }
  return res
}

// 设置所有生命周期钩子的合并策略函数strats[hook]为mergeHook函数。
LIFECYCLE_HOOKS.forEach(hook => {
  strats[hook] = mergeHook
})

// strats.hooks - end


// strats.assets - start

/**
 * Assets
 *
 * When a vm is present (instance creation), we need to do
 * a three-way merge between constructor options, instance
 * options and parent options.
 */
function mergeAssets (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): Object {
  // 以parentVal为原型创建对象res。
  const res = Object.create(parentVal || null)

  if (childVal) {
    // 开发环境下，判断childVal是否是纯对象，如果不是就发出相关警告
    process.env.NODE_ENV !== 'production' && assertObjectType(key, childVal, vm)

    // childVal存在：调用extend函数将childVal上的属性混合到res对象上并返回。
    return extend(res, childVal)
  } else {
    // childVal不存在：直接返回res对象。
    return res
  }
}

ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets
})

// strats.assets - end


/**
 * Watchers.
 *
 * Watchers hashes should not overwrite one
 * another, so we merge them as arrays.
 */
strats.watch = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // work around Firefox's Object.prototype.watch...
  if (parentVal === nativeWatch) parentVal = undefined
  if (childVal === nativeWatch) childVal = undefined

  // 如果没有childVal，直接以parentVal为原型创建对象并返回。
  if (!childVal) return Object.create(parentVal || null)

  // 有childVal，则在开发环境下检验childVal是否是一个纯对象，不是则发出相关警告。
  if (process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  // 有childVal，没有parentVal，直接返回childVal。
  if (!parentVal) return childVal

  // childVal和parentVal都存在：
  // 1. 新建空对象ret。
  const ret = {}
  // 2. 将parentVal的所有属性混合到ret中。
  extend(ret, parentVal)
  // 3. 遍历childVal的所有属性，监测childVal的属性（child）是否也在parentVal中（parent），
  // 如果存在就将parent和child合并到一个数组存入ret[key]；不存在就将child变成一个数组存入ret[key]。
  // 注意：只存在于parentVal且不存在于childVal的属性不会被强制转为数组，
  // 所以被合并处理后的watch选项下的每个属性值，可能是一个数组，也可能是一个函数。
  for (const key in childVal) {
    let parent = ret[key]
    const child = childVal[key]

    if (parent && !Array.isArray(parent)) {
      parent = [parent]
    }
    ret[key] = parent
      ? parent.concat(child)
      : Array.isArray(child) ? child : [child]
  }
  // 4. 返回ret。
  return ret
}

/**
 * Other object hashes.
 */
// props/methods/inject/computed选项值都为纯对象。
strats.props =
strats.methods =
strats.inject =
strats.computed = function (
  parentVal: ?Object,
  childVal: ?Object,
  vm?: Component,
  key: string
): ?Object {
  // 如果childVal存在，在开发环境下检验其是否为纯对象，不是的话发出相关警告。
  if (childVal && process.env.NODE_ENV !== 'production') {
    assertObjectType(key, childVal, vm)
  }

  // parentVal不存在，直接返回childVal。
  if (!parentVal) return childVal

  // parentVal存在，创建ret空对象，先后将parentVal和childVal的属性混合进ret，最后返回ret。
  // childVal会覆盖parentVal的同名属性。
  const ret = Object.create(null)
  extend(ret, parentVal)
  if (childVal) extend(ret, childVal)
  return ret
}

strats.provide = mergeDataOrFn

// end - 对config.optionMergeStrategies进行设置

/**
 * Default strategy.
 */
// 只要childVal不是undefined就使用childVal，否则使用parentVal。
const defaultStrat = function (parentVal: any, childVal: any): any {
  return childVal === undefined
    ? parentVal
    : childVal
}

/**
 * Validate component names
 */
// 只在mergeOptions函数中被调用，用于检验组件命名是否合法，发出相关警告。
function checkComponents (options: Object) {
  for (const key in options.components) {
    validateComponentName(key)
  }
}

// 在本文件中，只在checkComponents函数中被调用。
export function validateComponentName (name: string) {
  if (!new RegExp(`^[a-zA-Z][\\-\\.0-9_${unicodeRegExp.source}]*$`).test(name)) {
    warn(
      'Invalid component name: "' + name + '". Component names ' +
      'should conform to valid custom element name in html5 specification.'
    )
  }
  if (isBuiltInTag(name) || config.isReservedTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component ' +
      'id: ' + name
    )
  }
}

/**
 * Ensure all props option syntax are normalized into the
 * Object-based format.
 */
// 只在mergeOptions中被调用，将props规范化成对象语法格式
function normalizeProps (options: Object, vm: ?Component) {
  const props = options.props
  if (!props) return
  const res = {}
  let i, val, name
  if (Array.isArray(props)) {
    i = props.length
    while (i--) {
      val = props[i]
      if (typeof val === 'string') {
        name = camelize(val)
        res[name] = { type: null }
      } else if (process.env.NODE_ENV !== 'production') {
        warn('props must be strings when using array syntax.')
      }
    }
  } else if (isPlainObject(props)) {
    for (const key in props) {
      val = props[key]
      name = camelize(key)
      res[name] = isPlainObject(val)
        ? val
        : { type: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "props": expected an Array or an Object, ` +
      `but got ${toRawType(props)}.`,
      vm
    )
  }
  options.props = res
}

/**
 * Normalize all injections into Object-based format
 */
// 只在mergeOptions中被调用，将inject规范化成对象语法格式
function normalizeInject (options: Object, vm: ?Component) {
  const inject = options.inject
  if (!inject) return
  const normalized = options.inject = {}
  if (Array.isArray(inject)) {
    for (let i = 0; i < inject.length; i++) {
      normalized[inject[i]] = { from: inject[i] }
    }
  } else if (isPlainObject(inject)) {
    for (const key in inject) {
      const val = inject[key]
      normalized[key] = isPlainObject(val)
        ? extend({ from: key }, val)
        : { from: val }
    }
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `Invalid value for option "inject": expected an Array or an Object, ` +
      `but got ${toRawType(inject)}.`,
      vm
    )
  }
}

/**
 * Normalize raw function directives into object format.
 */
// 只在mergeOptions中被调用，将directives规范化为对象语法格式
function normalizeDirectives (options: Object) {
  const dirs = options.directives
  if (dirs) {
    for (const key in dirs) {
      const def = dirs[key]
      if (typeof def === 'function') {
        dirs[key] = { bind: def, update: def }
      }
    }
  }
}

// 只在mergeAssets函数、strats.watch方法、strats.computed方法中被调用。
// 判断传入的value是否为纯对象，不是则发出警告。
function assertObjectType (name: string, value: any, vm: ?Component) {
  if (!isPlainObject(value)) {
    warn(
      `Invalid value for option "${name}": expected an Object, ` +
      `but got ${toRawType(value)}.`,
      vm
    )
  }
}

/**
 * Merge two option objects into a new one.
 * Core utility used in both instantiation and inheritance.
 */
// 该函数在实例化时（_init方法中）被调用，在继承中（Vue.extend中）被调用。
// 两部分工作：预处理parent和child；合并parent和child的属性。
export function mergeOptions (
  parent: Object,
  child: Object,
  vm?: Component
): Object {
  // 开发环境下验证child.components中所有key的命名是否合法
  if (process.env.NODE_ENV !== 'production') {
    checkComponents(child)
  }

  // 如果child为function（child为组件），取child.options为child
  if (typeof child === 'function') {
    child = child.options
  }

  // 规范化child中的props/inject/directives至对象语法格式
  normalizeProps(child, vm)
  normalizeInject(child, vm)
  normalizeDirectives(child)

  // Apply extends and mixins on the child options,
  // but only if it is a raw options object that isn't
  // the result of another mergeOptions call.
  // Only merged options has the _base property.
  // 一开始时，只有Vue.options._base为true。
  // 因此，如果child._base为true，说明child是某次mergeOptions调用的结果，
  // 那么child.extends和child.mixins已经被合并进了child，不需要再次合并。
  if (!child._base) {
    if (child.extends) {
      parent = mergeOptions(parent, child.extends, vm)
    }
    if (child.mixins) {
      for (let i = 0, l = child.mixins.length; i < l; i++) {
        parent = mergeOptions(parent, child.mixins[i], vm)
      }
    }
  }

  // 到这里为止，mergeOptions都在对parent和child进行预处理；
  // 接下来，进行选项合并。

  const options = {}

  let key
  // 遍历parent的所有key，调用mergeField(key)将key加入到最终结果。
  for (key in parent) {
    mergeField(key)
  }

  // 对于child中有、parent中没有的key，调用mergeField(key)将key加入到最终结果。
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key)
    }
  }


  function mergeField (key) {
    // 选取key相应的合并策略函数（starts中声明或取默认的defaultStrat）
    const strat = strats[key] || defaultStrat
    // 调用 strat函数来合并key选项
    options[key] = strat(parent[key], child[key], vm, key)
  }

  return options
}

/**
 * Resolve an asset.
 * This function is used because child instances need access
 * to assets defined in its ancestor chain.
 */
export function resolveAsset (
  options: Object,
  type: string,
  id: string,
  warnMissing?: boolean
): any {
  if (typeof id !== 'string') {
    return
  }
  const assets = options[type]
  // check local registration variations first
  if (hasOwn(assets, id)) return assets[id]
  const camelizedId = camelize(id)
  if (hasOwn(assets, camelizedId)) return assets[camelizedId]
  const PascalCaseId = capitalize(camelizedId)
  if (hasOwn(assets, PascalCaseId)) return assets[PascalCaseId]
  // fallback to prototype chain
  const res = assets[id] || assets[camelizedId] || assets[PascalCaseId]
  if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
    warn(
      'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
      options
    )
  }
  return res
}
