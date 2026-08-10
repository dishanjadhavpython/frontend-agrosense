import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python virtualenvs. scikit-learn and torch ship .js files inside their
    // site-packages, and listing globalIgnores at all replaces the defaults
    // that would have skipped them — so `npm run lint` was reporting 77
    // problems in vendored library code and none in ours.
    "**/.venv/**",
  ]),
]);

export default eslintConfig;
