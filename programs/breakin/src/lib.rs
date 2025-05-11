// breakin/programs/breakin/src/lib.rs
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    clock::Clock,
    program::invoke_signed, // For CPI invoke_signed if needed for PDA signing complex tx
    system_instruction,     // For system_instruction::transfer
    system_program,         // For system_program::ID
};
use std::mem::size_of;

// IMPORTANT: Replace with your actual Program ID after first deployment!
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod solana_rps_arena {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        game_state.authority = ctx.accounts.authority.key();
        game_state.next_match_id = 1;
        game_state.total_matches = 0;
        // The bump is automatically set by Anchor if `bump` is in the macro
        // and the struct has a `pub bump: u8` field.
        // To explicitly set it from ctx.bumps:
        game_state.bump = ctx.bumps.game_state; // Access bump directly from context's Bumps struct
        msg!(
            "RPS Arena GameState initialized by: {}. Next Match ID: {}",
            game_state.authority,
            game_state.next_match_id
        );
        Ok(())
    }

    pub fn create_match(
        ctx: Context<CreateMatch>,
        min_bet_threshold_lamports: u64,
        betting_duration_slots: u64,
    ) -> Result<()> {
        let game_state = &mut ctx.accounts.game_state;
        let betting_pool = &mut ctx.accounts.betting_pool;
        let clock = Clock::get()?;

        betting_pool.match_id = game_state.next_match_id;
        betting_pool.total_ai1_bets = 0;
        betting_pool.total_ai2_bets = 0;
        betting_pool.status = MatchStatus::OpenForBetting;
        betting_pool.authority = ctx.accounts.match_creator_signer.key();
        betting_pool.min_bet_threshold = min_bet_threshold_lamports;
        betting_pool.betting_deadline_slot = clock
            .slot
            .checked_add(betting_duration_slots)
            .ok_or(RpsError::Overflow)?;
        betting_pool.bump = ctx.bumps.betting_pool;
        betting_pool.pool_authority_bump = ctx.bumps.betting_pool_authority;

        game_state.next_match_id = game_state
            .next_match_id
            .checked_add(1)
            .ok_or(RpsError::Overflow)?;

        msg!(
            "Match #{} created by {}. Betting open until slot ~{}. Min threshold: {} lamports. Pool PDA: {}",
            betting_pool.match_id,
            betting_pool.authority,
            betting_pool.betting_deadline_slot,
            betting_pool.min_bet_threshold,
            betting_pool.key()
        );
        Ok(())
    }

    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, prediction_raw: u8) -> Result<()> {
        let betting_pool = &mut ctx.accounts.betting_pool;
        let clock = Clock::get()?;

        require!(
            betting_pool.status == MatchStatus::OpenForBetting,
            RpsError::BettingClosedOrNotOpen
        );
        require!(
            clock.slot < betting_pool.betting_deadline_slot,
            RpsError::BettingDeadlinePassed
        );
        require!(amount > 0, RpsError::BetAmountZero);

        let prediction = match prediction_raw {
            0 => Prediction::Ai1,
            1 => Prediction::Ai2,
            _ => return err!(RpsError::InvalidPrediction),
        };

        // Transfer SOL from better to betting_pool PDA
        let cpi_accounts = system_instruction::Transfer {
            // Use system_instruction::Transfer for struct
            from_pubkey: ctx.accounts.better.key(),
            to_pubkey: ctx.accounts.betting_pool.key(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        // Using invoke for direct SOL transfer
        anchor_lang::solana_program::program::invoke(
            &system_instruction::transfer(
                // Use system_instruction::transfer for function
                cpi_accounts.from_pubkey,
                cpi_accounts.to_pubkey,
                amount,
            ),
            &[
                ctx.accounts.better.to_account_info(),
                ctx.accounts.betting_pool.to_account_info(),
                cpi_program, // System program account info
            ],
        )?;

        match prediction {
            Prediction::Ai1 => {
                betting_pool.total_ai1_bets = betting_pool
                    .total_ai1_bets
                    .checked_add(amount)
                    .ok_or(RpsError::Overflow)?;
            }
            Prediction::Ai2 => {
                betting_pool.total_ai2_bets = betting_pool
                    .total_ai2_bets
                    .checked_add(amount)
                    .ok_or(RpsError::Overflow)?;
            }
        }

        let user_bet = &mut ctx.accounts.user_bet;
        user_bet.better = ctx.accounts.better.key();
        user_bet.match_id = betting_pool.match_id;
        user_bet.prediction = prediction;
        user_bet.amount = amount;
        user_bet.claimed = false;
        user_bet.bump = ctx.bumps.user_bet;

        msg!(
            "User {} bet {} on {:?} for Match #{}. Current slot: {}, Deadline: {}. UserBet PDA: {}",
            user_bet.better,
            amount,
            prediction,
            user_bet.match_id,
            clock.slot,
            betting_pool.betting_deadline_slot,
            user_bet.key()
        );
        Ok(())
    }

    pub fn check_betting_deadline(ctx: Context<CheckBettingDeadline>) -> Result<()> {
        let betting_pool = &mut ctx.accounts.betting_pool;
        let clock = Clock::get()?;

        require!(
            betting_pool.status == MatchStatus::OpenForBetting,
            RpsError::MatchNotOpenOrAlreadyProcessed
        );
        require!(
            clock.slot >= betting_pool.betting_deadline_slot,
            RpsError::BettingDeadlineNotReached
        );

        let total_bets_placed = betting_pool
            .total_ai1_bets
            .checked_add(betting_pool.total_ai2_bets)
            .ok_or(RpsError::Overflow)?;

        if total_bets_placed >= betting_pool.min_bet_threshold {
            betting_pool.status = MatchStatus::AwaitingResolution;
            msg!("Match #{} deadline passed (Slot {} >= {}). Threshold met ({} >= {}). Now AwaitingResolution.",
                 betting_pool.match_id, clock.slot, betting_pool.betting_deadline_slot, total_bets_placed, betting_pool.min_bet_threshold);
        } else {
            betting_pool.status = MatchStatus::CancelledDueToLowBets;
            msg!("Match #{} deadline passed (Slot {} >= {}). Threshold NOT met ({} < {}). Cancelled, bets refundable.",
                 betting_pool.match_id, clock.slot, betting_pool.betting_deadline_slot, total_bets_placed, betting_pool.min_bet_threshold);
        }
        Ok(())
    }

    pub fn resolve_match(
        ctx: Context<ResolveMatch>,
        ai1_move_raw: u8,
        ai2_move_raw: u8,
    ) -> Result<()> {
        let betting_pool = &mut ctx.accounts.betting_pool;
        let match_record = &mut ctx.accounts.match_record;
        let game_state = &mut ctx.accounts.game_state;

        require!(
            betting_pool.status == MatchStatus::AwaitingResolution,
            RpsError::MatchNotAwaitingResolution
        );

        let ai1_move = Move::from_u8(ai1_move_raw)?;
        let ai2_move = Move::from_u8(ai2_move_raw)?;
        // Call the module-level (now pub) helper function
        let winner = crate::determine_rps_winner(ai1_move, ai2_move);

        match_record.match_id = betting_pool.match_id;
        match_record.timestamp = Clock::get()?.unix_timestamp;
        match_record.ai1_move = ai1_move;
        match_record.ai2_move = ai2_move;
        match_record.winner = winner;
        match_record.total_bet_amount = betting_pool
            .total_ai1_bets
            .checked_add(betting_pool.total_ai2_bets)
            .ok_or(RpsError::Overflow)?;
        match_record.bump = ctx.bumps.match_record;

        betting_pool.status = MatchStatus::Settled;
        game_state.total_matches = game_state
            .total_matches
            .checked_add(1)
            .ok_or(RpsError::Overflow)?;

        msg!("Match #{} resolved. AI1: {:?}, AI2: {:?}. Winner: {:?}. Total bets: {}. MatchRecord PDA: {}",
            match_record.match_id, ai1_move, ai2_move, winner, match_record.total_bet_amount, match_record.key());
        Ok(())
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        let betting_pool = &ctx.accounts.betting_pool;
        let user_bet = &mut ctx.accounts.user_bet;

        require!(!user_bet.claimed, RpsError::AlreadyClaimed);
        require!(
            user_bet.match_id == betting_pool.match_id,
            RpsError::MatchIdMismatch
        );

        let mut payout_amount = 0u64;

        match betting_pool.status {
            MatchStatus::Settled => {
                let match_record = &ctx.accounts.match_record;
                require!(
                    match_record.match_id == betting_pool.match_id,
                    RpsError::MatchIdMismatchInRecord
                );

                let user_predicted_winner_type = match user_bet.prediction {
                    Prediction::Ai1 => Winner::Ai1,
                    Prediction::Ai2 => Winner::Ai2,
                };

                if match_record.winner == Winner::Draw {
                    payout_amount = user_bet.amount;
                } else if user_predicted_winner_type == match_record.winner {
                    let (total_bets_on_winner, total_bets_on_loser) = match match_record.winner {
                        Winner::Ai1 => (betting_pool.total_ai1_bets, betting_pool.total_ai2_bets),
                        Winner::Ai2 => (betting_pool.total_ai2_bets, betting_pool.total_ai1_bets),
                        Winner::Draw => (0, 0),
                    };

                    if total_bets_on_winner == 0 {
                        return err!(RpsError::NoWinningBets);
                    }

                    let user_profit = total_bets_on_loser
                        .checked_mul(user_bet.amount)
                        .ok_or(RpsError::Overflow)?
                        .checked_div(total_bets_on_winner)
                        .ok_or(RpsError::DivisionByZero)?;

                    payout_amount = user_bet
                        .amount
                        .checked_add(user_profit)
                        .ok_or(RpsError::Overflow)?;
                } else {
                    payout_amount = 0;
                }
            }
            MatchStatus::CancelledDueToLowBets => {
                payout_amount = user_bet.amount;
                msg!(
                    "Match #{} was cancelled (low bets). Refunding bet of {} to user {}.",
                    betting_pool.match_id,
                    payout_amount,
                    user_bet.better
                );
            }
            _ => return err!(RpsError::MatchNotReadyForClaimOrRefund),
        }

        if payout_amount > 0 {
            let authority_seeds = &[
                b"betting_pool_authority".as_ref(),
                &betting_pool.match_id.to_le_bytes(),
                &[betting_pool.pool_authority_bump],
            ];
            let signer_seeds = &[&authority_seeds[..]];

            // CPI for SOL transfer from PDA
            let cpi_accounts_tx = system_instruction::Transfer {
                // Use system_instruction::Transfer for struct
                from_pubkey: ctx.accounts.betting_pool.key(),
                to_pubkey: ctx.accounts.better.key(),
            };

            anchor_lang::solana_program::program::invoke_signed(
                &system_instruction::transfer(
                    // Use system_instruction::transfer for function
                    cpi_accounts_tx.from_pubkey,
                    cpi_accounts_tx.to_pubkey,
                    payout_amount,
                ),
                &[
                    ctx.accounts.betting_pool.to_account_info(),
                    ctx.accounts.better.to_account_info(),
                    ctx.accounts.system_program.to_account_info(), // System program
                ],
                signer_seeds, // PDA signs
            )?;

            msg!(
                "Paid/Refunded {} to user {} for Match #{}",
                payout_amount,
                user_bet.better,
                user_bet.match_id
            );
        }

        user_bet.claimed = true;
        Ok(())
    }
} // end of #[program] mod

// Helper function for RPS logic - moved outside the #[program] mod
// and made pub if called from within the program mod, or keep private if only used here.
// If it's only used by instructions within `solana_rps_arena`, it doesn't need to be `pub` at crate level.
pub fn determine_rps_winner(move1: Move, move2: Move) -> Winner {
    if move1 == move2 {
        Winner::Draw
    } else if (move1 == Move::Rock && move2 == Move::Scissors)
        || (move1 == Move::Paper && move2 == Move::Rock)
        || (move1 == Move::Scissors && move2 == Move::Paper)
    {
        Winner::Ai1
    } else {
        Winner::Ai2
    }
}

// --- ACCOUNTS CONTEXTS ---
// Note on bumps in Contexts:
// If `bump` is specified in the `#[account(...)]` macro, Anchor can often infer it.
// If you have `pub my_pda_bump: u8` in your Context struct, Anchor might populate it.
// Accessing via `ctx.bumps.pda_name` is generally safer and more explicit.

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + GameState::LEN,
        seeds = [b"game_state".as_ref()], // Use .as_ref() for byte string literals
        bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(min_bet_threshold_lamports: u64, betting_duration_slots: u64)]
