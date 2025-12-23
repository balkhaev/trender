import { z } from "@hono/zod-openapi";

// --- Error Schemas ---

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message details",
      example: "Invalid input provided",
    }),
  })
  .openapi("ErrorResponse");

export const NotFoundResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Resource not found message",
      example: "Resource not found",
    }),
  })
  .openapi("NotFoundResponse");

export const UnauthorizedResponseSchema = z
  .object({
    error: z.string().openapi({
      description: "Authentication failure message",
      example: "Invalid or expired token",
    }),
  })
  .openapi("UnauthorizedResponse");
