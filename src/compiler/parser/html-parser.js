/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */
// 导出两个函数：isPlainTextElement、parseHTML（词法分析）

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// 匹配attribute五个capturing group: (name) (?: (=) (?: (双引号value)|(单引号value)|(无引号value) ))?。
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+?\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*` // ncname: no colon name，不包含冒号（前缀）的XML标签名称（前缀:标签 的标签部分）。
const qnameCapture = `((?:${ncname}\\:)?${ncname})` // qname：qualified name，完整的标签名称（前缀:标签）。有一个capturing group，捕获完整的标签名称。
const startTagOpen = new RegExp(`^<${qnameCapture}`) // 匹配开始标签的开头部分。具有qnameCapture的一个capturing group。
const startTagClose = /^\s*(\/?)>/ // 匹配开始标签的结尾部分。有一个capturing group，捕获开始标签结尾部分的斜杠/。
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`) // 匹配结束标签。具有qnameCapture的一个capturing group。
const doctype = /^<!DOCTYPE [^>]+>/i // 匹配DOCTYPE标签。
// #7298: escape - to avoid being passed as HTML comment when inlined in page：避免将Vue源码直接放在HTML中时，下面这行代码被解析成注释开头（<!--）。
const comment = /^<!\--/ // 匹配注释节点。
const conditionalComment = /^<!\[/ // 匹配条件注释节点（条件注释只在IE5-9被支持）。

// Special Elements (can contain anything)：内容被视作纯文本处理的元素
export const isPlainTextElement = makeMap('script,style,textarea', true)
const reCache = {}

// decodingMap配合下方encodedAttr和encodedAttrWithNewLines，用于对HTML entity（实体，形如&lt; &#39;）进行解码。
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992：浏览器会忽略<pre>或<textarea>元素内容中出现在最前面的换行符，因此Vue也要实现这一行为。
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 用于解码Attribute值中的HTML entity。
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  return value.replace(re, match => decodingMap[match])
}

export function parseHTML (html, options) {
  const stack = [] // 存放未闭合的开始标签的栈
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no // 函数
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no // 函数
  let index = 0 // 当前读入位置在原始html中的index
  let last, lastTag // last：当前未parse的html尾部片段；lastTag：当前栈顶元素

  while (html) {
    last = html

    // Make sure we're not in a plaintext content element like script/style/textarea：lastTag存在 且 为内容被视作纯文本处理的标签（script/style/textarea） 时，进else；否则进if。
    if (!lastTag || !isPlainTextElement(lastTag)) {
      let textEnd = html.indexOf('<')

      // html第一个字符是'<'。
      if (textEnd === 0) {
        // Comment:
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) { // 此处的options.shouldKeepComment的值即Vue选项comments的值。
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')

          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype:
        const doctypeMatch = html.match(doctype)
        if (doctypeMatch) {
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }

      let text, rest, next
      // html第一个字符是'<'但没有成功匹配标签，或html第一个字符不是'<'但包含'<'。
      if (textEnd >= 0) {
        rest = html.slice(textEnd)

        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          next = rest.indexOf('<', 1)
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }

        text = html.substring(0, textEnd)
      }

      // html不包含'<'。
      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      // 处理纯文本。
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 解析纯文本标签的内容，而不是纯文本标签。
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
       // ([\s\S]*?)(</tagName[^>]*>)：两个capture group，纯文本标签内容，纯文本标签结束标签；*?为懒惰模式，只要第二个分组匹配成功就立即停止第一个分组的匹配。
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))

      // 使用reStackedTag匹配html并将匹配片段替换为''（不改变html），将替换结果赋给rest；在replace的参数函数中获取endTagLength，处理纯文本内容。
      const rest = html.replace(reStackedTag, function (all, text, endTag) { // all为完整匹配，text和endTag为两个capture group。
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) { // 忽略pre和textarea标签内容中的首部换行符（如果存在）。
          text = text.slice(1)
        }
        if (options.chars) { // 处理纯文本内容。
          options.chars(text)
        }
        return ''
      })

      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index) // 解析纯文本标签的结束标签。
    }

    // html没有被进一步parse，则将html作为纯文本处理，开发环境下发出警告：模板字符串结尾有格式不对的标签；结束parse。
    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  parseEndTag()

  // 剔除已经parse完毕的部分，更新index和html。
  function advance (n) {
    index += n
    html = html.substring(n)
  }

  // 解析开始标签。
  function parseStartTag () {
    const start = html.match(startTagOpen)
    if (start) {
      // 处理开始标签的开头部分（形如<div）。
      const match = {
        tagName: start[1],
        attrs: [], // 存放开始标签的attribute。每项元素为数组（html.match的返回值），且带有start和end属性。
        start: index
      }
      advance(start[0].length)

      // 处理开始标签的attribute。
      let end, attr
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }

      // 只有匹配到开始标签的结尾部分才会返回真值，同时向返回的对象添加unarySlash和end属性。
      if (end) {
        match.unarySlash = end[1]
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }

  // 处理开始标签解析结果。
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) { // 如果lastTag是p标签，且当前正在解析的开始标签不是段落式内容的（p标签只允许包含段落式内容），则调用parseEndTag函数闭合p标签（与浏览器行为一致）。
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) { // 如果当前正在解析的开始标签是一个可以省略结束标签的标签（如p标签），且与lastTag相同，则调用parseEndTag函数闭合当前开始标签（与浏览器行为一致）。
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash // 标志当前开始标签是否为一元标签，有两种一元标签：HTML原生一元标签；Vue组件（形如<my-component />）。

    // 遍历match.attrs数组，将格式化后的attribute信息存入常量数组attrs。
    const l = match.attrs.length
    const attrs = new Array(l)
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines

      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }

      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }

    // 如果当前开始标签是非一元标签，将该开始标签的信息入栈，并设置lastTag为该开始标签名。
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }

    // 调用parser钩子函数start（如果有）。
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 三种调用方式：传递三个参数（处理结束标签）；传递一个参数；不传递参数（处理栈中剩余的未处理标签）。end为开区间。
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type (unclosed in stack)
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      pos = 0
    }

    if (pos >= 0) {
      // Close all the open elements, up the stack：闭合栈中从栈顶到pos的所有开始标签。
      for (let i = stack.length - 1; i >= pos; i--) {
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }

        if (options.end) {
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the (closed) open elements from the stack
      stack.length = pos
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') { // 没有在stack栈中找到对应的开始标签，且当前结束标签为</br>，则将其解析为<br>（与浏览器行为一致）。
      if (options.start) {
        options.start(tagName, [], true, start, end)
      }
    } else if (lowerCasedTagName === 'p') { // 没有在stack栈中找到对应的开始标签，且当前结束标签为</p>，则将其解析为<p></p>（与浏览器行为一致）。
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
    // 忽略其他（除p、br外）没有对应开始标签的结束标签（与浏览器行为一致）。
  }
}
