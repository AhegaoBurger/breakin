"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, Check, AlertCircle } from "lucide-react";
import { useUser } from "./user-provider";

export default function WalletConnect() {
  const { connectWallet, walletAddress, walletBalance } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletInput, setWalletInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    setError(null);

    // Simulate wallet connection (in a real app, this would use web3.js or ethers.js)
    setTimeout(() => {
      if (
        walletInput &&
        walletInput.startsWith("0x") &&
        walletInput.length === 42
      ) {
        connectWallet(walletInput);
        setIsConnecting(false);
        setOpen(false);
      } else {
        setError("Please enter a valid wallet address (0x... format)");
        setIsConnecting(false);
      }
    }, 1500);
  };

  // Format wallet address for display
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={walletAddress ? "outline" : "default"}
          className="gap-2"
        >
          <Wallet size={16} />
          {walletAddress ? formatAddress(walletAddress) : "Connect Wallet"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect your wallet</DialogTitle>
        </DialogHeader>
        {walletAddress ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check size={20} />
              <span>Wallet connected</span>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Address</div>
              <div className="font-mono text-sm">{walletAddress}</div>
              <div className="mt-2 text-sm text-gray-500">Balance</div>
              <div className="font-medium">{walletBalance} ETH</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-address">Wallet Address</Label>
              <Input
                id="wallet-address"
                placeholder="0x..."
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
              />
              {error && (
                <div className="flex items-center gap-2 text-red-500 text-sm mt-1">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                For demo purposes, enter any valid Ethereum address format
                (0x... with 42 characters)
              </p>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full"
            >
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
