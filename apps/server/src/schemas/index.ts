/**
 * OpenAPI Schemas - Barrel Export
 *
 * Структура:
 * - common.ts  — Общие схемы (errors)
 * - public.ts  — Публичные схемы (клиентский флоу)
 * - internal.ts — Внутренние схемы (админ, дебаг)
 */

// Common schemas (errors, auth)
export * from "./common";
// Internal API schemas (admin, debug)
export * from "./internal";
// Public API schemas (client flow)
export * from "./public";
