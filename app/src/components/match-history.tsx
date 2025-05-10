import { useUser } from "./user-provider"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Scissors, Hand, FileText } from "lucide-react"

export default function MatchHistory() {
  const { matchHistory } = useUser()

  const renderMoveIcon = (move: string) => {
    switch (move) {
      case "rock":
        return <Hand size={16} className="text-gray-700" />
      case "paper":
        return <FileText size={16} className="text-blue-600" />
      case "scissors":
        return <Scissors size={16} className="text-red-500" />
      default:
        return null
    }
  }

  if (matchHistory.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-center text-gray-500 py-4">No matches played yet. Start a game to see the history!</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="divide-y">
            {matchHistory.map((match) => (
              <div key={match.id} className="p-3 hover:bg-gray-50">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Round {match.roundNumber}</span>
                  <span className="text-xs text-gray-500">{new Date(match.timestamp).toLocaleTimeString()}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    <span className={`font-medium ${match.winner === "AI-1" ? "text-green-600" : ""}`}>AI-1</span>
                    <span className="mx-1">{renderMoveIcon(match.ai1Move)}</span>
                  </div>

                  <div className="text-xs px-2 py-0.5 rounded bg-gray-100">
                    {match.winner === "draw" ? "Draw" : `${match.winner} won`}
                  </div>

                  <div className="flex items-center space-x-1">
                    <span className="mx-1">{renderMoveIcon(match.ai2Move)}</span>
                    <span className={`font-medium ${match.winner === "AI-2" ? "text-green-600" : ""}`}>AI-2</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
