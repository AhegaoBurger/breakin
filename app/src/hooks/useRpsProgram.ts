// // breakin/app/src/hooks/useRpsProgram.ts
// import { Program, AnchorProvider, web3, BN } from "@coral-xyz/anchor";
// import { useConnection, useWallet } from "@solana/wallet-adapter-react";
// import { Breakin as RpsArenaProgram, IDL } from "@/types/breakin"; // Adjusted path
// import idlJson from "@/idl/breakin.json"; // Adjusted path

// // YOUR DEPLOYED PROGRAM ID
// const PROGRAM_ID = new web3.PublicKey("YOUR_ACTUAL_PROGRAM_ID_FROM_DEPLOYMENT");

// export const useRpsProgram = () => {
//   const { connection } = useConnection();
//   const wallet = useWallet();

//   const getProvider = (): AnchorProvider | null => {
//     if (!wallet.publicKey || !wallet.signTransaction) {
//       console.warn("Wallet not connected or signTransaction not available");
//       return null;
//     }
//     // Ensure wallet has signAllTransactions if you use it anywhere
//     // const providerWallet = { ...wallet, signAllTransactions: wallet.signAllTransactions! };
//     return new AnchorProvider(
//       connection,
//       wallet as any,
//       AnchorProvider.defaultOptions()
//     );
//   };

//   const getProgram = (): Program<RpsArenaProgram> | null => {
//     const provider = getProvider();
//     if (!provider) return null;
//     // Type assertion for IDL because Anchor's Program constructor expects a specific IDL type.
//     return new Program<RpsArenaProgram>(idlJson as any, PROGRAM_ID, provider);
//   };

//   // --- Admin Functions ---
//   const initializeGame = async () => {
//     const program = getProgram();
//     const provider = getProvider();
//     if (!program || !provider?.publicKey)
//       throw new Error("Program/Provider not available or wallet not connected");

//     const [gameStatePDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("game_state")],
//       program.programId
//     );

//     try {
//       const txSignature = await program.methods
//         .initializeGame()
//         .accounts({
//           gameState: gameStatePDA,
//           authority: provider.publicKey,
//           systemProgram: web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log("Game initialized successfully!", txSignature);
//       alert(`Game initialized! Game State PDA: ${gameStatePDA.toBase58()}`);
//       return gameStatePDA;
//     } catch (err) {
//       console.error("Error initializing game:", err);
//       alert(`Error initializing game: ${err}`);
//       throw err;
//     }
//   };

//   const createMatch = async (gameAuthority?: web3.PublicKey) => {
//     // Optional gameAuthority for explicit passing
//     const program = getProgram();
//     const provider = getProvider();
//     if (!program || !provider?.publicKey)
//       throw new Error("Program/Provider not available or wallet not connected");

//     const [gameStatePDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("game_state")],
//       program.programId
//     );

//     // Fetch current next_match_id from game_state
//     const gameStateAccount = await program.account.gameState.fetch(
//       gameStatePDA
//     );
//     const nextMatchId = gameStateAccount.nextMatchId; // This is a BN

//     const [bettingPoolPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("betting_pool"), nextMatchId.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     const [bettingPoolAuthorityPDA] = web3.PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("betting_pool_authority"),
//         nextMatchId.toArrayLike(Buffer, "le", 8),
//       ],
//       program.programId
//     );

//     try {
//       const txSignature = await program.methods
//         .createMatch()
//         .accounts({
//           gameState: gameStatePDA,
//           bettingPool: bettingPoolPDA,
//           bettingPoolAuthority: bettingPoolAuthorityPDA,
//           authority: gameAuthority || provider.publicKey, // Use passed authority or connected wallet
//           systemProgram: web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log(`Match #${nextMatchId.toNumber()} created!`, txSignature);
//       alert(
//         `Match #${nextMatchId.toNumber()} created! Pool PDA: ${bettingPoolPDA.toBase58()}`
//       );
//       return { matchId: nextMatchId.toNumber(), bettingPoolPDA };
//     } catch (err) {
//       console.error("Error creating match:", err);
//       alert(`Error creating match: ${err}`);
//       throw err;
//     }
//   };

//   // --- User/Betting Functions ---
//   const placeBet = async (
//     matchId: number,
//     amountSOL: number,
//     prediction: 0 | 1
//   ) => {
//     const program = getProgram();
//     const provider = getProvider();
//     if (!program || !provider?.publicKey)
//       throw new Error("Program/Provider not available or wallet not connected");

//     const matchIdBN = new BN(matchId);
//     const amountLamports = new BN(amountSOL * web3.LAMPORTS_PER_SOL);

//     const [bettingPoolPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("betting_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     const [userBetPDA] = web3.PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("user_bet"),
//         provider.publicKey.toBuffer(),
//         matchIdBN.toArrayLike(Buffer, "le", 8),
//       ],
//       program.programId
//     );

//     try {
//       const txSignature = await program.methods
//         .placeBet(amountLamports, prediction) // prediction is already u8
//         .accounts({
//           bettingPool: bettingPoolPDA,
//           userBet: userBetPDA,
//           better: provider.publicKey,
//           systemProgram: web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log("Bet placed successfully!", txSignature);
//       alert(`Bet placed for ${amountSOL} SOL on Match #${matchId}!`);
//     } catch (err) {
//       console.error("Error placing bet:", err);
//       alert(`Error placing bet: ${err}`);
//       throw err;
//     }
//   };