pub struct CreateMatch<'info> {
    #[account(
        mut,
        seeds = [b"game_state".as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(
        init,
        payer = match_creator_signer,
        space = 8 + BettingPool::LEN,
        seeds = [b"betting_pool".as_ref(), &game_state.next_match_id.to_le_bytes()],
        bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    /// CHECK: PDA acting as the authority for the betting_pool account's SOL.
    #[account(
        seeds = [b"betting_pool_authority".as_ref(), &game_state.next_match_id.to_le_bytes()],
        bump
    )]
    pub betting_pool_authority: AccountInfo<'info>,
    #[account(mut)]
    pub match_creator_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, prediction_raw: u8)] // match_id is implicitly from betting_pool account
pub struct PlaceBet<'info> {
    // The betting_pool account is passed by the client, identified by its match_id
    // The client forms this account by deriving its PDA using the match_id
    #[account(
        mut,
        seeds = [b"betting_pool".as_ref(), &betting_pool.match_id.to_le_bytes()],
        bump = betting_pool.bump // Assumes betting_pool is already loaded by client with correct bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        init,
        payer = better,
        space = 8 + UserBet::LEN,
        seeds = [
            b"user_bet".as_ref(),
            better.key().as_ref(),
            &betting_pool.match_id.to_le_bytes()
        ],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub better: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(match_id_arg: u64)]
