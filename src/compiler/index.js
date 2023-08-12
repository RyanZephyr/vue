/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 调用createCompilerCreator函数，传入baseCompile函数作为参数，将调用返回的函数赋给createCompiler。
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    optimize(ast, options)
  }
  const code = generate(ast, options)

  // ast-抽象语法树 render-渲染函数（函数体字符串） staticRenderFns-静态渲染函数（函数体字符串）
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
