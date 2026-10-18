# Project Templates

## Node.js / TypeScript Web API

```
project/
├── src/
│   ├── controllers/     # Route handlers
│   ├── services/        # Business logic
│   ├── repositories/    # Data access
│   ├── middleware/       # Auth, validation, error handling
│   ├── models/          # Types and interfaces
│   ├── utils/           # Shared utilities
│   └── index.ts         # Entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── .github/
│   ├── copilot-instructions.md
│   ├── instructions/
│   ├── prompts/
│   └── agents/
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── .editorconfig
└── README.md
```

## Python Web API (FastAPI/Django)

```
project/
├── src/
│   ├── api/             # Route definitions
│   ├── services/        # Business logic
│   ├── models/          # Database models
│   ├── schemas/         # Request/response schemas
│   ├── core/            # Config, security, dependencies
│   └── main.py          # Entry point
├── tests/
│   ├── conftest.py
│   ├── test_api/
│   └── test_services/
├── .github/
│   ├── copilot-instructions.md
│   ├── instructions/
│   ├── prompts/
│   └── agents/
├── pyproject.toml
├── .editorconfig
└── README.md
```

## React / Next.js Frontend

```
project/
├── src/
│   ├── components/      # Reusable UI components
│   │   └── ComponentName/
│   │       ├── index.tsx
│   │       ├── ComponentName.test.tsx
│   │       └── ComponentName.module.css
│   ├── pages/           # Route pages
│   ├── hooks/           # Custom React hooks
│   ├── context/         # React context providers
│   ├── services/        # API clients
│   ├── utils/           # Pure utility functions
│   └── types/           # Shared TypeScript types
├── public/
├── .github/
│   ├── copilot-instructions.md
│   ├── instructions/
│   ├── prompts/
│   └── agents/
├── package.json
├── tsconfig.json
├── next.config.js
├── .eslintrc.json
├── .prettierrc
├── .editorconfig
└── README.md
```

## Essential Config Files

### .editorconfig
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.{py,rs}]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

### .gitignore essentials
```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
__pycache__/
*.pyc
.venv/
```
