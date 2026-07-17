import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Minimal ESLint config that runs React Hooks + React Compiler rules on renderer sources.
 * Biome handles all other linting; this file exists solely to surface React Hooks
 * violations and React Compiler incompatible patterns.
 * Migrated from eslint-plugin-react-compiler → eslint-plugin-react-hooks per React Compiler v1.0.
 */
export default [
    {
        ...reactHooks.configs.flat.recommended,
        files: ['src/renderer/src/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: { jsx: true }
            }
        }
    }
];
