"use client";

import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export default function WalletConnect() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error("Error fetching balance:", error);
        setBalance(null);
      }
    };

    fetchBalance();
    // Set up an interval to refresh the balance
    const intervalId = setInterval(fetchBalance, 10000);

    return () => clearInterval(intervalId);
  }, [publicKey, connection]);

  // Format wallet address for display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  return (
    <div className="flex items-center gap-4">
      {publicKey && balance !== null && (
        <div className="text-sm">
          <span className="text-gray-500">Balance:</span>{" "}
          <span className="font-medium">{balance.toFixed(4)} SOL</span>
        </div>
      )}
      <WalletMultiButton className="!bg-primary hover:!bg-primary/90" />
    </div>
  );
}
