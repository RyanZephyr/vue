/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建一个以arrayProto为原型的对象，存放拦截方法，并导出
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 拦截修改方法，并发出事件
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  // 定义不可枚举的方法来拦截原生方法调用
  def(arrayMethods, method, function mutator (...args) {
    // 调用原生数组方法
    const result = original.apply(this, args)

    // 获取数组对象的observer
    const ob = this.__ob__
    // inserted存放新增内容
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 如果有新增内容，对其进行响应式化
    if (inserted) ob.observeArray(inserted)
    // notify change
    ob.dep.notify()

    // 返回原生方法返回的结果
    return result
  })
})
