import type { Context } from "hono";
import type { ZodError } from "zod";

/**
 * Форматирует ошибки валидации Zod в читаемую строку
 */
export const formatZodError = (error: ZodError): string =>
  error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");

/**
 * Глобальный обработчик ошибок валидации для OpenAPIHono
 * Использовать при создании роутера: new OpenAPIHono({ defaultHook: validationHook })
 */
export const validationHook = (
  result: { success: boolean; error?: ZodError },
  c: Context
) => {
  if (!result.success && result.error) {
    return c.json({ error: formatZodError(result.error) }, 400);
  }
};
