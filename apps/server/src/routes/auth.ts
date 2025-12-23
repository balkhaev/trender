import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import jwt from "jsonwebtoken";
import { server } from "../config";
import { UnauthorizedResponseSchema } from "../schemas";

const JWT_SECRET = server.jwtSecret;

// --- Schemas ---

const BasicTokenRequestSchema = z
  .object({
    deviceType: z
      .string()
      .openapi({ description: "Mobile platform name", example: "Android" }),
    algorithm: z.string().openapi({
      description: "Hashing algorithm used for signature (if any)",
      example: "HMAC-SHA256",
    }),
    timestamp: z.string().openapi({
      description: "Unix timestamp in milliseconds as string",
      example: "1625097600000",
    }),
    installationHash: z.string().openapi({
      description: "Unique client-side generated device identifier",
      example: "client_generated_hash",
    }),
  })
  .openapi("BasicTokenRequest");

const AuthResponseSchema = z
  .object({
    accessToken: z.string().openapi({
      description: "Short-lived JWT access token",
      example: "eyJhbG...",
    }),
    refreshToken: z.string().openapi({
      description: "Long-lived JWT refresh token",
      example: "eyJhbG...",
    }),
    expiresIn: z.number().openapi({
      description: "Access token lifetime in seconds",
      example: 3600,
    }),
  })
  .openapi("AuthResponse");

const RefreshTokenRequestSchema = z
  .object({
    refreshToken: z.string().openapi({
      description: "The refresh token obtained during initial authentication",
      example: "eyJhbG...",
    }),
  })
  .openapi("RefreshTokenRequest");

const RefreshTokenResponseSchema = z
  .object({
    accessToken: z.string().openapi({
      description: "New short-lived JWT access token",
      example: "eyJhbG...",
    }),
    expiresIn: z.number().openapi({
      description: "New access token lifetime in seconds",
      example: 3600,
    }),
  })
  .openapi("RefreshTokenResponse");

// --- Routes ---

const mobileAuthRoute = createRoute({
  method: "post",
  path: "/mobile",
  summary: "Mobile authentication via Basic token",
  tags: ["Auth"],
  request: {
    headers: z.object({
      authorization: z
        .string()
        .openapi({ example: "Basic eyJkZXZpY2VUeXBlI..." }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthResponseSchema,
        },
      },
      description:
        "Successful authentication. Returns access and refresh tokens.",
    },
    401: {
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
      description: "Invalid credentials or malformed Basic token",
    },
  },
});

const refreshRoute = createRoute({
  method: "post",
  path: "/refresh",
  summary: "Refresh access token",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: RefreshTokenRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: RefreshTokenResponseSchema,
        },
      },
      description: "New access token generated successfully",
    },
    401: {
      content: {
        "application/json": {
          schema: UnauthorizedResponseSchema,
        },
      },
      description: "Invalid or expired refresh token",
    },
  },
});

export const authRouter = new OpenAPIHono();

authRouter.openapi(mobileAuthRoute, (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const base64Content = authHeader.substring(6);
  try {
    const jsonContent = Buffer.from(base64Content, "base64").toString("utf-8");
    const data = JSON.parse(jsonContent);

    // Validate the data against BasicTokenRequestSchema
    const parsed = BasicTokenRequestSchema.safeParse(data);
    if (!parsed.success) {
      return c.json({ error: "Invalid token structure" }, 401);
    }

    // For now, we simulate user creation/finding based on installationHash
    const userId = `device-${parsed.data.installationHash}`;

    // Generate tokens
    const accessToken = jwt.sign({ sub: userId, type: "access" }, JWT_SECRET, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign(
      { sub: userId, type: "refresh" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return c.json(
      {
        accessToken,
        refreshToken,
        expiresIn: 3600,
      },
      200
    );
  } catch (_e) {
    return c.json({ error: "Failed to parse authentication token" }, 401);
  }
});

// JWT payload interface
interface JwtPayload {
  sub: string;
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
}

authRouter.openapi(refreshRoute, (c) => {
  const { refreshToken } = c.req.valid("json");

  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET) as JwtPayload;
    if (payload.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    const accessToken = jwt.sign(
      { sub: payload.sub, type: "access" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    return c.json(
      {
        accessToken,
        expiresIn: 3600,
      },
      200
    );
  } catch (_e) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }
});
