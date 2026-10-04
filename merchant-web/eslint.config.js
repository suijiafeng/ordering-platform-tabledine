// 只检查会影响正确性与可读性的规则；排版交给 .editorconfig，不在这里管
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Promise 必须 await / return / .catch，或用 void 明确表示有意不等待
      '@typescript-eslint/no-floating-promises': 'error',
      // 事件处理器里传 async 函数是常见写法，只禁止把 Promise 用在条件判断里
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
      // 条件语句统一带大括号；单行 if (...) return 仍允许
      curly: ['error', 'multi-line'],
      // 业务代码里不写 == / !=（null 判断除外）
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
)
