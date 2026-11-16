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
    // Salidas generadas (gitignored, pero ESLint no lee .gitignore): el reporte
    // HTML de Playwright trae JS empaquetado del trace viewer cuando falla un
    // test, y rompía el lint de los hooks (15/09). La caché de P1 no tiene código.
    "tests/e2e/.report/**",
    "tests/e2e/.artifacts*/**",
    ".cache/**",
  ]),
]);

export default eslintConfig;
