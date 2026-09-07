import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Focused launch-page checks. Legacy application code is not silently claimed
// to be linted by this configuration.
export default tseslint.config({
  files: ['src/routes/marketing/**/*.{ts,tsx}', 'src/App.tsx', 'tailwind.config.ts'],
  extends: [js.configs.recommended, ...tseslint.configs.recommended],
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
});
