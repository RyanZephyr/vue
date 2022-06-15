/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */
// 对象：arrayMethods

import { def } from '../util/index'

const arrayProto = Array.prototype
// 创建一个以Array.prototype为原型的对象，存放拦截方法，
// 导出该对象以供获取拦截方法
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
// 拦截修改方法，以便派发更新
methodsToPatch.forEach(function (method) {
  // cache original method
  const original = arrayProto[method]
  // 对于每种修改方法，定义不可枚举的包裹方法来拦截原生方法调用
  def(arrayMethods, method, function mutator (...args) {
    // 调用原生数组方法
    const result = original.apply(this, args)

    // 获取数组对象的observer
    const ob = this.__ob__
    //获取数组新增数据并存入inserted
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
    // observeArray方法对传入数组中的每一项调用observe方法
    // observe方法对于非对象数据不作处理，直接返回
    // 而对于对象数据，通过slice获得的inserted中存放的正好就是原始的对象的引用（浅拷贝）
    // 因此observe方法能够正确地使真实对象数据响应式化
    if (inserted) ob.observeArray(inserted)

    // notify change 派发更新
    ob.dep.notify()

    // 返回原生方法返回的结果
    return result
  })
})
