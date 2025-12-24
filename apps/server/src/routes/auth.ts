import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import jwt from "jsonwebtoken";
import { server } from "../config";
import {
  AppleAuthRequestSchema,
  AuthResponseSchema,
  BasicTokenRequestSchema,
  GoogleAuthRequestSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema,
  UnauthorizedResponseSchema,
} from "../schemas";

const JWT_SECRET = server.jwtSecret;

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

const googleAuthRoute = createRoute({
  method: "post",
  path: "/google",
  summary: "Authentication via Google",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: GoogleAuthRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthResponseSchema,
        },
      },
      description: "Successful Google authentication",
    },
    401: {
      content: { "application/json": { schema: UnauthorizedResponseSchema } },
      description: "Invalid Google token",
    },
  },
});

const appleAuthRoute = createRoute({
  method: "post",
  path: "/apple",
  summary: "Authentication via Apple",
  tags: ["Auth"],
  request: {
    body: {
      content: {
        "application/json": {
          schema: AppleAuthRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthResponseSchema,
        },
      },
      description: "Successful Apple authentication",
    },
    401: {
      content: { "application/json": { schema: UnauthorizedResponseSchema } },
      description: "Invalid Apple token",
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

authRouter.openapi(googleAuthRoute, async (c) => {
  const { idToken } = c.req.valid("json");

  // In a real app, verify idToken with Google API
  const userId = `google-${idToken.substring(0, 10)}`;

  const accessToken = jwt.sign({ sub: userId, type: "access" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const refreshToken = jwt.sign({ sub: userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: "7d",
  });

  return c.json({ accessToken, refreshToken, expiresIn: 3600 }, 200);
});

authRouter.openapi(appleAuthRoute, async (c) => {
  const { identityToken, user: _user } = c.req.valid("json");

  // In a real app, verify identityToken with Apple API
  const userId = `apple-${identityToken.substring(0, 10)}`;

  const accessToken = jwt.sign({ sub: userId, type: "access" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const refreshToken = jwt.sign({ sub: userId, type: "refresh" }, JWT_SECRET, {
    expiresIn: "7d",
  });

  return c.json({ accessToken, refreshToken, expiresIn: 3600 }, 200);
});