//   const submitMatchResult = async (
//     matchId: number,
//     winner: 0 | 1 | 2,
//     matchAuthority?: web3.PublicKey
//   ) => {
//     const program = getProgram();
//     const provider = getProvider();
//     if (!program || !provider?.publicKey)
//       throw new Error("Program/Provider not available or wallet not connected");

//     const matchIdBN = new BN(matchId);
//     const [gameStatePDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("game_state")],
//       program.programId
//     );
//     const [bettingPoolPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("betting_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     const [matchRecordPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("match_record"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );

//     try {
//       const txSignature = await program.methods
//         .submitResult(winner)
//         .accounts({
//           gameState: gameStatePDA,
//           bettingPool: bettingPoolPDA,
//           matchRecord: matchRecordPDA,
//           authority: matchAuthority || provider.publicKey, // The authority of the betting_pool
//           systemProgram: web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log(`Result submitted for Match #${matchId}`, txSignature);
//       alert(`Result submitted for Match #${matchId}: Winner type ${winner}`);
//     } catch (err) {
//       console.error("Error submitting result:", err);
//       alert(`Error submitting result: ${err}`);
//       throw err;
//     }
//   };

//   const claimWinnings = async (matchId: number) => {
//     const program = getProgram();
//     const provider = getProvider();
//     if (!program || !provider?.publicKey)
//       throw new Error("Program/Provider not available or wallet not connected");

//     const matchIdBN = new BN(matchId);

//     const [bettingPoolPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("betting_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     const [bettingPoolAuthorityPDA] = web3.PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("betting_pool_authority"),
//         matchIdBN.toArrayLike(Buffer, "le", 8),
//       ],
//       program.programId
//     );
//     const [matchRecordPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("match_record"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     const [userBetPDA] = web3.PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("user_bet"),
//         provider.publicKey.toBuffer(),
//         matchIdBN.toArrayLike(Buffer, "le", 8),
//       ],
//       program.programId
//     );
//     try {
//       const txSignature = await program.methods
//         .claimWinnings()
//         .accounts({
//           bettingPool: bettingPoolPDA,
//           bettingPoolAuthority: bettingPoolAuthorityPDA,
//           matchRecord: matchRecordPDA,
//           userBet: userBetPDA,
//           better: provider.publicKey,
//           systemProgram: web3.SystemProgram.programId,
//         })
//         .rpc();
//       console.log(`Winnings claimed for Match #${matchId}`, txSignature);
//       alert(`Winnings claimed for Match #${matchId}! Check your balance.`);
//     } catch (err) {
//       console.error("Error claiming winnings:", err);
//       alert(`Error claiming winnings: ${err}`);
//       throw err;
//     }
//   };

//   // --- Fetching Data Functions ---
//   const fetchGameState = async () => {
//     const program = getProgram();
//     if (!program) return null;
//     const [gameStatePDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("game_state")],
//       program.programId
//     );
//     try {
//       return await program.account.gameState.fetch(gameStatePDA);
//     } catch (e) {
//       console.warn("Failed to fetch game state, might not be initialized.", e);
//       return null;
//     }
//   };

//   const fetchBettingPool = async (matchId: number) => {
//     const program = getProgram();
//     if (!program) return null;
//     const matchIdBN = new BN(matchId);
//     const [bettingPoolPDA] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("betting_pool"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     try {
//       return await program.account.bettingPool.fetch(bettingPoolPDA);
//     } catch (e) {
//       console.warn(`Failed to fetch betting pool for match ${matchId}`, e);
//       return null;
//     }
//   };
//   const fetchMatchRecord = async (matchId: number) => {
//     const program = getProgram();
//     if (!program) return null;
//     const matchIdBN = new BN(matchId);
//     const [pda] = web3.PublicKey.findProgramAddressSync(
//       [Buffer.from("match_record"), matchIdBN.toArrayLike(Buffer, "le", 8)],
//       program.programId
//     );
//     try {
//       return await program.account.matchRecord.fetch(pda);
//     } catch (e) {
//       console.warn(`Failed to fetch match record for match ${matchId}`, e);
//       return null;
//     }
//   };

//   const fetchUserBet = async (matchId: number, user: web3.PublicKey) => {
//     const program = getProgram();
//     if (!program) return null;
//     const matchIdBN = new BN(matchId);
//     const [pda] = web3.PublicKey.findProgramAddressSync(
//       [
//         Buffer.from("user_bet"),
//         user.toBuffer(),
//         matchIdBN.toArrayLike(Buffer, "le", 8),
//       ],
//       program.programId
//     );
//     try {
//       return await program.account.userBet.fetch(pda);
//     } catch (e) {
//       // This is expected if user hasn't bet on this match
//       // console.info(`No user bet found for user ${user.toBase58()} on match ${matchId}`);
//       return null;
//     }
//   };

//   return {
//     initializeGame,
//     createMatch,
//     placeBet,
//     submitMatchResult,
//     claimWinnings,
//     fetchGameState,
//     fetchBettingPool,
//     fetchMatchRecord,
//     fetchUserBet,
//     getProgram, // Expose for direct use if needed
//   };
// };
