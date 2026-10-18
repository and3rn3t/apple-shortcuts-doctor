---
description: "Use when building UI components, frontend pages, styling, state management, or client-side interactivity."
applyTo: ["**/*.{tsx,jsx,vue,svelte}", "**/components/**", "**/pages/**", "**/styles/**"]
---
# Frontend Guidelines

## Component Design

- Keep components small and focused on a single responsibility
- Separate presentational components from container/logic components
- Use composition over prop drilling — context, slots, or state management
- Co-locate component styles, tests, and stories
- Name components descriptively: `UserProfileCard`, not `Card1`

## State Management

- Keep state as local as possible; lift only when needed
- Use appropriate tools: local state → context → state library
- Derive computed values from state instead of storing duplicates
- Avoid direct state mutation; use immutable update patterns

## Styling

- Use a consistent approach (CSS Modules, Tailwind, styled-components, etc.)
- Follow a design token system for colors, spacing, typography
- Mobile-first responsive design
- Avoid inline styles except for truly dynamic values

## Accessibility

- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<article>`)
- All images need meaningful `alt` text (or empty `alt=""` for decorative)
- Ensure keyboard navigation works for all interactive elements
- Use ARIA attributes only when native HTML semantics are insufficient
- Maintain a minimum contrast ratio of 4.5:1 for text
- Test with screen readers periodically

## Performance

- Lazy-load routes and heavy components
- Optimize images: use appropriate formats (WebP/AVIF), responsive sizes
- Minimize re-renders: memoize expensive computations
- Use virtualization for long lists
- Monitor bundle size; code-split aggressively
