"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "./user-provider";
import { Coins, TrendingUp, Users } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function BettingPool() {
  const { bettingPools } = useUser();
  const { publicKey } = useWallet();

  // Calculate total pool size
  const totalPoolSize = bettingPools.ai1.total + bettingPools.ai2.total;

  // Calculate odds based on pool sizes
  const calculateOdds = (poolSize: number) => {
    if (totalPoolSize === 0 || poolSize === 0) return 2.0;
    return Number.parseFloat((totalPoolSize / poolSize).toFixed(2));
  };

  const ai1Odds = calculateOdds(bettingPools.ai1.total);
  const ai2Odds = calculateOdds(bettingPools.ai2.total);

  // Calculate percentages for the progress bar
  const ai1Percentage =
    totalPoolSize > 0 ? (bettingPools.ai1.total / totalPoolSize) * 100 : 50;
  const ai2Percentage =
    totalPoolSize > 0 ? (bettingPools.ai2.total / totalPoolSize) * 100 : 50;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center">
          <Users className="mr-2" size={18} />
          <span>Live Betting Pool</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <div className="font-medium">
                AI-1{" "}
                <span className="text-purple-600">
                  ({bettingPools.ai1.bettors.length} bettors)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Coins size={14} className="text-amber-500" />
                <span>{bettingPools.ai1.total.toFixed(4)} SOL</span>
              </div>
            </div>
            <Progress value={ai1Percentage} className="h-2" />
            <div className="flex justify-between text-xs">
              <span>
                Pool: {((ai1Percentage / 100) * totalPoolSize).toFixed(4)} SOL
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp size={12} />
                {ai1Odds}x
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <div className="font-medium">
                AI-2{" "}
                <span className="text-amber-600">
                  ({bettingPools.ai2.bettors.length} bettors)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Coins size={14} className="text-amber-500" />
                <span>{bettingPools.ai2.total.toFixed(4)} SOL</span>
              </div>
            </div>
            <Progress value={ai2Percentage} className="h-2" />
            <div className="flex justify-between text-xs">
              <span>
                Pool: {((ai2Percentage / 100) * totalPoolSize).toFixed(4)} SOL
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp size={12} />
                {ai2Odds}x
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-medium">Recent Bets</h4>
              <span className="text-xs text-gray-500">
                Total Pool: {totalPoolSize.toFixed(4)} SOL
              </span>
            </div>
            <ScrollArea className="h-[120px] rounded-md border p-2">
              {[...bettingPools.ai1.bettors, ...bettingPools.ai2.bettors]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10)
                .map((bettor) => (
                  <div
                    key={bettor.id}
                    className="flex justify-between py-1 text-sm"
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className={
                          bettor.selectedAI === "AI-1"
                            ? "text-purple-600 font-medium"
                            : "text-amber-600 font-medium"
                        }
                      >
                        {bettor.selectedAI}
                      </span>
                      <span className="text-xs text-gray-500">
                        {bettor.address === publicKey?.toBase58()
                          ? "(You)"
                          : `(${bettor.address.substring(
                              0,
                              4
                            )}...${bettor.address.substring(
                              bettor.address.length - 4
                            )})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Coins size={12} className="text-amber-500" />
                      <span>{bettor.amount.toFixed(4)} SOL</span>
                    </div>
                  </div>
                ))}
              {totalPoolSize === 0 && (
                <div className="py-4 text-center text-sm text-gray-500">
                  No bets placed yet
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
