import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import importPlugin from 'eslint-plugin-import'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectPaths = [
  path.resolve(__dirname, 'tsconfig.base.json'),
  path.resolve(__dirname, 'apps/web-vite/tsconfig.json'),
  path.resolve(__dirname, 'packages/core/tsconfig.json'),
  path.resolve(__dirname, 'packages/platform-web/tsconfig.json'),
  path.resolve(__dirname, 'packages/calendar/tsconfig.json'),
  path.resolve(__dirname, 'packages/todos/tsconfig.json'),
]

const resolverSettings = {
  'import/resolver': {
    typescript: {
      project: projectPaths,
    },
  },
}

const languageOptions = {
  parser: tsParser,
  parserOptions: {
    project: projectPaths,
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      'out',
      'apps/web-vite/out',
    ],
  },
  js.configs.recommended,
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/.turbo/**', '**/dist/**'],
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions,
    settings: resolverSettings,
    plugins: {
      '@typescript-eslint': tsPlugin,
      import: importPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-interface': 'off',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          pathGroups: [
            {
              pattern: '@lifeos/**',
              group: 'internal',
              position: 'before',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/**'],
    rules: {
      'import/no-extraneous-dependencies': 'off',
    },
  },
  // Node.js environment for functions
  {
    files: ['functions/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  // Browser globals for packages that may use them
  {
    files: ['packages/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        crypto: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
]
