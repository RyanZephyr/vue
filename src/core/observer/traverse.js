/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
// 在src/core/observer文件夹下，只有一个地方用到：Watcher类的get方法中。
// 遍历val的所有深层属性，同时触发依赖收集。
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)

  // 三种情况结束递归遍历：val不是数组也不是对象；val是frozen的对象；val是VNode实例
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }

  // val已被观察，则在seen数组中唯一记录val.__ob__.dep.id
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }

  if (isA) {
    // val是数组，对每个数组元素进行递归遍历，同时触发依赖收集（val[i]）
    i = val.length
    while (i--) _traverse(val[i], seen)
  } else {
    // val不是数组，对每个属性进行递归遍历，同时触发依赖收集（val[keys[i]]）
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
