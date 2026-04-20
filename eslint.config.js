import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Ignored paths
  {
    ignores: [
      "dist/",
      "node_modules/",
      ".claude/worktrees/**",
      "reference/",
      "*.config.js",
      "*.config.cjs",
      "*.config.ts",
    ],
  },

  // Base configs
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Source files
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Disable base rule in favour of TS-aware version
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],

      // Downgrade / disable noisy TS rules
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",

      // React Refresh
      "react-refresh/only-export-components": "warn",
    },
  },

  // Prettier must come last to disable formatting rules
  prettier
);
