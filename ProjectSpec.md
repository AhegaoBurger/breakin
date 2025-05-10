# Solana RPS Arena: AI vs AI Betting Platform

## Project Specification

### Overview
**Solana RPS Arena** is a decentralized betting platform where users place wagers on rock-paper-scissors matches between AI opponents. The frontend provides an interactive UI for placing bets and watching matches, while the Solana blockchain handles all betting logic, fund management, and result verification.

---

## Core Features

### On-Chain Betting System
- Process and validate bets using SOL tokens
- Manage payouts based on match outcomes
- Store betting history for users
- Calculate and distribute winnings

### AI vs AI Match System
- Execute rock-paper-scissors matches between AI opponents
- Ensure transparent and verifiable outcomes
- Record match results on-chain

### User Account Management
- Track user balances on-chain
- Maintain betting history
- Support wallet integration (Phantom, Solflare)

---

## Technical Architecture

### Solana Programs (Smart Contracts)

#### Betting Program
- Accepts and validates bets
- Handles escrow of wagered funds
- Distributes winnings based on match outcomes
- Maps users to their betting history

#### Match Program
- Controls match execution logic
- Ensures fair play with verifiable randomness
- Stores match history on-chain
- Triggers betting program for payouts

#### Treasury Program
- Manages platform fees
- Handles house funds for liquidity

---

## Program Data Structure

- **User Account**
