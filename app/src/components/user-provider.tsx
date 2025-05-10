"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

type Match = {
  id: number
  roundNumber: number
  ai1Move: string
  ai2Move: string
  winner: "AI-1" | "AI-2" | "draw"
  timestamp: string
}

type Bet = {
  id: number
  amount: number
  selectedAI: "AI-1" | "AI-2"
  matchId: number | null
  settled: boolean
  won: boolean | null
}

type UserContextType = {
  balance: number
  matchHistory: Match[]
  activeBet: Bet | null
  placeBet: (selectedAI: "AI-1" | "AI-2", amount: number) => void
  addMatchToHistory: (match: Match) => void
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState<number>(1000)
  const [matchHistory, setMatchHistory] = useState<Match[]>([])
  const [activeBet, setActiveBet] = useState<Bet | null>(null)

  // Settle bet when a new match is added
  useEffect(() => {
    if (activeBet && !activeBet.settled && matchHistory.length > 0) {
      const latestMatch = matchHistory[0]

      // Set the match ID for the bet
      const updatedBet = {
        ...activeBet,
        matchId: latestMatch.id,
        settled: true,
        won: latestMatch.winner === activeBet.selectedAI,
      }

      setActiveBet(updatedBet)

      // Update balance if bet won
      if (latestMatch.winner === activeBet.selectedAI) {
        setBalance((prev) => prev + activeBet.amount * 2)
      }
    }
  }, [matchHistory, activeBet])

  const placeBet = (selectedAI: "AI-1" | "AI-2", amount: number) => {
    if (amount > balance) return

    // Deduct bet amount from balance
    setBalance((prev) => prev - amount)

    // Create new bet
    setActiveBet({
      id: Date.now(),
      amount,
      selectedAI,
      matchId: null,
      settled: false,
      won: null,
    })
  }

  const addMatchToHistory = (match: Match) => {
    setMatchHistory((prev) => [match, ...prev])
  }

  return (
    <UserContext.Provider
      value={{
        balance,
        matchHistory,
        activeBet,
        placeBet,
        addMatchToHistory,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}
