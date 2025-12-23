import { OpenAPIHono } from "@hono/zod-openapi";
import { getKlingAccountBalance } from "../services/kling";

const klingRouter = new OpenAPIHono();

klingRouter.get("/balance", async (c) => {
  const result = await getKlingAccountBalance();
  return c.json(result);
});

export { klingRouter };