pub struct CheckBettingDeadline<'info> {
    #[account(
        mut,
        seeds = [b"betting_pool".as_ref(), &match_id_arg.to_le_bytes()],
        bump = betting_pool.bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
}

#[derive(Accounts)]
#[instruction(ai1_move_raw: u8, ai2_move_raw: u8)]
pub struct ResolveMatch<'info> {
    #[account(
        mut,
        seeds = [b"game_state".as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,
    #[account(
        mut,
        seeds = [b"betting_pool".as_ref(), &betting_pool.match_id.to_le_bytes()],
        bump = betting_pool.bump,
        constraint = betting_pool.authority == resolver_signer.key() @ RpsError::Unauthorized
    )]
    pub betting_pool: Account<'info, BettingPool>,
    #[account(
        init,
        payer = resolver_signer,
        space = 8 + MatchRecord::LEN,
        seeds = [b"match_record".as_ref(), &betting_pool.match_id.to_le_bytes()],
        bump
    )]
    pub match_record: Account<'info, MatchRecord>,
    #[account(mut)]
    pub resolver_signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(
        mut,
        seeds = [b"betting_pool".as_ref(), &user_bet.match_id.to_le_bytes()], // Use user_bet.match_id to find the pool
        bump = betting_pool.bump
    )]
    pub betting_pool: Account<'info, BettingPool>,
    /// CHECK: PDA authority for the betting_pool account.
    #[account(
        seeds = [b"betting_pool_authority".as_ref(), &user_bet.match_id.to_le_bytes()],
        bump = betting_pool.pool_authority_bump // Use the bump stored in the betting_pool account
    )]
    pub betting_pool_authority: AccountInfo<'info>,
    // MatchRecord account - client must provide this PDA.
    // If CancelledDueToLowBets, this account is not initialized, but its address must still be passed.
    // The on-chain logic conditionally accesses its data.
    // For production, using Option<Account<...>> or AccountInfo and manual deserialize is better
    // if the account might not exist.
    #[account(
        seeds = [b"match_record".as_ref(), &user_bet.match_id.to_le_bytes()],
        bump = match_record.bump // This assumes match_record account exists to read its bump.
                                  // If it may not exist, this field should be AccountInfo<'info>
    )]
    pub match_record: Account<'info, MatchRecord>, // Consider AccountInfo<'info> if it might not be initialized.
    #[account(
        mut,
        seeds = [
            b"user_bet".as_ref(),
            better.key().as_ref(),
            &user_bet.match_id.to_le_bytes()
        ],
        bump = user_bet.bump,
        constraint = user_bet.better == better.key() @ RpsError::UserBetOwnerMismatch
    )]
    pub user_bet: Account<'info, UserBet>,
    #[account(mut)]
    pub better: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// --- DATA STRUCTURES (ACCOUNTS & ENUMS) ---
