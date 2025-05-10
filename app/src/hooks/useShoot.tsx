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

  const extractMove = (content: string): Move | null => {
    const moveRegex = /(rock|paper|scissors)/i;
    const match = content.toLowerCase().match(moveRegex);
    return match ? (match[0] as Move) : null;
  };

  const getAIMove = async (_playerNumber: 1 | 2): Promise<Move> => {
    setIsLoading(true);
    setError(null);

    const prompt = `You are playing Rock Paper Scissors. Respond with ONLY ONE of these words: rock, paper, or scissors.`;

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
      const content = data.choices[0].message.content;
      const move = extractMove(content);

      if (!move) {
        console.error("Invalid AI response:", content);
        throw new Error("Could not extract a valid move from AI response");
      }
      console.log("AI move:", move);

      return move;
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
