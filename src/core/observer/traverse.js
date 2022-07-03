import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
// 在/src/core/observer文件夹下，只在Watcher类的get方法中被调用，用于深度观测：递归遍历val的所有子属性，触发依赖收集。
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

// 只在traverse函数和自身中被调用。
function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)

  // val本身的依赖已被收集，当前需要判断val是否有子属性/子元素可以深度观测。
  // 三种情况下无法深度观测val，结束递归遍历：val不是数组也不是对象；val是冻结的；val是VNode实例。
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // 借助val.__ob__.dep.id来唯一标识收集过的依赖，避免对象之间循环引用造成递归死循环：
  // let obj1 = {},obj2 = {}; obj1.data = obj2; obj2.data = obj1;
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  if (isA) {
    // val是数组，对每个数组元素进行递归遍历，同时触发依赖收集（val[i]）。
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // val是纯对象，对每个属性进行递归遍历，同时触发依赖收集（val[keys[i]]）。
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
