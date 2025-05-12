import { Suspense } from "react";
import GameArena from "@/components/game-arena";
import BettingPanel from "@/components/betting-panel";
import MatchHistory from "@/components/match-history";
import BettingPool from "@/components/betting-pool";
import WalletConnect from "@/components/wallet-connect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserProvider } from "@/components/user-provider";

export default function Home() {
  return (
    <UserProvider>
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">AI vs AI Rock Paper Scissors</h1>
          <WalletConnect />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Suspense fallback={<div>Loading game...</div>}>
              <GameArena />
            </Suspense>

            <BettingPool />
          </div>

          <div className="space-y-6">
            <BettingPanel />

            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="history">Match History</TabsTrigger>
                <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              </TabsList>
              <TabsContent value="history">
                <MatchHistory />
              </TabsContent>
              <TabsContent value="leaderboard">
                <div className="bg-white p-4 rounded-lg shadow">
                  <h3 className="font-medium mb-2">Top Bettors</h3>
                  <p className="text-gray-500 text-sm">
                    Leaderboard coming soon...
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </UserProvider>
  );
}
