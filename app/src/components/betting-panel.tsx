"use client";

import type React from "react";

import { useState } from "react";
import { useUser } from "./user-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Coins, TrendingUp } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function BettingPanel() {
  const { balance, placeBet, bettingPools } = useUser();
  const { publicKey } = useWallet();
  const [betAmount, setBetAmount] = useState<number>(0.1);
  const [selectedAI, setSelectedAI] = useState<"AI-1" | "AI-2" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calculate odds based on pool sizes
  const totalPoolSize = bettingPools.ai1.total + bettingPools.ai2.total;

  const calculateOdds = (poolSize: number) => {
    if (totalPoolSize === 0 || poolSize === 0) return 2.0;
    return Number.parseFloat((totalPoolSize / poolSize).toFixed(2));
  };

  const ai1Odds = calculateOdds(bettingPools.ai1.total);
  const ai2Odds = calculateOdds(bettingPools.ai2.total);

  const handleBetAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseFloat(e.target.value);
    if (isNaN(value) || value <= 0) {
      setBetAmount(0);
    } else {
      setBetAmount(value);
    }
  };

  const handlePlaceBet = () => {
    if (!selectedAI) {
      setError("Please select an AI to bet on");
      return;
    }

    if (betAmount <= 0) {
      setError("Bet amount must be greater than 0");
      return;
    }

    if (betAmount > balance) {
      setError("Insufficient SOL balance");
      return;
    }

    if (!publicKey) {
      setError("Please connect your wallet first");
      return;
    }

    placeBet(selectedAI, betAmount);
    setError(null);
  };

  // Calculate potential winnings based on current odds
  const getPotentialWinnings = () => {
    if (!selectedAI) return 0;
    const odds = selectedAI === "AI-1" ? ai1Odds : ai2Odds;
    return Number.parseFloat((betAmount * odds).toFixed(4));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex justify-between items-center">
          <span>Place Your Bet</span>
          <div className="flex items-center text-amber-500">
            <Coins className="mr-1" size={18} />
            <span>{balance.toFixed(4)} SOL</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="bet-amount">Bet Amount (SOL)</Label>
            <div className="flex mt-1.5">
              <Input
                id="bet-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={betAmount}
                onChange={handleBetAmountChange}
                className="rounded-r-none"
              />
              <Button
                variant="outline"
                className="rounded-l-none border-l-0"
                onClick={() => setBetAmount(Math.max(0, betAmount - 0.1))}
              >
                -
              </Button>
              <Button
                variant="outline"
                className="rounded-l-none border-l-0"
                onClick={() => setBetAmount(betAmount + 0.1)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Select Winner</Label>
            <RadioGroup
              value={selectedAI || ""}
              onValueChange={(value) => setSelectedAI(value as "AI-1" | "AI-2")}
            >
              <div className="flex items-center space-x-2 border rounded-md p-3">
                <RadioGroupItem value="AI-1" id="ai1" />
                <Label htmlFor="ai1" className="flex-1 cursor-pointer">
                  AI-1
                </Label>
                <span className="text-sm text-gray-500">
                  x{ai1Odds.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-3">
                <RadioGroupItem value="AI-2" id="ai2" />
                <Label htmlFor="ai2" className="flex-1 cursor-pointer">
                  AI-2
                </Label>
                <span className="text-sm text-gray-500">
                  x{ai2Odds.toFixed(2)}
                </span>
              </div>
            </RadioGroup>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="pt-2">
            <Button
              className="w-full"
              onClick={handlePlaceBet}
              disabled={
                !selectedAI ||
                betAmount <= 0 ||
                betAmount > balance ||
                !publicKey
              }
            >
              <TrendingUp className="mr-2" size={16} />
              Place Bet
            </Button>
          </div>

          <div className="text-sm text-gray-500 mt-2">
            Potential winnings: {getPotentialWinnings().toFixed(4)} SOL
          </div>

          {!publicKey && (
            <div className="text-sm text-amber-600 mt-2">
              Connect your wallet to place bets
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
