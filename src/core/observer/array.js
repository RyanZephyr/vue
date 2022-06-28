/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */
// 导出一个对象：arrayMethods

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建一个以Array.prototype为原型的对象，存放拦截方法，导出该对象以供获取拦截方法。
//（只在src/core/observer/index.js中的Observer类的构造函数中使用）
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
// 遍历数组七种变异方法的名字，在arrayMethods对象上定义不可枚举的同名属性方法来拦截原生变异方法调用。
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  
  def(arrayMethods, method, function mutator (...args) {
    // 调用原生数组变异方法。
    const result = original.apply(this, args)

    // 获取数组对象的observer
    const ob = this.__ob__

    //获取数组新增数据并赋给inserted（inserted为数组）。
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

    // 调用observeArray()方法对新增元素进行观测。
    // observe()方法对于非对象数据不作处理，直接返回；
    // 而对于对象数据，通过slice()方法获得的inserted数组中存放的正好就是原始对象的引用（浅拷贝），
    // 因此observe()方法能够正确地进行观测。
    if (inserted) ob.observeArray(inserted)

    // notify change 派发更新。
    ob.dep.notify()

    // 返回原生变异方法返回的结果。
    return result
  })
})
