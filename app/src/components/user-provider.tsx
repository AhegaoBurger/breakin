"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

type Match = {
  id: number;
  roundNumber: number;
  ai1Move: string;
  ai2Move: string;
  winner: "AI-1" | "AI-2" | "draw";
  timestamp: string;
};

type Bet = {
  id: number;
  amount: number;
  selectedAI: "AI-1" | "AI-2";
  matchId: number | null;
  settled: boolean;
  won: boolean | null;
};

type Bettor = {
  id: number;
  address: string;
  amount: number;
  selectedAI: "AI-1" | "AI-2";
  timestamp: number;
};

type BettingPool = {
  total: number;
  bettors: Bettor[];
};

type UserContextType = {
  balance: number;
  matchHistory: Match[];
  activeBet: Bet | null;
  bettingPools: {
    ai1: BettingPool;
    ai2: BettingPool;
  };
  placeBet: (selectedAI: "AI-1" | "AI-2", amount: number) => void;
  addMatchToHistory: (match: Match) => void;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number>(0);
  const [matchHistory, setMatchHistory] = useState<Match[]>([]);
  const [activeBet, setActiveBet] = useState<Bet | null>(null);

  // Betting pools
  const [bettingPools, setBettingPools] = useState<{
    ai1: BettingPool;
    ai2: BettingPool;
  }>({
    ai1: { total: 0, bettors: [] },
    ai2: { total: 0, bettors: [] },
  });

  // Fetch SOL balance when wallet is connected
  useEffect(() => {
    if (!publicKey) {
      setBalance(0);
      return;
    }

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(0);
      }
    };

    fetchBalance();
    const intervalId = setInterval(fetchBalance, 10000);

    return () => clearInterval(intervalId);
  }, [publicKey, connection]);

  // Settle bet when a new match is added
  useEffect(() => {
    if (activeBet && !activeBet.settled && matchHistory.length > 0) {
      const latestMatch = matchHistory[0];

      // Set the match ID for the bet
      const updatedBet = {
        ...activeBet,
        matchId: latestMatch.id,
        settled: true,
        won: latestMatch.winner === activeBet.selectedAI,
      };

      setActiveBet(updatedBet);

      // Calculate winnings based on pool sizes and odds
      if (latestMatch.winner === activeBet.selectedAI) {
        const winningPool =
          activeBet.selectedAI === "AI-1"
            ? bettingPools.ai1.total
            : bettingPools.ai2.total;
        const totalPool = bettingPools.ai1.total + bettingPools.ai2.total;

        // Calculate odds based on pool sizes
        const odds = totalPool > 0 ? totalPool / winningPool : 2;

        // Calculate winnings
        const winnings = Math.round(activeBet.amount * odds);

        // Update balance (in a real app, this would be a blockchain transaction)
        setBalance((prev) => prev + winnings);
      }

      // Reset betting pools after match
      setBettingPools({
        ai1: { total: 0, bettors: [] },
        ai2: { total: 0, bettors: [] },
      });
    }
  }, [matchHistory, activeBet, bettingPools]);

  const placeBet = (selectedAI: "AI-1" | "AI-2", amount: number) => {
    if (amount > balance || !publicKey) return;

    // Deduct bet amount from balance (in a real app, this would be a blockchain transaction)
    setBalance((prev) => prev - amount);

    // Create new bet
    setActiveBet({
      id: Date.now(),
      amount,
      selectedAI,
      matchId: null,
      settled: false,
      won: null,
    });

    // Add to betting pool
    setBettingPools((prev) => {
      const newBettor: Bettor = {
        id: Date.now(),
        address: publicKey.toBase58(),
        amount,
        selectedAI,
        timestamp: Date.now(),
      };

      if (selectedAI === "AI-1") {
        return {
          ...prev,
          ai1: {
            total: prev.ai1.total + amount,
            bettors: [...prev.ai1.bettors, newBettor],
          },
        };
      } else {
        return {
          ...prev,
          ai2: {
            total: prev.ai2.total + amount,
            bettors: [...prev.ai2.bettors, newBettor],
          },
        };
      }
    });
  };

  const addMatchToHistory = (match: Match) => {
    setMatchHistory((prev) => [match, ...prev]);
  };

  return (
    <UserContext.Provider
      value={{
        balance,
        matchHistory,
        activeBet,
        bettingPools,
        placeBet,
        addMatchToHistory,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
