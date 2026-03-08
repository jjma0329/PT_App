# Project Instructions

## Stack
- React (functional components only, no class components)
- Tailwind CSS for all styling (no inline styles or separate CSS files)
- Node.js + Express backend

## Frontend Rules
- Use hooks (useState, useEffect, useCallback, useMemo) appropriately
- Break UI into small, reusable components
- Keep components in `/src/components`, pages in `/src/pages`
- Use descriptive component names (e.g. `UserProfileCard`, not `Card`)
- Always handle loading and error states in UI

## Tailwind Rules
- Use Tailwind utility classes only — no custom CSS unless absolutely necessary
- Use `cn()` or `clsx()` for conditional class merging
- Keep className strings readable by grouping: layout → spacing → typography → color

## Backend Rules
- Keep routes in `/routes`, controllers in `/controllers`
- Always validate request inputs
- Use async/await with try/catch for all async routes
- Return consistent JSON responses: `{ success, data, error }`

## General
- Prefer early returns to reduce nesting
- Always add error handling
- Write clear, self-documenting variable and function names
- No console.logs left in final code
