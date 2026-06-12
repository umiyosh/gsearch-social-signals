module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    webextensions: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-type-checked",
    "prettier"
  ],
  rules: {
    complexity: ["warn", { max: 20 }],
    "max-depth": ["warn", 4],
    "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": ["warn", { max: 120, skipBlankLines: true, skipComments: true }],
    "max-params": ["warn", 5],
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_"
      }
    ],
    "@typescript-eslint/consistent-type-imports": "warn",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: false
      }
    ]
  },
  ignorePatterns: ["dist", "dist-types", "node_modules", "coverage"]
}
