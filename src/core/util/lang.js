/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */

// unicodeRegExp是一个RegExp对象，调用unicodeRegExp.source获得正则表达式的内容文本。
// bailRE：[^...]，匹配任何不在...中的字符。
// .$_：. $ _ 三个字符
// \\d即\d：匹配0-9的数字字符
// unicodeRegExp.source在[]中则变为多个字符范围。
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)

export function parsePath (path: string): any {
  // 如果path中存在非法字符，直接返回。
  if (bailRE.test(path)) {
    return
  }
  // path中不存在非法字符，按.分割获得数组。
  const segments = path.split('.')

  // 返回一个函数，该函数在被调用时会被传入组件实例作为参数，从而逐层触发get访问器函数，最后将真正的值返回。
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      obj = obj[segments[i]]
    }
    return obj
  }
}
