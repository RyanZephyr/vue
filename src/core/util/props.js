/* @flow */
// 只导出一个函数：validateProp。

import { warn } from './debug'
import { observe, toggleObserving, shouldObserve } from '../observer/index'
import {
  hasOwn,
  isObject,
  toRawType,
  hyphenate,
  capitalize,
  isPlainObject
} from 'shared/util'

type PropOptions = {
  type: Function | Array<Function> | null,
  default: any,
  required: ?boolean,
  validator: ?Function
};

// 校验prop，求值并返回。
export function validateProp (
  key: string,
  propOptions: Object,
  propsData: Object,
  vm?: Component
): any {
  const prop = propOptions[key] // 获取当前prop的定义。
  const absent = !hasOwn(propsData, key) //标识当前prop是否缺失传入值。
  let value = propsData[key] // 获取当前prop的传入值。

  // boolean casting：获取Boolean在prop.type（可以是数组）的index。
  const booleanIndex = getTypeIndex(Boolean, prop.type)

  // booleanIndex > -1，说明prop.type包括Boolean，预先处理两种情况：
  // 1. 当前prop缺失传入值，且没有定义prop.default，则value取false。
  // 2. 传入值为空字符串（<a someProp>即<a someProp="">）或prop名字的kebab-case（<a someProp='some-prop'>）时，
  //    在Boolean类型先于（优先级高于）String类型时，value取true。
  if (booleanIndex > -1) {
    if (absent && !hasOwn(prop, 'default')) {
      value = false
    } else if (value === '' || value === hyphenate(key)) {
      // only cast empty string / same name to boolean if
      // boolean has higher priority
      const stringIndex = getTypeIndex(String, prop.type)
      if (stringIndex < 0 || booleanIndex < stringIndex) {
        value = true
      }
    }
  }

  // check default value
  if (value === undefined) {
    value = getPropDefaultValue(vm, prop, key) // 获取prop默认值。
    // since the default value is a fresh copy,
    // make sure to observe it.
    // 默认值是写在prop定义中，所以是非响应式的。因此需要在此开启观测并观测默认值，然后恢复之前的观测状态。
    const prevShouldObserve = shouldObserve
    toggleObserving(true)
    observe(value)
    toggleObserving(prevShouldObserve)
  }

  // 在开发环境下调用assertProp函数，对prop进行校验，发出相关警告。
  if (
    process.env.NODE_ENV !== 'production' &&
    // skip validation for weex recycle-list child component props
    !(__WEEX__ && isObject(value) && ('@binding' in value))
  ) {
    assertProp(prop, key, value, vm, absent)
  }

  return value
}

/**
 * Get the default value of a prop.
 */
function getPropDefaultValue (vm: ?Component, prop: PropOptions, key: string): any {
  // no default, return undefined
  if (!hasOwn(prop, 'default')) {
    return undefined
  }

  const def = prop.default

  // warn against non-factory defaults for Object & Array：防止多个组件实例引用同一数据对象导致的问题。
  if (process.env.NODE_ENV !== 'production' && isObject(def)) {
    warn(
      'Invalid default value for prop "' + key + '": ' +
      'Props with type Object/Array must use a factory function ' +
      'to return the default value.',
      vm
    )
  }

  // the raw prop value was also undefined from previous render,
  // return previous default value to avoid unnecessary watcher trigger：如果前次也是取非空默认值，则返回前次默认值（同一引用）来避免不必要的watcher更新。
  if (vm && vm.$options.propsData &&
    vm.$options.propsData[key] === undefined &&
    vm._props[key] !== undefined
  ) {
    return vm._props[key]
  }

  // call factory function for non-Function types
  // a value is Function if its prototype is function even across different execution context
  return typeof def === 'function' && getType(prop.type) !== 'Function'
    ? def.call(vm)
    : def
}

/**
 * Assert whether a prop is valid. 只在validateProp函数中被调用。
 */
function assertProp (
  prop: PropOptions,
  name: string,
  value: any,
  vm: ?Component,
  absent: boolean
) {
  // 如果未提供prop.required=true的prop的值（不考虑默认值），发出警告并直接返回。
  if (prop.required && absent) {
    warn(
      'Missing required prop: "' + name + '"',
      vm
    )
    return
  }

  // 如果value为null或undefined，且prop不是必须的，则无需后需校验，直接返回。
  if (value == null && !prop.required) {
    return
  }

  // 类型断言：判断传入的prop值的类型是否符合prop.type（注：prop.type为null/undefined/true时，prop值可以为任意类型）。
  let type = prop.type
  let valid = !type || type === true // 类型断言是否通过的标志。
  const expectedTypes = []
  if (type) {
    if (!Array.isArray(type)) { // 如果type不是数组，则将其转为只有一个元素的数组。
      type = [type]
    }

    // 一旦某个类型通过断言，valid就变为真，并结束for循环。
    for (let i = 0; i < type.length && !valid; i++) {
      const assertedType = assertType(value, type[i], vm) // 真正地进行类型断言。
      expectedTypes.push(assertedType.expectedType || '')
      valid = assertedType.valid
    }
  }

  // 判断expectedTypes数组中是否有非空type。
  const haveExpectedTypes = expectedTypes.some(t => t)
  // prop.type中有有效类型，但传入的prop值没有匹配，则发出警告，并直接返回。
  if (!valid && haveExpectedTypes) {
    warn(
      getInvalidTypeMessage(name, value, expectedTypes),
      vm
    )
    return
  }

  // 断言用户提供的validator，未通过则发出相关警告。
  const validator = prop.validator
  if (validator) {
    if (!validator(value)) {
      warn(
        'Invalid prop: custom validator check failed for prop "' + name + '".',
        vm
      )
    }
  }
}

const simpleCheckRE = /^(String|Number|Boolean|Function|Symbol|BigInt)$/

// 只在assertProp函数中被调用。
function assertType (value: any, type: Function, vm: ?Component): {
  valid: boolean;
  expectedType: string;
} {
  let valid
  const expectedType = getType(type)
  if (simpleCheckRE.test(expectedType)) { // type为可以使用typeof操作符检查的类型。
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isPlainObject(value)
  } else if (expectedType === 'Array') {
    valid = Array.isArray(value)
  } else { // type为自定义类型。
    try {
      valid = value instanceof type
    } catch (e) {
      warn('Invalid prop type: "' + String(type) + '" is not a constructor', vm);
      valid = false;
    }
  }

  return {
    valid,
    expectedType
  }
}

const functionTypeCheckRE = /^\s*function (\w+)/

/**
 * Use function string name to check built-in types,
 * because a simple equality check will fail when running
 * across different vms / iframes.
 */
function getType (fn) {
  const match = fn && fn.toString().match(functionTypeCheckRE)
  return match ? match[1] : ''
}

function isSameType (a, b) {
  return getType(a) === getType(b)
}

function getTypeIndex (type, expectedTypes): number {
  if (!Array.isArray(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  for (let i = 0, len = expectedTypes.length; i < len; i++) {
    if (isSameType(expectedTypes[i], type)) {
      return i
    }
  }
  return -1
}

function getInvalidTypeMessage (name, value, expectedTypes) {
  let message = `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(', ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)

  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    isExplicable(typeof value) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${styleValue(value, expectedType)}`
  }

  message += `, got ${receivedType} `

  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${styleValue(value, receivedType)}.`
  }

  return message
}

function styleValue (value, type) {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

const EXPLICABLE_TYPES = ['string', 'number', 'boolean']
function isExplicable (value) {
  return EXPLICABLE_TYPES.some(elem => value.toLowerCase() === elem)
}

function isBoolean (...args) {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
