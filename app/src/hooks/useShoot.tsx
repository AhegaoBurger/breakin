import { useState } from "react";

type Move = "rock" | "paper" | "scissors";
type APIResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

// OpenRouter API endpoint
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Using the free model from deepseek
const MODEL = "deepseek/deepseek-chat-v3-0324:free";

// Get API key from environment variable
const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

export function useShoot() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAIMove = async (playerNumber: 1 | 2): Promise<Move> => {
    setIsLoading(true);
    setError(null);

    const prompt = `You are AI-${playerNumber} in a rock-paper-scissors game. Choose your move based on game theory and strategic thinking.

Your response must be exactly one of these three words: "rock", "paper", or "scissors".

Think about:
1. Rock beats scissors
2. Scissors beats paper
3. Paper beats rock

Choose your move.`;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "AI Rock Paper Scissors",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API Error Response:", errorData);
        throw new Error(
          `API request failed: ${errorData.error?.message || "Unknown error"}`
        );
      }

      const data: APIResponse = await response.json();
      const move = data.choices[0].message.content.toLowerCase().trim();

      // Validate the move
      if (!["rock", "paper", "scissors"].includes(move)) {
        console.log("Invalid move:", move);
        throw new Error("Invalid move returned by AI");
      }

      return move as Move;
    } catch (err) {
      console.error("API Error:", err);
      setError(err instanceof Error ? err.message : "Failed to get AI move");
      // Fallback to random move if API fails
      const moves: Move[] = ["rock", "paper", "scissors"];
      return moves[Math.floor(Math.random() * moves.length)];
    } finally {
      setIsLoading(false);
    }
  };

  return {
    getAIMove,
    isLoading,
    error,
  };
}
