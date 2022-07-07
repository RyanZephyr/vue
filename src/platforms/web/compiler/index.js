/* @flow */

import { baseOptions } from './options'
import { createCompiler } from 'compiler/index'

const { compile, compileToFunctions } = createCompiler(baseOptions)

// compile由模板字符串生成函数体字符串；compileToFunction由模板字符串生成函数体字符串，然后由函数体字符串生成渲染函数。
export { compile, compileToFunctions }