#[account]
#[derive(Default)] // Add Default for easier testing if needed
pub struct GameState {
    pub authority: Pubkey,
    pub next_match_id: u64,
    pub total_matches: u64,
    pub bump: u8,
}
impl GameState {
    const LEN: usize = 32 + 8 + 8 + 1;
}

#[account]
#[derive(Default)]
pub struct BettingPool {
    pub authority: Pubkey,
    pub match_id: u64,
    pub total_ai1_bets: u64,
    pub total_ai2_bets: u64,
    pub status: MatchStatus,
    pub bump: u8,
    pub pool_authority_bump: u8,
    pub betting_deadline_slot: u64,
    pub min_bet_threshold: u64,
}
impl BettingPool {
    const LEN: usize = 32 + 8 + 8 + 8 + 1 + 1 + 1 + 8 + 8;
}

#[account]
#[derive(Default)]
pub struct MatchRecord {
    pub match_id: u64,
    pub timestamp: i64,
    pub ai1_move: Move,
    pub ai2_move: Move,
    pub winner: Winner,
    pub total_bet_amount: u64,
    pub bump: u8,
}
impl MatchRecord {
    const LEN: usize = 8 + 8 + 1 + 1 + 1 + 8 + 1;
}

#[account]
#[derive(Default)]
pub struct UserBet {
    pub better: Pubkey,
    pub match_id: u64,
    pub prediction: Prediction,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}
