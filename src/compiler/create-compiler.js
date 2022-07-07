/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// createCompilerCreator函数返回createCompiler函数。
export function createCompilerCreator (baseCompile: Function): Function {
  // 每个创建出来的compiler（即compile函数）会对应一个baseOptions（创建时提供）；
  // 在调用compiler时，我们又可以提供一个options，compiler会将options与baseOptions为finalOptions使用。
  return function createCompiler (baseOptions: CompilerOptions) {
    // compile函数主要做三件事：
    // 基于baseOptions和options生成finalOptions；调用baseCompile函数编译模板；收集错误和提示。
    // 最后，返回compiled对象，包括生成的ast、render、staticRenderFns、收集的错误和提示等。
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      const finalOptions = Object.create(baseOptions) // 创建以对象baseOptions为原型的对象finalOptions
      const errors = []
      const tips = []

      // 用于在编译过程中收集错误和提示。
      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      // baseOptions + options = finalOptions
      if (options) { // 此处options为调用compile函数编译模板时传递的选项参数，也即调用compileToFunctions函数时传递的选项参数。
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn

      // baseCompile函数是createCompileCreator函数的参数，真正地进行模板编译。
      const compiled = baseCompile(template.trim(), finalOptions) 

      // 开发环境下，检查生成的AST存在的错误，并通过warn函数进行收集。
      if (process.env.NODE_ENV !== 'production') {
        detectErrors(compiled.ast, warn) 
      }

      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
