import { API_URL } from "./api-client";

export type KlingBalance = {
  remainingTokens: number;
  error?: string;
};

export async function getKlingBalance(): Promise<KlingBalance> {
  const response = await fetch(`${API_URL}/api/kling/balance`, {
    credentials: "include",
  });

  if (!response.ok) {
    return { remainingTokens: 0, error: "Failed to fetch balance" };
  }

  return response.json();
}