impl UserBet {
    const LEN: usize = 32 + 8 + 1 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum MatchStatus {
    #[default] // Add default variant
    OpenForBetting,
    AwaitingResolution,
    Settled,
    CancelledDueToLowBets,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Move {
    #[default]
    Rock,
    Paper,
    Scissors,
}
impl Move {
    fn from_u8(value: u8) -> Result<Self> {
        match value {
            0 => Ok(Move::Rock),
            1 => Ok(Move::Paper),
            2 => Ok(Move::Scissors),
            _ => Err(RpsError::InvalidMoveValue.into()),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Winner {
    #[default]
    Ai1, // Defaulting, though Draw might be more neutral
    Ai2,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Prediction {
    #[default]
    Ai1,
    Ai2,
}

#[error_code]
pub enum RpsError {
    #[msg("A numeric operation caused an overflow.")]
    Overflow,
    #[msg("Action unauthorized. Signer does not have required permissions.")]
    Unauthorized,
    #[msg("Betting is closed or not yet open for this match.")]
    BettingClosedOrNotOpen,
    #[msg("Betting deadline for this match has already passed.")]
    BettingDeadlinePassed,
    #[msg("Bet amount must be greater than zero.")]
    BetAmountZero,
    #[msg("Invalid prediction value (must be 0 for AI1 or 1 for AI2).")]
    InvalidPrediction,
    #[msg("The provided match_id does not match the account's match_id.")]
    MatchIdMismatch,
    #[msg("The winner for this match has not been set yet (internal error).")]
    WinnerNotSet,
    #[msg("This bet has already been claimed.")]
    AlreadyClaimed,
    #[msg("Match is not in a state where claims or refunds are allowed.")]
    MatchNotReadyForClaimOrRefund,
    #[msg("No bets were placed on the winning outcome, or division by zero would occur.")]
    NoWinningBets,
    #[msg("The signer does not own this bet receipt.")]
    UserBetOwnerMismatch,
    #[msg("Division by zero occurred during payout calculation.")]
    DivisionByZero,
    #[msg("Invalid move value (must be 0 for Rock, 1 for Paper, 2 for Scissors).")]
    InvalidMoveValue,
    #[msg("Betting deadline for this match has not been reached yet.")]
    BettingDeadlineNotReached,
    #[msg("This match is not open for betting or has already been processed by deadline check.")]
    MatchNotOpenOrAlreadyProcessed,
    #[msg("Match is not in AwaitingResolution state, cannot resolve with AI moves.")]
    MatchNotAwaitingResolution,
    #[msg("Match record's ID does not match the betting pool's ID during claim.")]
    MatchIdMismatchInRecord,
}
