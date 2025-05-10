import { useState, useEffect, useCallback } from "react"
import { useUser } from "./user-provider"
import { useShoot } from "@/hooks/useShoot"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Scissors, Hand, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

type Move = "rock" | "paper" | "scissors"
type AIPlayer = "AI-1" | "AI-2"
type GameState = "idle" | "countdown" | "playing" | "result"

export default function GameArena() {
  const { addMatchToHistory } = useUser()
  const { getAIMove, isLoading } = useShoot()
  const [gameState, setGameState] = useState<GameState>("idle")
  const [countdown, setCountdown] = useState(3)
  const [ai1Move, setAi1Move] = useState<Move | null>(null)
  const [ai2Move, setAi2Move] = useState<Move | null>(null)
  const [winner, setWinner] = useState<AIPlayer | "draw" | null>(null)
  const [roundNumber, setRoundNumber] = useState(1)

  const determineWinner = useCallback((move1: Move, move2: Move): AIPlayer | "draw" => {
    if (move1 === move2) return "draw"
    if (
      (move1 === "rock" && move2 === "scissors") ||
      (move1 === "paper" && move2 === "rock") ||
      (move1 === "scissors" && move2 === "paper")
    ) {
      return "AI-1"
    }
    return "AI-2"
  }, [])

  const startGame = () => {
    setGameState("countdown")
    setCountdown(3)
    setAi1Move(null)
    setAi2Move(null)
    setWinner(null)
  }

  useEffect(() => {
    let timer: NodeJS.Timeout

    if (gameState === "countdown" && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    } else if (gameState === "countdown" && countdown === 0) {
      setGameState("playing")

      // Get moves from both AIs through API
      const getMoves = async () => {
        try {
          // Make concurrent API calls for both AI players
          const [move1, move2] = await Promise.all([
            getAIMove(1),
            getAIMove(2)
          ])

          setAi1Move(move1)
          setAi2Move(move2)

          const gameWinner = determineWinner(move1, move2)
          setWinner(gameWinner)

          // Add match to history
          addMatchToHistory({
            id: Date.now(),
            roundNumber,
            ai1Move: move1,
            ai2Move: move2,
            winner: gameWinner,
            timestamp: new Date().toISOString(),
          })

          setRoundNumber((prev) => prev + 1)
          setGameState("result")
        } catch (error) {
          console.error("Error getting AI moves:", error)
          setGameState("idle")
        }
      }

      getMoves()
    }

    return () => clearTimeout(timer)
  }, [gameState, countdown, determineWinner, addMatchToHistory, roundNumber, getAIMove])

  const renderMoveIcon = (move: Move | null, size = 24) => {
    if (!move) return <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse"></div>

    switch (move) {
      case "rock":
        return <Hand size={size} className="text-gray-700" />
      case "paper":
        return <FileText size={size} className="text-blue-600" />
      case "scissors":
        return <Scissors size={size} className="text-red-500" />
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex justify-between items-center mb-6">
          <Badge variant="outline" className="text-lg px-4 py-1">
            Round {roundNumber}
          </Badge>
          <Button onClick={startGame} disabled={gameState === "countdown" || gameState === "playing" || isLoading}>
            {gameState === "idle" ? "Start Match" : "New Match"}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-4 items-center">
          <div
            className={cn(
              "flex flex-col items-center p-4 rounded-lg transition-all",
              winner === "AI-1" ? "bg-green-100 scale-105" : ""
            )}
          >
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              {ai1Move ? renderMoveIcon(ai1Move, 48) : <span className="text-3xl font-bold text-purple-600">AI-1</span>}
            </div>
            <h3 className="text-xl font-bold text-purple-600">AI-1</h3>
            {ai1Move && <p className="text-gray-600 capitalize mt-2">{ai1Move}</p>}
          </div>

          <div className="flex flex-col items-center">
            {gameState === "countdown" ? (
              <div className="text-6xl font-bold text-orange-500 animate-bounce">{countdown}</div>
            ) : gameState === "playing" ? (
              <div className="text-2xl font-bold text-blue-500 animate-pulse">Thinking...</div>
            ) : gameState === "result" ? (
              <div className="text-center">
                <div className="text-2xl font-bold mb-2">{winner === "draw" ? "Draw!" : `${winner} Wins!`}</div>
                <div className="text-sm text-gray-500">
                  {ai1Move} {winner === "AI-1" ? "beats" : winner === "AI-2" ? "loses to" : "ties"} {ai2Move}
                </div>
              </div>
            ) : (
              <div className="text-xl text-gray-400">VS</div>
            )}
          </div>

          <div
            className={cn(
              "flex flex-col items-center p-4 rounded-lg transition-all",
              winner === "AI-2" ? "bg-green-100 scale-105" : ""
            )}
          >
            <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              {ai2Move ? renderMoveIcon(ai2Move, 48) : <span className="text-3xl font-bold text-amber-600">AI-2</span>}
            </div>
            <h3 className="text-xl font-bold text-amber-600">AI-2</h3>
            {ai2Move && <p className="text-gray-600 capitalize mt-2">{ai2Move}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}