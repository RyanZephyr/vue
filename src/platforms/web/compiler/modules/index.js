import klass from './class'
import style from './style'
import model from './model'

export default [
  klass,
  style,
  model
]

// export default的内容：
// [
//   {
//     staticKeys: ['staticClass'],
//     transformNode,
//     genData
//   },
//   {
//     staticKeys: ['staticStyle'],
//     transformNode,
//     genData
//   },
//   {
//     preTransformNode
//   }
// ]