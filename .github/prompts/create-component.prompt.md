---
description: "Create a new UI component with proper structure, styling, accessibility, and tests"
agent: "agent"
argument-hint: "Describe the component (e.g., 'A user avatar with status indicator and tooltip')"
---
Create a new UI component following the project's existing patterns.

## Steps
1. **Find** existing component examples to match the project's conventions
2. **Create** the component with:
   - Clear prop types/interface with documentation
   - Sensible default props
   - Semantic HTML elements
   - Keyboard accessibility (focus management, key handlers)
   - ARIA attributes where needed
3. **Style** using the project's styling approach (CSS modules, Tailwind, etc.)
   - Responsive design (mobile-first)
   - Support light/dark themes if the project uses them
   - Use design tokens for colors, spacing, typography
4. **Write** tests for:
   - Rendering with default props
   - Rendering with all prop variations
   - User interactions (click, hover, keyboard)
   - Accessibility (role, labels, focus)
5. **Create** a story/example if the project uses Storybook or similar

## Accessibility Checklist
- [ ] Semantic HTML elements used
- [ ] Interactive elements are keyboard accessible
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Screen reader announces content correctly
- [ ] Focus is visible and logical
